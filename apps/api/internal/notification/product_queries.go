package notification

import (
	"context"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
	Cursor        CursorCodec
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver, cursor CursorCodec) (*ProductQueries, error) {
	for _, dep := range []any{reads.Notification, reads.Batch, policy, clock, overrideReads, cursor} {
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "notification query dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "notification query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads, Cursor: cursor}, nil
}

func (s ProductQueries) admit(ctx context.Context, actor auth.Authority, operation auth.Operation) error {
	request, err := auth.ForOperation(operation)
	if err != nil {
		return err
	}
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return err
	}
	if !decision.Allowed {
		return apierr.New(apierr.Forbidden, "notification read forbidden")
	}
	return nil
}

func (s ProductQueries) MyNotifications(ctx context.Context, actor auth.Authority, spec MyNotificationsSpec) (NotificationConnection, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.myNotifications")); err != nil {
		return NotificationConnection{}, err
	}
	if spec.Before != nil && *spec.Before != "" {
		cur, err := s.Cursor.Decode(*spec.Before, actor.Claims().MemberID, spec.UnreadOnly)
		if err != nil {
			return NotificationConnection{}, err
		}
		spec.BeforeCreatedAt = &cur.CreatedAt
		spec.BeforeNotificationID = &cur.NotificationID
	}
	conn, err := s.Reads.Notification.ReadMyNotifications(ctx, actor, spec)
	if err != nil {
		return NotificationConnection{}, err
	}
	if conn.HasMore && len(conn.Items) > 0 {
		last := conn.Items[len(conn.Items)-1]
		token, err := s.Cursor.Encode(Cursor{
			Version:        cursorVersion,
			MemberID:       actor.Claims().MemberID,
			UnreadOnly:     spec.UnreadOnly,
			CreatedAt:      last.CreatedAt,
			NotificationID: last.Id,
		})
		if err != nil {
			return NotificationConnection{}, err
		}
		conn.NextBefore = &token
	}
	documentIDs := make([]string, 0, len(conn.Items))
	for _, item := range conn.Items {
		if item.SubjectType == subjectTypeDocument {
			documentIDs = append(documentIDs, item.SubjectId)
		}
	}
	if len(documentIDs) > 0 {
		if s.Reads.DocumentAudience == nil {
			return NotificationConnection{}, opaqueNotificationProofError()
		}
		readable, err := s.Reads.DocumentAudience.ReadableDocumentIDs(ctx, actor, documentIDs)
		if err != nil {
			return NotificationConnection{}, opaqueNotificationProofError()
		}
		visible := make([]NotificationView, 0, len(conn.Items))
		for _, item := range conn.Items {
			if item.SubjectType != subjectTypeDocument || readable[item.SubjectId] {
				visible = append(visible, item)
			}
		}
		conn.Items = visible
	}
	return conn, nil
}

func (s ProductQueries) MyUnreadNotificationCount(ctx context.Context, actor auth.Authority, _ MyUnreadNotificationCountSpec) (int32, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.myUnreadNotificationCount")); err != nil {
		return 0, err
	}
	return s.Reads.Notification.ReadMyUnreadNotificationCount(ctx, actor, MyUnreadNotificationCountSpec{})
}

func (s ProductQueries) BatchNotificationSubjects(ctx context.Context, actor auth.Authority, keys []SubjectKey) ([]product.BatchResult[SubjectProjection], error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.myNotifications")); err != nil {
		return nil, err
	}
	return s.Reads.Batch.ReadBatchNotificationSubjects(ctx, actor, keys)
}
