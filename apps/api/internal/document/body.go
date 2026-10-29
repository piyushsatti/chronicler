package document

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	redactedMarker   = "> [!redacted]"
	redactedBar      = "█"   // U+2588 FULL BLOCK
	redactedBucket   = 20    // runes; D45 rounds each hidden line up to a multiple
	redactedMaxLines = 100   // shape lines (bars or blanks) per hidden span
	redactedMaxBars  = 200   // bars per shape line
	redactedBudget   = 10000 // bar runes per projected body, spent in span order
)

// redactedBlock is the D45 placeholder for one hidden span: the fixed
// `> [!redacted]` line, then one quoted bar line per hidden text line with its
// rune length rounded up to the next multiple of redactedBucket. A blank
// hidden line stays a blank quote line. Quote prefixes and `[!…]` callout
// tokens are syntax, not hidden text: a line holding only marker tokens (the
// usual `> [!dm]` header) adds no bar, and a bare marker line counts the text
// beside its marker. The result carries the span's shape, never its bytes.
// Amplification is capped: at most redactedMaxBars bars per line and
// redactedMaxLines shape lines per span, and the bars of the whole projection
// draw on one budget (redactedBudget). A line that the caps or the remaining
// budget cannot show, and every line after it, folds into one final
// `> +N more lines` count.
func redactedBlock(hidden string, budget *int) string {
	lines := []string{redactedMarker}
	more := 0
	for _, line := range strings.Split(hidden, "\n") {
		text, hadMarker := stripCalloutTokens(strings.TrimLeft(line, " \t>"))
		text = strings.TrimSpace(text)
		runes := utf8.RuneCountInString(text)
		if runes == 0 && hadMarker {
			continue
		}
		bucketed := min((runes+redactedBucket-1)/redactedBucket*redactedBucket, redactedMaxBars)
		if more > 0 || len(lines) > redactedMaxLines || bucketed > *budget || (runes == 0 && *budget == 0) {
			more++
			continue
		}
		if runes == 0 {
			lines = append(lines, ">")
			continue
		}
		*budget -= bucketed
		lines = append(lines, "> "+strings.Repeat(redactedBar, bucketed))
	}
	if more == 1 {
		lines = append(lines, "> +1 more line")
	} else if more > 1 {
		lines = append(lines, "> +"+strconv.Itoa(more)+" more lines")
	}
	return strings.Join(lines, "\n")
}

// startsWithContent reports whether a projected part's first line is
// non-blank, so a placeholder before it needs a blank line to end its quote.
func startsWithContent(part string) bool {
	first, _, _ := strings.Cut(part, "\n")
	return strings.TrimSpace(first) != ""
}

// stripCalloutTokens removes each closed `[!…]` token using the same token
// boundary as classifyMarkerLine: the first `]` after the opener ends it.
func stripCalloutTokens(line string) (string, bool) {
	var out strings.Builder
	found := false
	for {
		opener := strings.Index(line, "[!")
		if opener < 0 {
			break
		}
		close := strings.IndexByte(line[opener+2:], ']')
		if close < 0 {
			break
		}
		out.WriteString(line[:opener])
		line = line[opener+2+close+1:]
		found = true
	}
	out.WriteString(line)
	return out.String(), found
}

// July 30's accepted marker seam fixes this lexer charset independently of
// members.handle storage. The shared fixture records the same exact value.
var markerHandlePattern = regexp.MustCompile(`^@[A-Za-z0-9_.-]+$`)

type bodySpan struct {
	Text    string   `json:"text"`
	Policy  []string `json:"policy"` // nil: unscoped; empty: impossible audience
	Spoiler bool     `json:"spoiler"`
}

// bodyGroup is one classification unit of parseBody: a blockquote run with
// lazy continuation lines, or one bare line. Start is its 0-based source line.
type bodyGroup struct {
	Start   int
	Lines   []string
	Policy  []string // nil: unscoped; empty: impossible audience
	Spoiler bool
}

// scanBodyGroups is the single marker walk. parseBody merges its unscoped
// groups into spans; AuditBody reports its scoped groups with line numbers.
func scanBodyGroups(body string) []bodyGroup {
	lines := strings.Split(body, "\n")
	groups := []bodyGroup{}
	for i := 0; i < len(lines); {
		end := i + 1
		if isBlockquote(lines[i]) {
			for end < len(lines) && strings.TrimSpace(lines[end]) != "" && (isBlockquote(lines[end]) || !bodyBlockStartPattern.MatchString(lines[end])) {
				end++
			}
		}
		policy, spoiler := classifyMarkers(lines[i:end])
		groups = append(groups, bodyGroup{Start: i, Lines: lines[i:end], Policy: policy, Spoiler: spoiler})
		i = end
	}
	return groups
}

// parseBody classifies each quote and its lazy lines once. Bare markers
// scope only their own line. It is a closed marker classifier, not a renderer.
func parseBody(body string) []bodySpan {
	spans := []bodySpan{}
	pending := []string{}
	flush := func() {
		if len(pending) > 0 {
			spans = append(spans, bodySpan{Text: strings.Join(pending, "\n")})
			pending = nil
		}
	}
	for _, group := range scanBodyGroups(body) {
		if group.Policy == nil && !group.Spoiler {
			pending = append(pending, group.Lines...)
		} else {
			flush()
			spans = append(spans, bodySpan{Text: strings.Join(group.Lines, "\n"), Policy: group.Policy, Spoiler: group.Spoiler})
		}
	}
	flush()
	return spans
}

func isBlockquote(line string) bool {
	i := 0
	for i < len(line) && i < 3 && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	return i < len(line) && line[i] == '>'
}

// HTML never ends a run: renderers skip HTML, and inline tags or "<3" are lazy
// text the author sees inside the quote, so stopping there would leak them.
var bodyBlockStartPattern = regexp.MustCompile("^ {0,3}(#{1,6}([ \t]|$)|([-+*]|[0-9]{1,9}[.)])([ \t]|$)|`{3,}|~{3,}|([*][ \t]*){3,}$|([-][ \t]*){3,}$|([_][ \t]*){3,}$)")

func classifyMarkers(lines []string) ([]string, bool) {
	var firstHandle string
	var dm, spoiler, malformed bool
	for _, line := range lines {
		handle, lineDM, lineSpoiler, lineMalformed := classifyMarkerLine(line)
		if firstHandle == "" && handle != "" {
			firstHandle = handle
		}
		dm, spoiler, malformed = dm || lineDM, spoiler || lineSpoiler, malformed || lineMalformed
	}
	if malformed {
		return []string{}, false
	}
	if firstHandle != "" {
		return []string{firstHandle}, false
	}
	if dm {
		return []string{"role:dm"}, false
	}
	return nil, spoiler
}

func classifyMarkerLine(line string) (string, bool, bool, bool) {
	var handle string
	var dm, spoiler, malformed bool
	for _, token := range markerTokens(line) {
		tokenHandle, tokenDM, tokenSpoiler, tokenMalformed := classifyMarkerToken(token)
		if handle == "" {
			handle = tokenHandle
		}
		dm, spoiler, malformed = dm || tokenDM, spoiler || tokenSpoiler, malformed || tokenMalformed
	}
	return handle, dm, spoiler, malformed
}

// markerToken is one `[!` opener on a line: its inner text up to the first
// `]`, or the rest of the line when no `]` closes it (always the last token).
type markerToken struct {
	Inner  string
	Closed bool
	Offset int    // byte offset of `[!` in the line
	Text   string // source text: `[!` through `]`; unclosed, `[!` and its name
}

// unclosedMarkerName is the name of an unclosed token: leading blanks, then
// the first run of non-blank bytes. The text after it is prose, not marker.
func unclosedMarkerName(tail string) string {
	start := len(tail) - len(strings.TrimLeft(tail, " \t"))
	end := strings.IndexAny(tail[start:], " \t")
	if end < 0 {
		return tail
	}
	return tail[:start+end]
}

func markerTokens(line string) []markerToken {
	var tokens []markerToken
	for start := 0; start < len(line); {
		opener := strings.Index(line[start:], "[!")
		if opener < 0 {
			break
		}
		opener += start
		tail := line[opener+2:]
		close := strings.IndexByte(tail, ']')
		if close < 0 {
			tokens = append(tokens, markerToken{Inner: tail, Offset: opener, Text: "[!" + unclosedMarkerName(tail)})
			break
		}
		tokens = append(tokens, markerToken{Inner: tail[:close], Closed: true, Offset: opener, Text: line[opener : opener+2+close+1]})
		start = opener + 2 + close + 1
	}
	return tokens
}

// classifyMarkerToken returns a member principal, or whether the token is the
// DM marker, the spoiler marker or a malformed known marker. An unclosed token
// is malformed only when it starts like a DM or audience marker.
func classifyMarkerToken(token markerToken) (string, bool, bool, bool) {
	if !token.Closed {
		folded := strings.ToLower(strings.TrimSpace(token.Inner))
		return "", false, false, strings.HasPrefix(folded, "dm") || strings.HasPrefix(folded, "audience")
	}
	inner := strings.TrimSpace(token.Inner)
	folded := strings.ToLower(inner)
	switch folded {
	case "dm":
		return "", true, false, false
	case "spoiler":
		return "", false, true, false
	}
	handle, malformed := classifyAudienceMarker(inner, folded)
	return handle, false, false, malformed
}

func classifyAudienceMarker(inner, folded string) (string, bool) {
	prefix, _, colon := strings.Cut(inner, ":")
	if colon && strings.EqualFold(strings.TrimSpace(prefix), "dm") && !strings.EqualFold(prefix, "dm") {
		return "", true
	}
	if strings.HasPrefix(folded, "dm:") {
		handle := inner[len("dm:"):]
		if markerHandlePattern.MatchString(handle) {
			return "member:" + handle, false
		}
		return "", true
	}
	return "", strings.HasPrefix(folded, "audience")
}

// EffectiveBody is the scoped projection. It applies the outer Specification
// before considering any block, so inner markers can only narrow access.
// The 2026-10-11 owner ruling applies block scopes to every readable document,
// including nil/JSON-null policy. Legacy DM/archon whole-document grants do not
// bypass blocks; author and administrator grants still do.
// Callers must return these bytes, never discard them and recover raw Body.
func (d Document) EffectiveBody(scope ViewerScope) (string, error) {
	projection, err := d.projectBody(scope)
	return projection.Body, err
}

type bodyProjection struct {
	Body       string
	Complete   bool
	Overridden bool
}

func (d Document) projectBody(scope ViewerScope) (bodyProjection, error) {
	if !d.Readable(scope) {
		return bodyProjection{}, ErrForbidden
	}
	ordinary := scope
	ordinary.IsAdmin = false
	overridden := scope.Privileged() && !d.Readable(ordinary)
	if scope.IsAuthor(d.AuthorID) {
		return bodyProjection{Body: d.Body, Complete: true}, nil
	}
	complete := true
	spans := parseBody(d.Body)
	parts := make([]string, 0, len(spans))
	redactedPrevious := false
	budget := redactedBudget
	for _, span := range spans {
		// D45: a placeholder ends in a quote line, so content that follows it
		// directly would continue that blockquote (or fold in as a lazy line).
		// A blank line ends the redaction for every consumer.
		if redactedPrevious && startsWithContent(span.Text) {
			parts[len(parts)-1] += "\n"
		}
		redactedPrevious = false
		if span.Policy == nil {
			parts = append(parts, span.Text)
			continue
		}
		encoded, _ := json.Marshal(span.Policy) // string slices cannot fail encoding
		block := Specify(Document{ID: d.ID, AuthorID: d.AuthorID, Status: StatusPublished, Policy: encoded})
		if scope.Privileged() && !block.Allows(ordinary) {
			overridden = true
		}
		if block.Allows(scope) {
			parts = append(parts, span.Text)
		} else {
			complete = false
			parts = append(parts, redactedBlock(span.Text, &budget))
			redactedPrevious = true
		}
	}
	return bodyProjection{Body: strings.Join(parts, "\n"), Complete: complete, Overridden: overridden}, nil
}
