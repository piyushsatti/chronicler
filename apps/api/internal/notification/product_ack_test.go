package notification

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestNormalizeAckLimit(t *testing.T) {
	t.Parallel()
	if _, err := normalizeAckLimit(0); err == nil {
		t.Fatal("limit 0 accepted")
	}
	if _, err := normalizeAckLimit(101); err == nil {
		t.Fatal("limit 101 accepted")
	}
	got, err := normalizeAckLimit(1)
	if err != nil || got != 1 {
		t.Fatalf("limit 1: got %d err %v", got, err)
	}
	got, err = normalizeAckLimit(100)
	if err != nil || got != 100 {
		t.Fatalf("limit 100: got %d err %v", got, err)
	}
}

func TestSelectSuppressedNotificationIDsDocumentHiddenOnly(t *testing.T) {
	t.Parallel()
	actor := auth.Authority{}
	candidates := []NotificationCandidate{
		{NotificationID: "n-hidden", Subject: SubjectKey{NotificationID: "n-hidden", SubjectType: subjectTypeDocument, SubjectID: "doc-hidden"}},
		{NotificationID: "n-visible", Subject: SubjectKey{NotificationID: "n-visible", SubjectType: subjectTypeDocument, SubjectID: "doc-visible"}},
		{NotificationID: "n-quest", Subject: SubjectKey{NotificationID: "n-quest", SubjectType: subjectTypeQuest, SubjectID: "quest-1"}},
	}
	batch := &fakeSubjectBatch{results: []product.BatchResult[SubjectProjection]{
		{Value: &SubjectProjection{SubjectType: subjectTypeDocument, SubjectID: "doc-hidden", Visible: true}},
		{Value: &SubjectProjection{SubjectType: subjectTypeDocument, SubjectID: "doc-visible", Visible: true}},
		{Value: &SubjectProjection{SubjectType: subjectTypeQuest, SubjectID: "quest-1", Visible: true}},
	}}
	audience := &fakeDocumentAudience{readable: map[string]bool{"doc-visible": true}}
	selected, err := selectSuppressedNotificationIDs(context.Background(), batch, audience, actor, candidates)
	if err != nil {
		t.Fatalf("select: %v", err)
	}
	if len(selected) != 1 || selected[0] != "n-hidden" {
		t.Fatalf("selected = %v, want only n-hidden", selected)
	}
}

func TestSelectSuppressedNotificationIDsMissingDocument(t *testing.T) {
	t.Parallel()
	candidates := []NotificationCandidate{
		{NotificationID: "n-missing", Subject: SubjectKey{NotificationID: "n-missing", SubjectType: subjectTypeDocument, SubjectID: ""}},
	}
	batch := &fakeSubjectBatch{results: []product.BatchResult[SubjectProjection]{
		{Value: &SubjectProjection{SubjectType: subjectTypeDocument, Visible: false}},
	}}
	selected, err := selectSuppressedNotificationIDs(context.Background(), batch, &fakeDocumentAudience{}, auth.Authority{}, candidates)
	if err != nil {
		t.Fatalf("select: %v", err)
	}
	if len(selected) != 1 || selected[0] != "n-missing" {
		t.Fatalf("selected = %v, want n-missing", selected)
	}
}

func TestSelectSuppressedNotificationIDsMissingNonDocumentFails(t *testing.T) {
	t.Parallel()
	candidates := []NotificationCandidate{
		{NotificationID: "n-quest", Subject: SubjectKey{NotificationID: "n-quest", SubjectType: subjectTypeQuest, SubjectID: "quest-missing"}},
	}
	batch := &fakeSubjectBatch{results: []product.BatchResult[SubjectProjection]{
		{Value: &SubjectProjection{SubjectType: subjectTypeQuest, SubjectID: "quest-missing", Malformed: true}},
	}}
	_, err := selectSuppressedNotificationIDs(context.Background(), batch, &fakeDocumentAudience{}, auth.Authority{}, candidates)
	if err == nil {
		t.Fatal("expected opaque proof failure")
	}
	var typed *apierr.Error
	if !errors.As(err, &typed) || typed.Code != apierr.Internal {
		t.Fatalf("err = %v, want Internal apierr", err)
	}
}

func TestSelectSuppressedNotificationIDsMalformedFailsEntireBatch(t *testing.T) {
	t.Parallel()
	candidates := []NotificationCandidate{
		{NotificationID: "n-ok", Subject: SubjectKey{NotificationID: "n-ok", SubjectType: subjectTypeDocument, SubjectID: "doc-1"}},
		{NotificationID: "n-bad", Subject: SubjectKey{NotificationID: "n-bad", SubjectType: "unknown", SubjectID: "x"}},
	}
	batch := &fakeSubjectBatch{results: []product.BatchResult[SubjectProjection]{
		{Value: &SubjectProjection{SubjectType: subjectTypeDocument, SubjectID: "doc-1", Visible: true}},
		{Value: &SubjectProjection{SubjectType: "unknown", Malformed: true}},
	}}
	audience := &fakeDocumentAudience{readable: map[string]bool{}}
	_, err := selectSuppressedNotificationIDs(context.Background(), batch, audience, auth.Authority{}, candidates)
	if err == nil {
		t.Fatal("expected opaque proof failure")
	}
}

type fakeSubjectBatch struct {
	results []product.BatchResult[SubjectProjection]
}

func (f *fakeSubjectBatch) ReadBatchNotificationSubjects(context.Context, auth.Authority, []SubjectKey) ([]product.BatchResult[SubjectProjection], error) {
	return f.results, nil
}

type fakeDocumentAudience struct {
	readable map[string]bool
	err      error
}

func (f *fakeDocumentAudience) ReadableDocumentIDs(_ context.Context, _ auth.Authority, ids []string) (map[string]bool, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = f.readable[id]
	}
	return out, nil
}

func TestVisibleNotificationItemsPreservesInjectedCause(t *testing.T) {
	t.Parallel()
	dbErr := errors.New("database blip")
	items := []NotificationView{{SubjectType: subjectTypeDocument, SubjectId: "doc-1"}}
	_, err := visibleNotificationItems(context.Background(), &fakeDocumentAudience{err: dbErr}, auth.Authority{}, items)
	if !errors.Is(err, dbErr) {
		t.Fatalf("errors.Is lost cause: %v", err)
	}
	var typed *apierr.Error
	if !errors.As(err, &typed) || typed.Code != apierr.Internal || typed.Message != "Internal error" {
		t.Fatalf("client shape: %v", err)
	}
}
