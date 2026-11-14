package product_test

import (
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestValidPage(t *testing.T) {
	for _, tc := range []struct {
		name          string
		limit, offset int32
		ok            bool
	}{
		{name: "zero limit", limit: 0, offset: 0},
		{name: "one", limit: 1, offset: 0, ok: true},
		{name: "maximum", limit: 100, offset: 0, ok: true},
		{name: "above maximum", limit: 101, offset: 0},
		{name: "negative offset", limit: 1, offset: -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := product.ValidPage(tc.limit, tc.offset); got != tc.ok {
				t.Fatalf("ValidPage(%d, %d) = %v; want %v", tc.limit, tc.offset, got, tc.ok)
			}
		})
	}
}
