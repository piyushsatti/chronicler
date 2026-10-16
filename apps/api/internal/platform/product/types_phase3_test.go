package product_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type marshaledSpec string

func (s marshaledSpec) MarshalJSON() ([]byte, error) { return []byte(s), nil }

type failingSpec struct{ err error }

func (s failingSpec) MarshalJSON() ([]byte, error) { return nil, s.err }

func TestPhase3TaskP01Acceptance(t *testing.T) {
	t.Run("published-fingerprint-goldens", func(t *testing.T) {
		data, err := os.ReadFile("../../../cmd/api/testdata/product/mounted-integration-repair-cases.json")
		if err != nil {
			t.Fatal(err)
		}
		var published struct {
			Cases []struct {
				ID      string `json:"id"`
				Owner   string `json:"owner"`
				Fixture struct {
					Normalized json.RawMessage `json:"normalized_internal_spec"`
				} `json:"fixture"`
				Expected struct {
					Canonical string `json:"canonical_bytes_utf8"`
					SHA256    string `json:"sha256"`
				} `json:"expected"`
			} `json:"cases"`
		}
		if err := json.Unmarshal(data, &published); err != nil {
			t.Fatal(err)
		}
		seen := map[string]bool{}
		for _, c := range published.Cases {
			if c.Owner != "P01" || c.Expected.SHA256 == "" {
				continue
			}
			t.Run(c.ID, func(t *testing.T) {
				sum := sha256.Sum256([]byte(c.Expected.Canonical))
				if hex.EncodeToString(sum[:]) != c.Expected.SHA256 {
					t.Fatal("published canonical bytes and hash disagree")
				}
				got, err := product.Fingerprint(c.Fixture.Normalized)
				if err != nil || got != c.Expected.SHA256 {
					t.Fatalf("Fingerprint = %q, %v; want %q", got, err, c.Expected.SHA256)
				}
			})
			seen[c.ID] = true
		}
		for _, id := range []string{"FP-nested-sort", "FP-html", "FP-patch-omitted", "FP-patch-null"} {
			if !seen[id] {
				t.Errorf("missing published case %s", id)
			}
		}
	})

	assertFingerprint := func(t *testing.T, input any, want string) {
		t.Helper()
		got, err := product.Fingerprint(input)
		if err != nil || got != want {
			t.Fatalf("Fingerprint = %q, %v; want %q", got, err, want)
		}
	}

	t.Run("FP-nested-sort-structs-and-array-objects", func(t *testing.T) {
		input := struct {
			B any   `json:"b"`
			A []int `json:"a"`
		}{
			B: struct {
				Z int `json:"z"`
				A int `json:"a"`
			}{2, 1}, A: []int{2, 1},
		}
		assertFingerprint(t, input, "5eb64c69809ad680fe9f8a219cecabe8aa4289d501468d43daf75735ab6aaab5")
		a, err := product.Fingerprint(marshaledSpec(`[{"z":2,"a":{"y":4,"b":3}}]`))
		if err != nil {
			t.Fatal(err)
		}
		b, err := product.Fingerprint(marshaledSpec(`[{"a":{"b":3,"y":4},"z":2}]`))
		if err != nil || a != b {
			t.Fatalf("recursive sort = %s vs %s, %v", a, b, err)
		}
	})

	t.Run("FP-NUMBER-LEXEMES", func(t *testing.T) {
		for _, c := range []struct{ lexeme, hash string }{
			{"1", "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"},
			{"1.0", "d0ff5974b6aa52cf562bea5921840c032a860a91a3512f7fe8f768f6bbe005f6"},
			{"9007199254740993", "a1c367c29158357e62a3ff5d3e800fb7698a22396439dbc0a9d4929322afd35d"},
		} {
			t.Run(c.lexeme, func(t *testing.T) { assertFingerprint(t, json.Number(c.lexeme), c.hash) })
		}
		a, err := product.Fingerprint(marshaledSpec(`{"value":1e+09}`))
		if err != nil {
			t.Fatal(err)
		}
		b, err := product.Fingerprint(marshaledSpec(`{"value":1000000000}`))
		if err != nil {
			t.Fatal(err)
		}
		if a == b {
			t.Fatal("exponent lexeme collapsed")
		}
	})

	t.Run("array-order", func(t *testing.T) {
		assertFingerprint(t, []int{1, 2}, "49a64717d5d4cb19952e6eac2946415cf6879adacf9908e7d872332d32c6e684")
		assertFingerprint(t, []int{2, 1}, "af1a1fc110b6094c48582b0ef83553cb7908d7a4365424eef28e76ef6c88d630")
	})

	t.Run("patch-presence", func(t *testing.T) {
		type patch struct{ Field product.Optional[string] }
		assertFingerprint(t, patch{}, "a3229b1210b268cf2740cee9e72767e731b45bf86cae67d462ccc38c3a5fabcc")
		assertFingerprint(t, patch{Field: product.Optional[string]{Set: true}}, "cb44480f8618b522b8da5e0f704ba305592e97bcde4c2c3976f8b524c309b51c")
		value := "present"
		assertFingerprint(t, patch{Field: product.Optional[string]{Set: true, Value: &value}}, "6af062b198813304f8ad5303a462394b4dde82dd4121059d880f1bc24c003235")
	})

	t.Run("UTF8-and-HTML", func(t *testing.T) {
		assertFingerprint(t, map[string]string{"s": "<>&"}, "bbd37047d69a2464d44f68fc5b43ca5fcabf0dd4d218bce5a9dcee8d027e53fb")
		assertFingerprint(t, map[string]string{"s": "雪café\u2028\u2029"}, "fceced8b7fe2a33532dbf1dde4344096856860781eefaf8d679746203d2dc5de")
	})

	t.Run("normalized-UUID-and-D9-spelling", func(t *testing.T) {
		type spec struct {
			ID   string
			Tags []string
		}
		upper := "10000000-0000-4000-8000-000000000ABC"
		normalized := spec{ID: strings.ToLower(upper), Tags: []string{"river"}}
		before := spec{ID: normalized.ID, Tags: append([]string(nil), normalized.Tags...)}
		first, err := product.Fingerprint(normalized)
		if err != nil {
			t.Fatal(err)
		}
		second, err := product.Fingerprint(spec{ID: "10000000-0000-4000-8000-000000000abc", Tags: []string{"river"}})
		if err != nil || first != second {
			t.Fatalf("normalized UUID mismatch %s %s %v", first, second, err)
		}
		storedSpellingSpec := spec{ID: normalized.ID, Tags: []string{"River"}}
		storedSpellingHash, err := product.Fingerprint(storedSpellingSpec)
		if err != nil || storedSpellingHash == first {
			t.Fatalf("fingerprint lost normalized tag spelling: %s %v", storedSpellingHash, err)
		}
		replay, err := product.Fingerprint(normalized)
		if err != nil || replay != first {
			t.Fatalf("fingerprint changed across identical normalized input: %s %s %v", first, replay, err)
		}
		if !reflect.DeepEqual(normalized, before) {
			t.Fatal("Fingerprint mutated normalized input")
		}
		different, err := product.Fingerprint(spec{ID: upper, Tags: []string{"river"}})
		if err != nil || different == first {
			t.Fatalf("Fingerprint silently normalized a caller UUID: %s %v", different, err)
		}
	})

	t.Run("serialization-errors", func(t *testing.T) {
		cyclic := map[string]any{}
		cyclic["self"] = cyclic
		for name, input := range map[string]any{
			"function": func() {}, "channel": make(chan int), "NaN": math.NaN(), "positive-infinity": math.Inf(1), "negative-infinity": math.Inf(-1),
			"cycle": cyclic, "invalid-number": json.Number("01"), "invalid-json": marshaledSpec(`{"a":`),
			"trailing-value": marshaledSpec(`{} {}`), "trailing-garbage": marshaledSpec(`{} garbage`),
		} {
			t.Run(name, func(t *testing.T) {
				got, err := product.Fingerprint(input)
				if err == nil || got != "" {
					t.Fatalf("invalid input returned %q, %v", got, err)
				}
			})
		}
		sentinel := errors.New("serialization failed")
		got, err := product.Fingerprint(failingSpec{err: sentinel})
		if got != "" || !errors.Is(err, sentinel) {
			t.Fatalf("serialization cause lost: %q %v", got, err)
		}
	})

	t.Run("UTCNow", func(t *testing.T) {
		if got, err := product.UTCNow(nil); err == nil || !got.IsZero() {
			t.Fatalf("nil clock returned %v %v", got, err)
		}
		calls := 0
		if got, err := product.UTCNow(func() time.Time { calls++; return time.Time{} }); err == nil || !got.IsZero() || calls != 1 {
			t.Fatalf("zero clock returned %v %v after %d calls", got, err, calls)
		}
		for _, c := range []struct {
			name        string
			input, want time.Time
		}{
			{"offset-and-submicrosecond", time.Date(2026, 10, 16, 4, 30, 0, 123456789, time.FixedZone("offset", 19800)), time.Date(2026, 10, 15, 23, 0, 0, 123456000, time.UTC)},
			{"exact-microsecond", time.Date(2026, 10, 16, 0, 0, 0, 999999000, time.UTC), time.Date(2026, 10, 16, 0, 0, 0, 999999000, time.UTC)},
			{"submicrosecond-no-round-up", time.Date(2026, 10, 16, 0, 0, 0, 999999999, time.UTC), time.Date(2026, 10, 16, 0, 0, 0, 999999000, time.UTC)},
		} {
			t.Run(c.name, func(t *testing.T) {
				calls := 0
				got, err := product.UTCNow(func() time.Time { calls++; return c.input })
				if err != nil || got != c.want || got.Location() != time.UTC || calls != 1 {
					t.Fatalf("UTCNow = %v %v after %d calls; want %v UTC once", got, err, calls, c.want)
				}
			})
		}
	})

}
