package product_test

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestCanonicalPublicID(t *testing.T) {
	const canonical = "0f8fad5b-d9cb-469f-a165-70867728950e"
	for _, tc := range []struct {
		name, input, want string
		ok                bool
	}{
		{name: "lowercase canonical", input: canonical, want: canonical, ok: true},
		{name: "uppercase canonical", input: "0F8FAD5B-D9CB-469F-A165-70867728950E", want: canonical, ok: true},
		{name: "braces", input: "{" + canonical + "}"},
		{name: "urn", input: "urn:uuid:" + canonical},
		{name: "no hyphens", input: "0f8fad5bd9cb469fa16570867728950e"},
		{name: "zero", input: "00000000-0000-0000-0000-000000000000"},
		{name: "empty", input: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := product.CanonicalPublicID(tc.input)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("CanonicalPublicID(%q) = %q, %v; want %q, %v", tc.input, got, ok, tc.want, tc.ok)
			}
		})
	}
}
