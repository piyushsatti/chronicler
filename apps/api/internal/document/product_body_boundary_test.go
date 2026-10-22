package document

import (
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDocumentBodyBoundaryCountsUTF8Bytes(t *testing.T) {
	const limit = 128 * 1024
	for _, body := range []string{"", strings.Repeat("a", limit), strings.Repeat("界", limit/3) + strings.Repeat("a", limit%3)} {
		if err := validateDocumentBody(body); err != nil {
			t.Fatalf("body with %d bytes rejected: %v", len(body), err)
		}
	}
	for _, body := range []string{strings.Repeat("a", limit+1), strings.Repeat("界", limit/3+1)} {
		if err := validateDocumentBody(body); err == nil {
			t.Fatalf("body with %d bytes accepted", len(body))
		}
		if err := validateDocumentEdit(DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true, Value: &body}}); err == nil {
			t.Fatal("explicit oversized edit accepted")
		}
	}
	if err := validateDocumentEdit(DocumentEditFields{ExpectedRevision: 1}); err != nil {
		t.Fatalf("omitted body rejected: %v", err)
	}
}
