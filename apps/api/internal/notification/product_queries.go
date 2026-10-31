package notification

import (
	"context"

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
		if product.MissingDependency(dep) {
			return nil, apierr.New(apierr.Internal, "notification query dependencies required")
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
	if err := decodeNotificationCursor(&spec, s.Cursor, actor.Claims().MemberID); err != nil {
		return NotificationConnection{}, err
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
	conn.Items, err = visibleNotificationItems(ctx, s.Reads.DocumentAudience, actor, conn.Items)
	if err != nil {
		return NotificationConnection{}, err
	}
	return conn, nil
}

func decodeNotificationCursor(spec *MyNotificationsSpec, codec CursorCodec, memberID string) error {
	if spec.Before == nil || *spec.Before == "" {
		return nil
	}
	cur, err := codec.Decode(*spec.Before, memberID, spec.UnreadOnly)
	if err != nil {
		return err
	}
	spec.BeforeCreatedAt = &cur.CreatedAt
	spec.BeforeNotificationID = &cur.NotificationID
	return nil
}

func visibleNotificationItems(ctx context.Context, audience DocumentAudienceReader, actor auth.Authority, items []NotificationView) ([]NotificationView, error) {
	documentIDs := make([]string, 0, len(items))
	for _, item := range items {
		if item.SubjectType == subjectTypeDocument {
			documentIDs = append(documentIDs, item.SubjectId)
		}
	}
	if len(documentIDs) == 0 {
		return items, nil
	}
	if audience == nil {
		return nil, opaqueNotificationProofError()
	}
	readable, err := audience.ReadableDocumentIDs(ctx, actor, documentIDs)
	if err != nil {
		return nil, opaqueNotificationProofError()
	}
	visible := make([]NotificationView, 0, len(items))
	for _, item := range items {
		if item.SubjectType != subjectTypeDocument || readable[item.SubjectId] {
			visible = append(visible, item)
		}
	}
	return visible, nil
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
