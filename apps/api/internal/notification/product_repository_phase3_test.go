package notification

import (
	"context"
	"reflect"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

var (
	_ interface {
		ReadMyNotifications(context.Context, auth.Authority, MyNotificationsSpec) (NotificationConnection, error)
		ReadMyUnreadNotificationCount(context.Context, auth.Authority, MyUnreadNotificationCountSpec) (int32, error)
	} = NotificationReadRepository(nil)
	_ interface {
		LockAcknowledgeSuppressedNotifications(context.Context, string, AcknowledgeSuppressedNotificationsSpec) (AcknowledgeSuppressedNotificationsState, error)
		StoreAcknowledgeSuppressedNotifications(context.Context, AcknowledgeSuppressedNotificationsWrite) (NotificationWriteReceipt, error)
		StoreMarkNotificationsRead(context.Context, MarkNotificationsReadWrite) (NotificationWriteReceipt, error)
	} = NotificationWriteRepository(nil)
	_ interface {
		ReadBatchNotificationSubjects(context.Context, auth.Authority, []SubjectKey) ([]product.BatchResult[SubjectProjection], error)
	} = ProductBatchRepository(nil)
)

func TestPhase3TaskNOT02Acceptance(t *testing.T) {
	for _, boundary := range []struct {
		model   any
		methods int
	}{
		{(*NotificationReadRepository)(nil), 2},
		{(*NotificationWriteRepository)(nil), 3},
		{(*ProductBatchRepository)(nil), 1},
		{(*DocumentAudienceReader)(nil), 1},
	} {
		typ := reflect.TypeOf(boundary.model).Elem()
		if typ.NumMethod() != boundary.methods {
			t.Fatalf("repository boundary %s has %d methods, want %d", typ, typ.NumMethod(), boundary.methods)
		}
		for i := 0; i < typ.NumMethod(); i++ {
			switch typ.Method(i).Name {
			case "Begin", "Commit", "Rollback":
				t.Fatalf("repository boundary %s cannot own transaction completion", typ)
			}
		}
	}
}
