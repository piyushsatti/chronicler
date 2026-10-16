package notification

import (
	"reflect"
	"testing"
	"time"
)

// These conversions pin the public data boundary, not runtime authorization or persistence.
var (
	_ = struct {
		HasMore    bool
		Items      []NotificationView
		NextBefore *string
	}(NotificationConnection{})
	_ = struct {
		CreatedAt   time.Time
		Id          string
		Kind        string
		Label       string
		ReadAt      *time.Time
		SubjectCode *string
		SubjectId   string
		SubjectType string
		Summary     *string
		Title       *string
	}(NotificationView{})
	_ = struct {
		AffectedCount int32
		Replayed      bool
	}(NotificationWriteReceipt{})
	_ = struct{ Limit int32 }(AcknowledgeSuppressedNotificationsSpec{})
	_ = struct{ Ids []string }(MarkNotificationsReadSpec{})
	_ = struct {
		Limit                int32
		UnreadOnly           bool
		Before               *string
		BeforeCreatedAt      *time.Time
		BeforeNotificationID *string
	}(MyNotificationsSpec{})
	_ = struct{}(MyUnreadNotificationCountSpec{})
	_ = struct {
		NotificationID string
		EventID        string
		SubjectType    string
		SubjectID      string
	}(SubjectKey{})
)

func TestPhase3TaskNOT01Acceptance(t *testing.T) {
	// Comparable identity is required by request-local keyed loaders.
	first := SubjectKey{SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010"}
	second := SubjectKey{SubjectType: "character", SubjectID: first.SubjectID}
	entries := map[SubjectKey]string{first: "document", second: "character"}
	if len(entries) != 2 || entries[first] != "document" || entries[second] != "character" {
		t.Fatal("typed subject keys must preserve subject family in loader identity")
	}
	for _, model := range []any{NotificationView{}, NotificationConnection{}, NotificationWriteReceipt{}, MyNotificationsSpec{}, MarkNotificationsReadSpec{}} {
		typ := reflect.TypeOf(model)
		for i := 0; i < typ.NumField(); i++ {
			if !typ.Field(i).IsExported() {
				t.Errorf("public boundary %s contains inaccessible field %s", typ, typ.Field(i).Name)
			}
		}
	}
}

func TestNotificationSubjectKeyKeepsDistinctEventProof(t *testing.T) {
	base := SubjectKey{SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000010", NotificationID: "10000000-0000-4000-8000-000000000120", EventID: "10000000-0000-4000-8000-000000000220"}
	next := base
	next.NotificationID = "10000000-0000-4000-8000-000000000121"
	next.EventID = "10000000-0000-4000-8000-000000000221"
	if len(map[SubjectKey]bool{base: true, next: true}) != 2 {
		t.Fatal("different historical notices must not share proof cache entry")
	}
}
