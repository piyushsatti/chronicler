package member

import (
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestValidatePrivateNotesLimit(t *testing.T) {
	for _, body := range []string{"", "# Heading\n\n- a list", strings.Repeat("é", privateNotesMaxRunes)} {
		if err := validatePrivateNotes(body); err != nil {
			t.Fatalf("valid notes rejected (%d runes): %v", len([]rune(body)), err)
		}
	}
	for _, body := range []string{strings.Repeat("a", privateNotesMaxRunes+1), "bad \xff utf8"} {
		err := validatePrivateNotes(body)
		if expected, ok := err.(*apierr.Error); !ok || expected.Code != apierr.Invalid {
			t.Fatalf("invalid notes accepted or wrong error: %v", err)
		}
	}
}
