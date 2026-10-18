package site

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dep := range []any{runner, clock, ids} {
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "site command dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "site command dependencies required")
			}
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func siteCommandDependencyMissing(value any) bool {
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

func runSiteCommand[T any](ctx context.Context, s ProductCommands, actor auth.Authority, operation string, spec any, meta product.CommandMeta, subjectID string, mutate func(ProductCommandRepos, auth.Authority, time.Time) (T, error)) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if siteCommandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "site transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "site authority changed")
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
			return apierr.New(apierr.Forbidden, "site command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, operation, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			if err := json.Unmarshal(claim.Receipt, &result); err != nil {
				return err
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
			if siteCommandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, auth.OverrideFact{ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "site", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at}); err != nil {
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

func siteCommandID(value *string) error {
	parsed, err := uuid.Parse(*value)
	if err != nil || parsed == uuid.Nil || !strings.EqualFold(parsed.String(), *value) {
		return apierr.New(apierr.Invalid, "invalid public id")
	}
	*value = parsed.String()
	return nil
}

func siteOptionalText(value *string, max int) error {
	if value == nil {
		return nil
	}
	if !utf8.ValidString(*value) || utf8.RuneCountInString(*value) > max {
		return apierr.New(apierr.Invalid, "invalid site text")
	}
	return nil
}

func validateHomeBanner(fields HomeBannerFields) error {
	if err := siteOptionalText(fields.Body, 131072); err != nil {
		return err
	}
	if err := siteOptionalText(fields.CtaHref, 2048); err != nil {
		return err
	}
	if err := siteOptionalText(fields.CtaLabel, 200); err != nil {
		return err
	}
	if err := siteOptionalText(fields.MediaKind, 64); err != nil {
		return err
	}
	if err := siteOptionalText(fields.MediaLabel, 200); err != nil {
		return err
	}
	if err := siteOptionalText(fields.MediaUrl, 2048); err != nil {
		return err
	}
	if err := siteOptionalText(fields.Title, 200); err != nil {
		return err
	}
	return nil
}

func (s ProductCommands) UpdateHomeBanner(ctx context.Context, actor auth.Authority, spec UpdateHomeBannerSpec, meta product.CommandMeta) (HomeBannerView, error) {
	if err := validateHomeBanner(spec.Input); err != nil {
		return HomeBannerView{}, err
	}
	return runSiteCommand(ctx, s, actor, "updateHomeBanner", spec, meta, settingHomeBanner, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (HomeBannerView, error) {
		locked, err := repos.Site.LockUpdateHomeBanner(ctx, spec)
		if err != nil {
			return HomeBannerView{}, err
		}
		if !locked.Exists {
			return HomeBannerView{}, apierr.New(apierr.NotFound, "home banner setting not found")
		}
		return repos.Site.StoreUpdateHomeBanner(ctx, UpdateHomeBannerWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) UpdateQuestAnnouncementRoleSetting(ctx context.Context, actor auth.Authority, spec UpdateQuestAnnouncementRoleSettingSpec, meta product.CommandMeta) (QuestAnnouncementRoleSettingView, error) {
	if spec.Input.RoleId != nil {
		roleID := strings.TrimSpace(*spec.Input.RoleId)
		if roleID == "" || len(roleID) > 64 {
			return QuestAnnouncementRoleSettingView{}, apierr.New(apierr.Invalid, "invalid announcement role id")
		}
		spec.Input.RoleId = &roleID
	}
	return runSiteCommand(ctx, s, actor, "updateQuestAnnouncementRoleSetting", spec, meta, settingQuestAnnouncementRole, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (QuestAnnouncementRoleSettingView, error) {
		locked, err := repos.Site.LockUpdateQuestAnnouncementRoleSetting(ctx, spec)
		if err != nil {
			return QuestAnnouncementRoleSettingView{}, err
		}
		if !locked.Exists {
			return QuestAnnouncementRoleSettingView{}, apierr.New(apierr.NotFound, "announcement role setting not found")
		}
		return repos.Site.StoreUpdateQuestAnnouncementRoleSetting(ctx, UpdateQuestAnnouncementRoleSettingWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (s ProductCommands) RedriveDiscordDelivery(ctx context.Context, actor auth.Authority, spec RedriveDiscordDeliverySpec, meta product.CommandMeta) (quest.DeliveryReceipt, error) {
	spec.Reason = strings.TrimSpace(spec.Reason)
	if spec.Reason == "" || utf8.RuneCountInString(spec.Reason) > 2000 {
		return quest.DeliveryReceipt{}, apierr.New(apierr.Invalid, "invalid redrive reason")
	}
	if err := siteCommandID(&spec.JobId); err != nil {
		return quest.DeliveryReceipt{}, err
	}
	return runSiteCommand(ctx, s, actor, "redriveDiscordDelivery", spec, meta, spec.JobId, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (quest.DeliveryReceipt, error) {
		locked, err := repos.Operations.LockRedriveDiscordDelivery(ctx, spec)
		if err != nil {
			return quest.DeliveryReceipt{}, err
		}
		if !locked.Exists || locked.Before == nil {
			return quest.DeliveryReceipt{}, apierr.New(apierr.NotFound, "delivery job not found")
		}
		return repos.Operations.StoreRedriveDiscordDelivery(ctx, RedriveDiscordDeliveryWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}
