package notification

import (
	"strings"
	"testing"
	"time"
)

func TestCursorCodecRoundTrip(t *testing.T) {
	codec, err := NewCursorCodec([]byte("fixture-signing-key"))
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 18, 12, 0, 0, 123456000, time.UTC)
	cur := Cursor{
		Version:        1,
		MemberID:       "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		UnreadOnly:     true,
		CreatedAt:      at,
		NotificationID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	}
	token, err := codec.Encode(cur)
	if err != nil {
		t.Fatal(err)
	}
	got, err := codec.Decode(token, cur.MemberID, cur.UnreadOnly)
	if err != nil {
		t.Fatal(err)
	}
	if got.NotificationID != cur.NotificationID || !got.CreatedAt.Equal(at) || got.UnreadOnly != true {
		t.Fatalf("round trip mismatch: %+v", got)
	}
}

func TestCursorCodecRejectsMemberOrFilterMismatch(t *testing.T) {
	codec, _ := NewCursorCodec([]byte("fixture-signing-key"))
	token, _ := codec.Encode(Cursor{
		Version:        1,
		MemberID:       "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		UnreadOnly:     false,
		CreatedAt:      time.Now().UTC(),
		NotificationID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	})
	if _, err := codec.Decode(token, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", false); err == nil {
		t.Fatal("foreign member accepted")
	}
	if _, err := codec.Decode(token, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true); err == nil {
		t.Fatal("filter mismatch accepted")
	}
}

func TestCursorCodecRejectsTamperedToken(t *testing.T) {
	codec, _ := NewCursorCodec([]byte("fixture-signing-key"))
	token, _ := codec.Encode(Cursor{
		Version:        1,
		MemberID:       "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		UnreadOnly:     false,
		CreatedAt:      time.Now().UTC(),
		NotificationID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	})
	parts := strings.Split(token, ".")
	tampered := parts[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	if _, err := codec.Decode(tampered, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", false); err == nil {
		t.Fatal("tampered signature accepted")
	}
}

func TestCursorCodecRejectsOversizedToken(t *testing.T) {
	codec, _ := NewCursorCodec([]byte("fixture-signing-key"))
	big := strings.Repeat("a", maxCursorTokenBytes+1)
	if _, err := codec.Decode(big, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", false); err == nil {
		t.Fatal("oversized token accepted")
	}
}

func TestNewCursorCodecRejectsEmptySecret(t *testing.T) {
	if _, err := NewCursorCodec(nil); err == nil {
		t.Fatal("empty secret accepted")
	}
}

func TestCursorCodecDifferentSecretRejects(t *testing.T) {
	a, _ := NewCursorCodec([]byte("secret-a"))
	b, _ := NewCursorCodec([]byte("secret-b"))
	token, _ := a.Encode(Cursor{
		Version:        1,
		MemberID:       "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		UnreadOnly:     false,
		CreatedAt:      time.Now().UTC(),
		NotificationID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	})
	if _, err := b.Decode(token, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", false); err == nil {
		t.Fatal("cross-secret decode accepted")
	}
}
