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
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dep := range []any{reads.Notification, reads.Batch, policy, clock, overrideReads} {
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
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
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
	return s.Reads.Notification.ReadMyNotifications(ctx, actor, spec)
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
