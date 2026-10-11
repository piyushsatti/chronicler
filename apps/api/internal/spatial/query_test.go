package spatial

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

func TestMapProjectionReceivesDocumentScopeAndPropagatesScopeFailure(t *testing.T) {
	calls := 0
	lookupError := errors.New("document reader lookup failed")
	q := Queries{DocumentScope: func(context.Context) (document.ViewerScope, error) {
		return document.ViewerScope{MemberID: "verified", Handle: "current-handle"}, nil
	}, MapViewFn: func(_ context.Context, scope document.ViewerScope, _ string, _, _ int) (MapViewPage, error) {
		calls++
		if scope.MemberID != "verified" || scope.Handle != "current-handle" {
			t.Fatalf("scope=%+v", scope)
		}
		return MapViewPage{}, nil
	}}
	if _, err := q.MapView(context.Background(), "fixture", 2, 0); err != nil || calls != 1 {
		t.Fatalf("MapView err=%v callbacks=%d", err, calls)
	}
	q.DocumentScope = func(context.Context) (document.ViewerScope, error) { return document.ViewerScope{}, lookupError }
	if _, err := q.MapView(context.Background(), "fixture", 2, 0); !errors.Is(err, lookupError) || calls != 1 {
		t.Fatalf("lookup failure err=%v callbacks=%d", err, calls)
	}
}
