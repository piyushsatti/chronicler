package notification

import (
	"context"
	"encoding/json"
	"reflect"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
}

func commandDependencyMissing(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock) (*ProductCommands, error) {
	for _, dep := range []any{runner, clock} {
		if commandDependencyMissing(dep) {
			return nil, apierr.New(apierr.Internal, "notification command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock}, nil
}

func runNotificationCommand[T any](ctx context.Context, s ProductCommands, actor auth.Authority, operation string, spec any, meta product.CommandMeta, subjectID string, mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error)) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "notification transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		request, err := auth.ForOperation(auth.Operation("Mutation." + operation))
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "notification command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
			}
			if receipt, ok := any(&result).(*NotificationWriteReceipt); ok {
				receipt.Replayed = true
			}
			return nil
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = mutate(repos, fresh, at)
		if err != nil {
			return err
		}
		if decision.UsedOverride {
			if commandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, claim, auth.OverrideFact{ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "notification", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at}); err != nil {
				return err
			}
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func (s ProductCommands) MarkNotificationsRead(ctx context.Context, actor auth.Authority, spec MarkNotificationsReadSpec, meta product.CommandMeta) (NotificationWriteReceipt, error) {
	normalized, err := normalizeReadIDs(spec.Ids)
	if err != nil {
		return NotificationWriteReceipt{}, err
	}
	spec = MarkNotificationsReadSpec{Ids: normalized}
	return runNotificationCommand(ctx, s, actor, "markNotificationsRead", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (NotificationWriteReceipt, error) {
		return repos.Notification.StoreMarkNotificationsRead(ctx, MarkNotificationsReadWrite{
			ActorID: fresh.Claims().MemberID,
			At:      at,
			Input:   spec,
		})
	})
}

func (s ProductCommands) AcknowledgeSuppressedNotifications(ctx context.Context, actor auth.Authority, spec AcknowledgeSuppressedNotificationsSpec, meta product.CommandMeta) (NotificationWriteReceipt, error) {
	limit, err := normalizeAckLimit(spec.Limit)
	if err != nil {
		return NotificationWriteReceipt{}, err
	}
	spec = AcknowledgeSuppressedNotificationsSpec{Limit: limit}
	return runNotificationCommand(ctx, s, actor, "acknowledgeSuppressedNotifications", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (NotificationWriteReceipt, error) {
		if commandDependencyMissing(repos.Notification) || commandDependencyMissing(repos.Batch) || commandDependencyMissing(repos.DocumentAudience) {
			return NotificationWriteReceipt{}, apierr.New(apierr.Internal, "notification transaction dependencies required")
		}
		locked, err := repos.Notification.LockAcknowledgeSuppressedNotifications(ctx, fresh.Claims().MemberID, spec)
		if err != nil {
			return NotificationWriteReceipt{}, err
		}
		selected, err := selectSuppressedNotificationIDs(ctx, repos.Batch, repos.DocumentAudience, fresh, locked.Candidates)
		if err != nil {
			return NotificationWriteReceipt{}, err
		}
		return repos.Notification.StoreAcknowledgeSuppressedNotifications(ctx, AcknowledgeSuppressedNotificationsWrite{
			ActorID:     fresh.Claims().MemberID,
			At:          at,
			Locked:      locked,
			SelectedIDs: selected,
		})
	})
}
