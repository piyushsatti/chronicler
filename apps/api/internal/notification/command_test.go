package notification

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

const readID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

func TestNormalizeReadIDsPreservesEmptyAndCanonicalDeduplication(t *testing.T) {
	for _, tc := range []struct{ ids, want []string }{
		{[]string{}, []string{}},
		{[]string{strings.ToUpper(readID), readID}, []string{readID}},
	} {
		got, err := normalizeReadIDs(tc.ids)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("ids=%v err=%v want=%v", got, err, tc.want)
		}
	}
	hundred := make([]string, 100)
	for i := range hundred {
		hundred[i] = readID
	}
	if got, err := normalizeReadIDs(hundred); err != nil || !reflect.DeepEqual(got, []string{readID}) {
		t.Fatalf("100 IDs=%v err=%v", got, err)
	}
}

func TestNormalizeReadIDsRejectsInvalidAndOverBoundBeforeDeduplication(t *testing.T) {
	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = readID
	}
	for _, ids := range [][]string{nil, {""}, {readID, "not-an-id"}, {" " + readID}, {strings.ReplaceAll(readID, "-", "")}, {"urn:uuid:" + readID}, {"{" + readID + "}"}, tooMany} {
		got, err := normalizeReadIDs(ids)
		if got != nil || !errors.Is(err, errInvalidReadRequest) || errInvalidReadRequest.Message != "Invalid notification read request" {
			t.Fatalf("invalid IDs=%v got=%v err=%v", ids, got, err)
		}
	}
}
