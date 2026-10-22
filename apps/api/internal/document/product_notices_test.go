package document

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type mentionLookup struct {
	calls int
	err   error
}

func (r *mentionLookup) ResolveMentionHandles(_ context.Context, handles []string) (map[string]string, error) {
	r.calls++
	return map[string]string{"reader": "reader-id", "alias": "reader-id", "actor": "actor-id", "old": "old-id"}, r.err
}

func TestNewDocumentMentionsUsesCanonicalBlockClassification(t *testing.T) {
	reader := &mentionLookup{}
	before := "> [!dm:@old]\n> Existing"
	after := before + "\n\n> [!dm:@reader] [!dm:@actor]\n> First named audience wins\n\n> [!dm:@alias]\n> Same resolved identity\n\n> [!dm:@actor]\n> Exclude actor\n\n> [!dm:@ignored] [!audience:bad]\n> Malformed block denies all\n\n> [!dm:@missing]\n> No Member"
	got, err := newDocumentMentions(t.Context(), reader, before, after, "actor-id")
	if err != nil || !reflect.DeepEqual(got, []string{"reader-id"}) || reader.calls != 1 {
		t.Fatalf("mentions=%v err=%v calls=%d", got, err, reader.calls)
	}
	got, err = newDocumentMentions(t.Context(), nil, after, after, "actor-id")
	if err != nil || len(got) != 0 {
		t.Fatalf("unchanged body=%v %v", got, err)
	}
	failure := errors.New("member reader failed")
	reader.err = failure
	if _, err := newDocumentMentions(t.Context(), reader, "", "> [!dm:@reader]", "actor-id"); !errors.Is(err, failure) {
		t.Fatalf("resolution failure swallowed: %v", err)
	}
}

func TestPolicyTokensPreserveDenyAllForLegacyMalformedPolicy(t *testing.T) {
	for _, raw := range []string{`{}`, `"role:player"`, `["role:player",false]`, `["role:player",null]`, `["malformed"]`, `[]`} {
		tokens, err := policyTokens([]byte(raw))
		if err != nil || tokens == nil || len(tokens) != 0 {
			t.Fatalf("%s became %v err=%v", raw, tokens, err)
		}
	}
	for _, raw := range [][]byte{nil, []byte(`null`)} {
		tokens, err := policyTokens(raw)
		if err != nil || tokens != nil {
			t.Fatalf("legacy null became %v err=%v", tokens, err)
		}
	}
}
