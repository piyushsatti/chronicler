package scalars

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"
	"testing"
	"time"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskG05Acceptance(t *testing.T) {
	t.Run("ID", func(t *testing.T) {
		const upper = "ABCDEF01-2345-6789-ABCD-EF0123456789"
		const lower = "abcdef01-2345-6789-abcd-ef0123456789"
		got, err := UnmarshalID(upper)
		if err != nil || got != lower {
			t.Fatalf("ID = %q, %v", got, err)
		}
		assertWire(t, MarshalID(upper), `"`+lower+`"`)
		for _, value := range []any{nil, 1, int64(12), json.Number("12"), "", "abcdef0123456789abcdef0123456789", "urn:uuid:" + lower, "{" + lower + "}", " " + lower, lower + " ", "zzzzzzzz-2345-6789-abcd-ef0123456789"} {
			_, err := UnmarshalID(value)
			assertCode(t, err, apierr.Invalid)
		}
		assertBadWire(t, MarshalID(""))
		assertBadWire(t, MarshalID("not-a-uuid"))
	})
	t.Run("Date", func(t *testing.T) {
		for _, value := range []string{"2026-10-14", "2024-02-29", "0001-01-01", "9999-12-31"} {
			got, err := UnmarshalDate(value)
			if err != nil || string(got) != value {
				t.Fatalf("Date(%q) = %q, %v", value, got, err)
			}
			assertWire(t, MarshalDate(got), `"`+value+`"`)
		}
		for _, value := range []any{nil, 20261014, "2026-2-14", "2026-02-30", "2025-02-29", "2026-13-01", "2026-10-14T00:00:00Z", " 2026-10-14"} {
			_, err := UnmarshalDate(value)
			assertCode(t, err, apierr.Invalid)
		}
		assertBadWire(t, MarshalDate(product.Date("2026-02-30")))
	})
	t.Run("Time", func(t *testing.T) {
		for input, want := range map[string]string{"09:00": "09:00:00", "00:00:00": "00:00:00", "23:59": "23:59:00", "24:00": "24:00:00", "24:00:00": "24:00:00"} {
			got, err := UnmarshalTime(input)
			if err != nil || string(got) != want {
				t.Fatalf("Time(%q) = %q, %v", input, got, err)
			}
			assertWire(t, MarshalTime(got), `"`+want+`"`)
		}
		for _, value := range []any{nil, 900, "9:00", "09:00:01", "24:01", "24:00:01", "25:00", "09:60", "09:00:00Z", "09:00:00.0", "2026-10-14T09:00:00"} {
			_, err := UnmarshalTime(value)
			assertCode(t, err, apierr.Invalid)
		}
		assertBadWire(t, MarshalTime(product.Time("09:00:01")))
	})
	t.Run("DateTime", func(t *testing.T) {
		cases := map[string]string{
			"2026-10-14T13:00:00+01:00":         "2026-10-14T12:00:00Z",
			"2026-10-14T12:00:00.123456Z":       "2026-10-14T12:00:00.123456Z",
			"2026-10-14T12:00:00.123456000000Z": "2026-10-14T12:00:00.123456Z",
			"2026-10-14T00:15:00+01:00":         "2026-10-13T23:15:00Z",
			"2026-10-14T12:00:00.1-02:30":       "2026-10-14T14:30:00.1Z",
		}
		for input, want := range cases {
			got, err := UnmarshalDateTime(input)
			if err != nil || got.Location() != time.UTC || got.Format(time.RFC3339Nano) != want {
				t.Fatalf("DateTime(%q) = %v, %v", input, got, err)
			}
			assertWire(t, MarshalDateTime(got), `"`+want+`"`)
		}
		for _, value := range []any{nil, 123, "2026-10-14T12:00:00", "2026-10-14", "2026-10-14T12:00:00.1234567Z", "2026-10-14T12:00:00.1234560001Z", "2026-10-14T12:00:00,1Z", "2026-10-14T1:00:00Z", "2026-10-14T24:00:00Z", "2026-10-14T12:00:60Z", "2026-10-14T12:00:00+24:00", "2026-10-14T12:00:00+01:60", "2026-02-30T12:00:00Z", "9999-12-31T23:59:00-01:00", "0000-01-01T00:00:00+01:00"} {
			_, err := UnmarshalDateTime(value)
			assertCode(t, err, apierr.Invalid)
		}
		assertBadWire(t, MarshalDateTime(time.Date(2026, 1, 1, 1, 1, 1, 123456789, time.UTC)))
		assertBadWire(t, MarshalDateTime(time.Date(10000, 1, 1, 0, 0, 0, 0, time.UTC)))
		assertBadWire(t, MarshalDateTime(time.Date(9999, 12, 31, 23, 59, 0, 0, time.FixedZone("west", -3600))))
	})
	t.Run("JSON", func(t *testing.T) {
		for _, input := range []any{nil, true, false, "text", json.Number("9007199254740993"), int64(9007199254740993), map[string]any{"z": json.Number("9007199254740993"), "a": []any{nil, true, "x"}}, []any{json.Number("1e1000"), json.Number("-1.234567890123456789")}} {
			raw, err := UnmarshalJSON(input)
			if err != nil {
				t.Fatalf("JSON(%v): %v", input, err)
			}
			if !json.Valid(raw) {
				t.Fatalf("invalid JSON %q", raw)
			}
			assertWire(t, MarshalJSON(raw), string(raw))
		}
		raw, err := UnmarshalJSON(json.Number("9007199254740993"))
		if err != nil || string(raw) != "9007199254740993" {
			t.Fatalf("integer precision: %s %v", raw, err)
		}
		for _, input := range []any{math.NaN(), math.Inf(1), json.Number("01"), json.Number("NaN"), json.RawMessage(`{`), make(chan int)} {
			_, err := UnmarshalJSON(input)
			assertCode(t, err, apierr.Invalid)
		}
		cyclic := map[string]any{}
		cyclic["self"] = cyclic
		_, err = UnmarshalJSON(cyclic)
		assertCode(t, err, apierr.Invalid)
		depth16 := json.RawMessage(strings.Repeat("[", 16) + "0" + strings.Repeat("]", 16))
		depth17 := json.RawMessage(strings.Repeat("[", 17) + "0" + strings.Repeat("]", 17))
		_, err = UnmarshalJSON(depth16)
		if err != nil {
			t.Fatalf("depth 16: %v", err)
		}
		assertWire(t, MarshalJSON(depth16), string(depth16))
		_, err = UnmarshalJSON(depth17)
		assertCode(t, err, apierr.Invalid)
		assertBadWire(t, MarshalJSON(depth17))
		object16 := json.RawMessage(strings.Repeat(`{"a":`, 16) + `"[not nesting]"` + strings.Repeat("}", 16))
		_, err = UnmarshalJSON(object16)
		if err != nil {
			t.Fatalf("object depth 16: %v", err)
		}
		exact := strings.Repeat("x", 262142)
		raw, err = UnmarshalJSON(exact)
		if err != nil || len(raw) != 262144 {
			t.Fatalf("exact size %d: %v", len(raw), err)
		}
		assertWire(t, MarshalJSON(raw), string(raw))
		t.Run("262145-byte input rejects", func(t *testing.T) {
			_, err := UnmarshalJSON(exact + "x")
			assertCode(t, err, apierr.Invalid)
		})
		t.Run("262145-byte output rejects", func(t *testing.T) {
			assertBadWire(t, MarshalJSON(json.RawMessage(`"`+exact+`x"`)))
		})
		for _, raw := range []json.RawMessage{nil, {}, json.RawMessage(`{`), json.RawMessage(`true false`), json.RawMessage(`{"a":}`), json.RawMessage(`"` + exact + `x"`), {0xff}} {
			assertBadWire(t, MarshalJSON(raw))
		}
		original := json.RawMessage(`{"large":9007199254740993}`)
		codec := MarshalJSON(original)
		original[0] = '['
		assertWire(t, codec, `{"large":9007199254740993}`)
		assertWire(t, MarshalJSON(json.RawMessage(`null`)), `null`)
	})
	t.Run("writer failures", func(t *testing.T) {
		sentinel := errors.New("write failed")
		if err := MarshalID("abcdef01-2345-6789-abcd-ef0123456789").MarshalGQLContext(context.Background(), failingWriter{sentinel}); !errors.Is(err, sentinel) {
			t.Fatalf("writer error: %v", err)
		}
		if err := MarshalJSON(json.RawMessage(`true`)).MarshalGQLContext(context.Background(), shortWriter{}); !errors.Is(err, io.ErrShortWrite) {
			t.Fatalf("short write: %v", err)
		}
	})
}

func assertCode(t *testing.T, err error, want apierr.Code) {
	t.Helper()
	var expected *apierr.Error
	if !errors.As(err, &expected) || expected.Code != want {
		t.Fatalf("error = %v, want %s", err, want)
	}
}
func assertWire(t *testing.T, codec gql.ContextMarshaler, want string) {
	t.Helper()
	var buffer bytes.Buffer
	if err := codec.MarshalGQLContext(context.Background(), &buffer); err != nil || buffer.String() != want {
		t.Fatalf("wire = %q, %v; want %q", buffer.String(), err, want)
	}
}
func assertBadWire(t *testing.T, codec gql.ContextMarshaler) {
	t.Helper()
	var buffer bytes.Buffer
	err := codec.MarshalGQLContext(context.Background(), &buffer)
	assertCode(t, err, apierr.Internal)
	if err.Error() != "INTERNAL: Internal error" || buffer.Len() != 0 {
		t.Fatalf("nonopaque/partial serialization: %q %v", buffer.String(), err)
	}
}

type failingWriter struct{ err error }

func (w failingWriter) Write([]byte) (int, error) { return 0, w.err }

type shortWriter struct{}

func (shortWriter) Write([]byte) (int, error) { return 0, nil }
