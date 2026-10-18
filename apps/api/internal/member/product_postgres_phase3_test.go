package member

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestPhase3TaskMEM04Acceptance(t *testing.T) {
	if _, err := NewProductPostgres(nil); err == nil {
		t.Fatal("nil database executor accepted")
	}
	for _, value := range []string{"not-a-uuid", "10000000000040008000000000000001", "AAAAAAAA-0000-4000-8000-000000000001"} {
		if _, err := productID(value); err == nil {
			t.Errorf("noncanonical public ID accepted: %q", value)
		}
	}
	postgres := &ProductPostgres{}
	for _, spec := range []MemberSpec{{Id: stringPointer("not-a-uuid")}, {}} {
		member, err := postgres.ReadMember(context.Background(), auth.Authority{}, spec)
		if err != nil || member != nil {
			t.Errorf("invalid or missing identity returned member=%+v err=%v", member, err)
		}
	}
	if got := minuteTime(9 * 60); got != "09:00:00" {
		t.Fatalf("minute-to-time mapping = %q", got)
	}
	if got := weekdayName(0); got != "SUNDAY" {
		t.Fatalf("weekday mapping = %q", got)
	}
}

func TestAvailabilityNotePresenceIsPreservedInInsertArguments(t *testing.T) {
	values := []struct {
		input *string
		want  string
		valid bool
	}{
		{input: nil, want: "", valid: false},
		{input: stringPointer(""), want: "", valid: true},
		{input: stringPointer("table closed"), want: "table closed", valid: true},
	}
	for _, value := range values {
		got, valid := availabilityNoteValue(value.input)
		if got != value.want || valid != value.valid {
			t.Errorf("availability note transport for input=%v = (%q, %t), want (%q, %t)", value.input, got, valid, value.want, value.valid)
		}
	}
}

func TestStoredUnlockKindMapping(t *testing.T) {
	for _, test := range []struct {
		stored string
		want   UnlockKind
	}{
		{stored: "achievement", want: UnlockKindAchievement},
		{stored: "dm_tier", want: UnlockKindDmTier},
	} {
		got, err := mapStoredUnlockKind(test.stored)
		if err != nil || got != test.want {
			t.Errorf("stored unlock kind %q = %q, %v; want %q", test.stored, got, err, test.want)
		}
	}
	for _, stored := range []string{"ACHIEVEMENT", "cosmetic", ""} {
		if got, err := mapStoredUnlockKind(stored); err == nil {
			t.Errorf("unknown stored unlock kind %q mapped to %q", stored, got)
		}
	}
}

func TestAPIUnlockKindMapping(t *testing.T) {
	for _, test := range []struct {
		api  UnlockKind
		want string
	}{
		{api: UnlockKindAchievement, want: "achievement"},
		{api: UnlockKindDmTier, want: "dm_tier"},
	} {
		got, err := mapAPIUnlockKind(test.api)
		if err != nil || got != test.want {
			t.Errorf("API unlock kind %q = %q, %v; want %q", test.api, got, err, test.want)
		}
	}
	for _, api := range []UnlockKind{"achievement", "cosmetic", ""} {
		if got, err := mapAPIUnlockKind(api); err == nil {
			t.Errorf("unknown API unlock kind %q mapped to %q", api, got)
		}
	}
}

func TestBatchMemberPagesDeduplicatesPerPageAndPreservesInputPositions(t *testing.T) {
	const first = "10000000-0000-4000-8000-000000000001"
	const second = "10000000-0000-4000-8000-000000000002"
	keys := []MemberRecentWeeksKey{
		{ParentID: first, Limit: 3, Offset: 0},
		{ParentID: second, Limit: 3, Offset: 0},
		{ParentID: first, Limit: 3, Offset: 0},
		{ParentID: first, Limit: 2, Offset: 1},
		{ParentID: "invalid", Limit: 3, Offset: 0},
	}
	out := make([]product.BatchResult[WeekActivityList], len(keys))
	idsByPage, positionsByPage := batchMemberPages(keys, func(key MemberRecentWeeksKey) (string, int32, int32) {
		return key.ParentID, key.Limit, key.Offset
	}, out)
	firstPage := memberBatchPage{limit: 3, offset: 0}
	secondPage := memberBatchPage{limit: 2, offset: 1}
	if got := len(idsByPage[firstPage]); got != 2 {
		t.Fatalf("first page IDs = %d, want 2", got)
	}
	if got := len(idsByPage[secondPage]); got != 1 {
		t.Fatalf("second page IDs = %d, want 1", got)
	}
	if got := positionsByPage[firstPage][first]; len(got) != 2 || got[0] != 0 || got[1] != 2 {
		t.Fatalf("duplicate positions = %v, want [0 2]", got)
	}
	if got := positionsByPage[firstPage][second]; len(got) != 1 || got[0] != 1 {
		t.Fatalf("second member positions = %v, want [1]", got)
	}
	if out[4].Err == nil {
		t.Fatal("invalid parent ID has no per-key error")
	}
	for _, page := range []memberBatchPage{firstPage, secondPage} {
		seen := map[string]struct{}{}
		for _, id := range idsByPage[page] {
			seen[db.UUIDString(id)] = struct{}{}
		}
		if _, ok := seen[first]; !ok {
			t.Errorf("page %+v omitted first member", page)
		}
		if page == firstPage {
			if _, ok := seen[second]; !ok {
				t.Errorf("page %+v omitted second member", page)
			}
		}
	}
}

func stringPointer(value string) *string { return &value }
