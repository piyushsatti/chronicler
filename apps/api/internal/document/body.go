package document

import (
	"encoding/json"
	"regexp"
	"strings"
)

const redactedBlock = "> [!redacted]"

// July 30's accepted marker seam fixes this lexer charset independently of
// members.handle storage. The shared fixture records the same exact value.
var markerHandlePattern = regexp.MustCompile(`^@[A-Za-z0-9_.-]+$`)

type bodySpan struct {
	Text    string   `json:"text"`
	Policy  []string `json:"policy"` // nil: unscoped; empty: impossible audience
	Spoiler bool     `json:"spoiler"`
}

// parseBody preserves the accepted maximal blockquote-run and bare-line
// granularity. It is deliberately a closed marker classifier, not a second
// markdown renderer or a general audience grammar.
func parseBody(body string) []bodySpan {
	lines := strings.Split(body, "\n")
	spans := []bodySpan{}
	pending := []string{}
	flush := func() {
		if len(pending) > 0 {
			spans = append(spans, bodySpan{Text: strings.Join(pending, "\n")})
			pending = nil
		}
	}
	for i := 0; i < len(lines); {
		end := i + 1
		if isBlockquote(lines[i]) {
			for end < len(lines) && isBlockquote(lines[end]) {
				end++
			}
		}
		group := lines[i:end]
		policy, spoiler := classifyMarkers(group)
		if policy == nil && !spoiler {
			pending = append(pending, group...)
		} else {
			flush()
			spans = append(spans, bodySpan{Text: strings.Join(group, "\n"), Policy: policy, Spoiler: spoiler})
		}
		i = end
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
	for start := 0; start < len(line); {
		opener := strings.Index(line[start:], "[!")
		if opener < 0 {
			break
		}
		opener += start
		tail := line[opener+2:]
		close := strings.IndexByte(tail, ']')
		if close < 0 {
			folded := strings.ToLower(strings.TrimSpace(tail))
			if strings.HasPrefix(folded, "dm") || strings.HasPrefix(folded, "audience") {
				malformed = true
			}
			break
		}
		inner := strings.TrimSpace(tail[:close])
		folded := strings.ToLower(inner)
		switch folded {
		case "dm":
			dm = true
		case "spoiler":
			spoiler = true
		default:
			marker, invalid := classifyAudienceMarker(inner, folded)
			if handle == "" {
				handle = marker
			}
			malformed = malformed || invalid
		}
		start = opener + 2 + close + 1
	}
	return handle, dm, spoiler, malformed
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
	for _, span := range spans {
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
			parts = append(parts, redactedBlock)
		}
	}
	return bodyProjection{Body: strings.Join(parts, "\n"), Complete: complete, Overridden: overridden}, nil
}
