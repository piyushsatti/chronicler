package product

import (
	"strings"

	"github.com/google/uuid"
)

// CanonicalPublicID accepts a non-zero UUID in canonical hyphenated text of
// either case and returns its lowercase canonical form.
func CanonicalPublicID(value string) (string, bool) {
	parsed, err := uuid.Parse(value)
	if err != nil || parsed == uuid.Nil || !strings.EqualFold(parsed.String(), value) {
		return "", false
	}
	return parsed.String(), true
}
