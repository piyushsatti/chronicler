package document

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestBodyProjectionReportsActualCompleteness(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		complete   bool
	}{
		{"ordinary prose", "Visible text", true},
		{"literal redaction", "> [!redacted]", true},
		{"hidden DM block", "Visible\n> [!dm]\n> Secret", false},
		{"hidden named block", "> [!dm:@another]\n> Secret", false},
		{"malformed audience", "> [!audience:all]\n> Secret", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc := Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: tc.body}
			projection, err := doc.projectBody(ViewerScope{MemberID: "reader"})
			if err != nil || projection.Complete != tc.complete {
				t.Fatalf("projection=%+v err=%v, want complete=%t", projection, err, tc.complete)
			}
			for _, scope := range []ViewerScope{{MemberID: "author"}, {MemberID: "admin", IsAdmin: true}} {
				projection, err := doc.projectBody(scope)
				if err != nil || !projection.Complete || projection.Body != tc.body {
					t.Fatalf("source owner projection=%+v err=%v", projection, err)
				}
			}
		})
	}
}

func TestDocumentEditRejectsNullBodyAndPreservesOmission(t *testing.T) {
	if err := validateDocumentEdit(DocumentEditFields{ExpectedRevision: 1}); err != nil {
		t.Fatalf("omitted body rejected: %v", err)
	}
	if err := validateDocumentEdit(DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true}}); err == nil {
		t.Fatal("null body admitted")
	}
	empty := ""
	if err := validateDocumentEdit(DocumentEditFields{ExpectedRevision: 1, Body: product.Optional[string]{Set: true, Value: &empty}}); err != nil {
		t.Fatalf("explicit empty body rejected: %v", err)
	}
}

func TestDocumentFrontmatterRetainsExactJSONNumbers(t *testing.T) {
	raw := json.RawMessage(`{"big":9007199254740993,"larger":123456789012345678901234567890,"decimal":1.234567890123456789,"items":[null,true,"text"]}`)
	yamlValue, err := frontmatterYAML(raw)
	if err != nil {
		t.Fatal(err)
	}
	read, err := frontmatterJSON(yamlValue)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"9007199254740993", "123456789012345678901234567890", "1.234567890123456789"} {
		if !strings.Contains(string(read), expected) {
			t.Fatalf("readback %s lost exact number %s", read, expected)
		}
	}
}

func TestDocumentPolicyRetainsExplicitEmptyAudience(t *testing.T) {
	policy, err := policyBytes([]string{})
	if err != nil || string(policy) != "[]" {
		t.Fatalf("empty audience=%q err=%v", policy, err)
	}
	policy, err = policyBytes(nil)
	if err != nil || policy != nil {
		t.Fatalf("legacy audience=%q err=%v", policy, err)
	}
	reader, _ := auth.NewAuthority("reader", []auth.Role{auth.Player}, "active", "")
	view := DocumentView{Id: "doc", AuthorId: "author", Status: "published", Visibility: "public", Policy: []string{}}
	if err := completeBodyForWrite(view, "public-looking", reader); err == nil {
		t.Fatal("explicit empty outer audience became public")
	}
}
