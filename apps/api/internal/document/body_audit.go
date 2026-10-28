package document

import (
	"strings"
	"unicode/utf16"
)

// BodySpanKind names why an audited span matters to an author.
type BodySpanKind string

const (
	BodySpanDM        BodySpanKind = "DM"        // hidden except from DMs
	BodySpanMember    BodySpanKind = "MEMBER"    // hidden except from one member
	BodySpanSpoiler   BodySpanKind = "SPOILER"   // visible, blurred by clients
	BodySpanMalformed BodySpanKind = "MALFORMED" // hidden from everyone
	BodySpanLookalike BodySpanKind = "LOOKALIKE" // visible, but written like a marker
)

// BodySpanAudit is one hidden, special or marker-like span with 1-based
// inclusive source lines. Handle is set for MEMBER; Suggestion is a
// best-effort corrected marker token for MALFORMED and LOOKALIKE.
//
// Token is the exact source text of the marker that defines the span (for
// LOOKALIKE and MALFORMED, the offending token): `[!` through the first `]`,
// or, when unclosed, `[!` and its first word only, so replacing Token with
// Suggestion closes the marker and keeps the prose after it. TokenLine is its 1-based line;
// TokenColumn is its 1-based column counted in UTF-16 code units, so a browser
// editor can replace exactly Token's range with Suggestion.
type BodySpanAudit struct {
	StartLine   int
	EndLine     int
	Kind        BodySpanKind
	Handle      *string
	Suggestion  *string
	Token       *string
	TokenLine   *int
	TokenColumn *int
}

// AuditBody reports what the projection would do with each marked span. It
// reads the same groups and tokens parseBody projects (scanBodyGroups,
// markerTokens), so it cannot disagree with the server about which lines are
// hidden, and clients never re-parse marker grammar. Unmarked public text is
// omitted. LOOKALIKE flags a `[!…]` token in a visible group whose name starts
// with `dm` or `spoiler` but is not a marker, such as `[!dm@mortal]`: the text
// it was meant to hide is shown to everyone. Its range is the group that a
// corrected marker would scope.
func AuditBody(body string) []BodySpanAudit {
	records := []BodySpanAudit{}
	for _, group := range scanBodyGroups(body) {
		span := BodySpanAudit{StartLine: group.Start + 1, EndLine: group.Start + len(group.Lines)}
		tokens := groupTokens(group)
		switch {
		case group.Policy == nil:
			if group.Spoiler {
				records = append(records, span.at(BodySpanSpoiler, firstToken(tokens, func(_ string, _, spoiler, _ bool) bool { return spoiler })))
			}
			for i, token := range tokens {
				handle, dm, spoiler, malformed := classifyMarkerToken(token.markerToken)
				folded := strings.ToLower(strings.TrimSpace(token.Inner))
				if handle != "" || dm || spoiler || malformed ||
					!(strings.HasPrefix(folded, "dm") || strings.HasPrefix(folded, "spoiler")) {
					continue
				}
				lookalike := span.at(BodySpanLookalike, &tokens[i])
				lookalike.Suggestion = markerSuggestion(token.name())
				records = append(records, lookalike)
			}
		case len(group.Policy) == 0:
			token := firstToken(tokens, func(_ string, _, _, malformed bool) bool { return malformed })
			malformed := span.at(BodySpanMalformed, token)
			if token != nil {
				malformed.Suggestion = markerSuggestion(token.name())
			}
			records = append(records, malformed)
		case group.Policy[0] == "role:dm":
			records = append(records, span.at(BodySpanDM, firstToken(tokens, func(_ string, dm, _, _ bool) bool { return dm })))
		default:
			principal := group.Policy[0]
			member := span.at(BodySpanMember, firstToken(tokens, func(handle string, _, _, _ bool) bool { return handle == principal }))
			handle := strings.TrimPrefix(principal, "member:@")
			member.Handle = &handle
			records = append(records, member)
		}
	}
	return records
}

// positionedToken is a marker token with its 1-based line and UTF-16 column.
type positionedToken struct {
	markerToken
	Line   int
	Column int
}

// groupTokens positions every token in one pass per line: the UTF-16 count
// advances only over the bytes between consecutive tokens, so a line with many
// tokens stays linear.
func groupTokens(group bodyGroup) []positionedToken {
	var tokens []positionedToken
	for i, line := range group.Lines {
		units, previous := 0, 0
		for _, token := range markerTokens(line) {
			units += utf16Len(line[previous:token.Offset])
			previous = token.Offset
			tokens = append(tokens, positionedToken{markerToken: token, Line: group.Start + i + 1, Column: units + 1})
		}
	}
	return tokens
}

// utf16Len counts UTF-16 code units the way a browser string would; each
// invalid byte decodes to one U+FFFD unit.
func utf16Len(text string) int {
	units := 0
	for _, r := range text {
		if n := utf16.RuneLen(r); n > 0 {
			units += n
		} else {
			units++
		}
	}
	return units
}

// name is the token text between `[!` and `]` (or its unclosed first word).
func (t positionedToken) name() string {
	return strings.TrimSuffix(strings.TrimPrefix(t.Text, "[!"), "]")
}

func firstToken(tokens []positionedToken, match func(handle string, dm, spoiler, malformed bool) bool) *positionedToken {
	for i := range tokens {
		if match(classifyMarkerToken(tokens[i].markerToken)) {
			return &tokens[i]
		}
	}
	return nil
}

func (r BodySpanAudit) at(kind BodySpanKind, token *positionedToken) BodySpanAudit {
	r.Kind = kind
	if token != nil {
		text, line, column := token.Text, token.Line, token.Column
		r.Token, r.TokenLine, r.TokenColumn = &text, &line, &column
	}
	return r
}

// markerSuggestion proposes the closed marker an author most likely meant.
// Any spoiler-like name becomes `[!spoiler]`. A DM-like name keeps its handle
// when a separator (`:`, `@` or whitespace) sets it apart and it fits the
// marker charset; with nothing after the separators it becomes `[!dm]`. A name
// glued to `dm` (`[!dmdun]`) or a handle outside the charset gets no guess.
func markerSuggestion(inner string) *string {
	name := strings.TrimSpace(inner)
	folded := strings.ToLower(name)
	var suggestion string
	switch {
	case strings.HasPrefix(folded, "spoiler"):
		suggestion = "[!spoiler]"
	case strings.HasPrefix(folded, "dm"):
		rest := name[len("dm"):]
		handle := strings.TrimLeft(rest, " \t:@")
		switch {
		case handle == "":
			suggestion = "[!dm]"
		case handle != rest && markerHandlePattern.MatchString("@"+handle):
			suggestion = "[!dm:@" + handle + "]"
		default:
			return nil
		}
	default:
		return nil
	}
	return &suggestion
}
