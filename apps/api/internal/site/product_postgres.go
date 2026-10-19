package site

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

const memberSearchOrder = "handle_asc_id_asc"

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("site database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) queries() *dbgen.Queries {
	return dbgen.New(p.DB)
}

func (p *ProductPostgres) ReadHomeCommunity(ctx context.Context, _ auth.Authority, _ HomeSpec) (CommunityStatsSnapshot, error) {
	rows, err := p.queries().SiteCommunitySnapshot(ctx)
	if err != nil {
		return CommunityStatsSnapshot{}, err
	}
	return mapCommunitySnapshot(rows)
}

func (p *ProductPostgres) ReadSiteStats(ctx context.Context, actor auth.Authority, spec SiteStatsSpec) (CommunityStatsSnapshot, error) {
	return p.ReadHomeCommunity(ctx, actor, HomeSpec{})
}

func (p *ProductPostgres) ReadMemberSearch(ctx context.Context, _ auth.Authority, spec SearchSpec) (MemberDiscoveryPage, error) {
	rows, err := p.queries().SiteMemberDiscovery(ctx, dbgen.SiteMemberDiscoveryParams{
		Query: spec.Query, PageLimit: spec.Limit, PageOffset: spec.Offset,
	})
	if err != nil {
		return MemberDiscoveryPage{}, err
	}
	return mapMemberDiscovery(rows)
}

func (p *ProductPostgres) ReadBatchActiveAlerts(ctx context.Context, _ auth.Authority, keys []ActiveAlertsKey) ([]product.BatchResult[AlertList], error) {
	out := make([]product.BatchResult[AlertList], len(keys))
	for i, key := range keys {
		rows, err := p.queries().SiteActiveAlerts(ctx, dbgen.SiteActiveAlertsParams{
			PageLimit: key.Limit, PageOffset: key.Offset,
		})
		if err != nil {
			out[i] = product.BatchResult[AlertList]{Err: err}
			continue
		}
		list, err := mapActiveAlerts(rows)
		if err != nil {
			out[i] = product.BatchResult[AlertList]{Err: err}
			continue
		}
		out[i] = product.BatchResult[AlertList]{Value: &list}
	}
	return out, nil
}

func (p *ProductPostgres) ReadSearchableKinds(context.Context, auth.Authority, SearchableKindsSpec) ([]SearchKindView, error) {
	return mapSearchKinds(SearchableKinds()), nil
}

func (p *ProductPostgres) ReadHomeBanner(ctx context.Context, _ auth.Authority, _ HomeBannerSpec) (HomeBannerView, error) {
	row, err := p.readSetting(ctx, settingHomeBanner)
	if errors.Is(err, pgx.ErrNoRows) {
		return parseHomeBanner(nil), nil
	}
	if err != nil {
		return HomeBannerView{}, err
	}
	return parseHomeBanner(row.Payload), nil
}

func (p *ProductPostgres) ReadQuestAnnouncementRoleSetting(ctx context.Context, _ auth.Authority, _ QuestAnnouncementRoleSettingSpec) (QuestAnnouncementRoleSettingView, error) {
	row, err := p.readSetting(ctx, settingQuestAnnouncementRole)
	if errors.Is(err, pgx.ErrNoRows) {
		return parseQuestAnnouncementRole(nil), nil
	}
	if err != nil {
		return QuestAnnouncementRoleSettingView{}, err
	}
	return parseQuestAnnouncementRole(row.Payload), nil
}

func (p *ProductPostgres) ReadDiscordDeliveryMode(ctx context.Context, _ auth.Authority, _ DiscordDeliveryModeSpec) (string, error) {
	row, err := p.readSetting(ctx, settingDiscordDeliveryMode)
	if errors.Is(err, pgx.ErrNoRows) {
		return defaultDiscordDeliveryMode, nil
	}
	if err != nil {
		return "", err
	}
	return parseDiscordDeliveryMode(row.Payload), nil
}

func (p *ProductPostgres) ReadAdminOperations(ctx context.Context, _ auth.Authority, spec AdminOperationsSpec) (AdminOperationsView, error) {
	deliveryState := pgtype.Text{}
	if spec.DeliveryState != nil {
		deliveryState = pgtype.Text{String: strings.ToLower(*spec.DeliveryState), Valid: true}
	}
	counts, err := p.queries().SiteAdminDeliveryCounts(ctx, deliveryState)
	if err != nil {
		return AdminOperationsView{}, err
	}
	rows, err := p.queries().SiteAdminDeliveryJobs(ctx, dbgen.SiteAdminDeliveryJobsParams{
		DeliveryState: deliveryState,
		PageOffset:    spec.Offset,
		PageLimit:     spec.Limit,
	})
	if err != nil {
		return AdminOperationsView{}, err
	}
	publicOrigin := ""
	if originRow, err := p.readSetting(ctx, settingPublicOrigin); err == nil {
		publicOrigin = parsePublicOrigin(originRow.Payload)
	}
	announcementRole, _ := p.ReadQuestAnnouncementRoleSetting(ctx, auth.Authority{}, QuestAnnouncementRoleSettingSpec{})
	deliveryMode, _ := p.ReadDiscordDeliveryMode(ctx, auth.Authority{}, DiscordDeliveryModeSpec{})
	config := AdminDeliveryConfigView{
		DeliveryMode:           deliveryMode,
		PublicOrigin:           publicOrigin,
		AnnouncementRoleId:     announcementRole.RoleId,
		AnnouncementRoleSource: "site_settings",
	}
	if announcementRole.RoleId != nil {
		config.AnnouncementRoleSource = "site_settings"
	}
	deliveries := make([]AdminDeliveryJobView, 0)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		deliveries = append(deliveries, mapAdminDeliveryJob(row, publicOrigin))
	}
	total := counts.TotalCount
	if len(rows) > 0 {
		total = int32(rows[0].Total)
	}
	alertCount, err := p.queries().SiteActiveAlertCount(ctx)
	if err != nil {
		return AdminOperationsView{}, err
	}
	return AdminOperationsView{
		ActiveAlertCount:      alertCount,
		Config:                config,
		Deliveries:            deliveries,
		DeliveryTotal:         total,
		PendingDeliveryCount:  counts.PendingCount,
		TerminalDeliveryCount: counts.TerminalCount,
		ScheduledWork:         []ScheduledWorkStatusView{},
	}, nil
}

func mapActiveAlerts(rows []dbgen.SiteActiveAlertsRow) (AlertList, error) {
	if len(rows) == 0 {
		return AlertList{Items: []AdminHealthAlertView{}}, nil
	}
	list := AlertList{Items: make([]AdminHealthAlertView, 0, len(rows))}
	total := rows[0].Total
	for _, row := range rows {
		if row.Total != total {
			return AlertList{}, fmt.Errorf("site active alerts totals differ across page rows")
		}
		if !row.Key.Valid {
			if row.Label.Valid || row.Severity.Valid || row.RemediationHref.Valid {
				return AlertList{}, fmt.Errorf("site active alerts returned fields without a key")
			}
			continue
		}
		if !row.Label.Valid || !row.Severity.Valid || !row.RemediationHref.Valid {
			return AlertList{}, fmt.Errorf("site active alerts returned an incomplete alert row")
		}
		alert := AdminHealthAlertView{
			Key: row.Key.String, Label: row.Label.String, Severity: row.Severity.String,
			RemediationHref: row.RemediationHref.String,
			FirstSeenAt:     productTimePointer(row.FirstSeenAt),
			LastSeenAt:      productTimePointer(row.LastSeenAt),
		}
		list.Items = append(list.Items, alert)
	}
	return list, nil
}

func productTimePointer(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	out := value.Time
	return &out
}

func (p *ProductPostgres) LockUpdateHomeBanner(ctx context.Context, _ UpdateHomeBannerSpec) (UpdateHomeBannerState, error) {
	return p.lockSiteSetting(ctx, settingHomeBanner, defaultHomeBannerPayload(), func(payload []byte) *HomeBannerView {
		view := parseHomeBanner(payload)
		return &view
	})
}

func (p *ProductPostgres) StoreUpdateHomeBanner(ctx context.Context, write UpdateHomeBannerWrite) (HomeBannerView, error) {
	payload, err := marshalHomeBanner(write.ValidatedInput.Input)
	if err != nil {
		return HomeBannerView{}, err
	}
	row, err := p.queries().SiteReplaceSetting(ctx, dbgen.SiteReplaceSettingParams{
		Payload: payload, At: pgtype.Timestamptz{Time: write.At, Valid: true}, SettingKey: settingHomeBanner,
	})
	if err != nil {
		return HomeBannerView{}, err
	}
	return parseHomeBanner(row.Payload), nil
}

func (p *ProductPostgres) LockUpdateQuestAnnouncementRoleSetting(ctx context.Context, _ UpdateQuestAnnouncementRoleSettingSpec) (UpdateQuestAnnouncementRoleSettingState, error) {
	state, err := p.lockSiteSetting(ctx, settingQuestAnnouncementRole, defaultQuestAnnouncementRolePayload(), func(payload []byte) *HomeBannerView {
		view := parseQuestAnnouncementRole(payload)
		banner := HomeBannerView{}
		if view.RoleId != nil {
			banner.Title = view.RoleId
		}
		banner.Enabled = view.Enabled
		return &banner
	})
	if err != nil {
		return UpdateQuestAnnouncementRoleSettingState{}, err
	}
	var before *HomeBannerView
	if state.Before != nil {
		before = state.Before
	}
	return UpdateQuestAnnouncementRoleSettingState{
		Exists: state.Exists, SubjectID: state.SubjectID, OwnerID: state.OwnerID,
		Version: state.Version, UpdatedAt: state.UpdatedAt, Before: before,
	}, nil
}

func (p *ProductPostgres) StoreUpdateQuestAnnouncementRoleSetting(ctx context.Context, write UpdateQuestAnnouncementRoleSettingWrite) (QuestAnnouncementRoleSettingView, error) {
	payload, err := marshalQuestAnnouncementRole(write.ValidatedInput.Input)
	if err != nil {
		return QuestAnnouncementRoleSettingView{}, err
	}
	row, err := p.queries().SiteReplaceSetting(ctx, dbgen.SiteReplaceSettingParams{
		Payload: payload, At: pgtype.Timestamptz{Time: write.At, Valid: true}, SettingKey: settingQuestAnnouncementRole,
	})
	if err != nil {
		return QuestAnnouncementRoleSettingView{}, err
	}
	return parseQuestAnnouncementRole(row.Payload), nil
}

func (p *ProductPostgres) LockRedriveDiscordDelivery(ctx context.Context, spec RedriveDiscordDeliverySpec) (RedriveDiscordDeliveryState, error) {
	jobID, err := db.ParseUUID(spec.JobId)
	if err != nil || db.UUIDString(jobID) != spec.JobId {
		return RedriveDiscordDeliveryState{}, apierr.New(apierr.Invalid, "invalid job id")
	}
	row, err := p.queries().SiteLockDiscordDeliveryJob(ctx, jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return RedriveDiscordDeliveryState{}, apierr.New(apierr.NotFound, "delivery job not found")
	}
	if err != nil {
		return RedriveDiscordDeliveryState{}, err
	}
	if row.State != "dead" && row.State != "repair_required" {
		return RedriveDiscordDeliveryState{}, apierr.New(apierr.Conflict, "delivery job cannot be redriven")
	}
	before := mapLockedDeliveryJob(row)
	updatedAt := row.UpdatedAt.Time
	return RedriveDiscordDeliveryState{
		Exists: true, SubjectID: spec.JobId, OwnerID: spec.JobId, UpdatedAt: &updatedAt, Before: &before,
	}, nil
}

func (p *ProductPostgres) StoreRedriveDiscordDelivery(ctx context.Context, write RedriveDiscordDeliveryWrite) (quest.DeliveryReceipt, error) {
	jobID, err := db.ParseUUID(write.ValidatedInput.JobId)
	if err != nil {
		return quest.DeliveryReceipt{}, err
	}
	clock, err := p.queries().SiteJobClock(ctx)
	if err != nil {
		return quest.DeliveryReceipt{}, err
	}
	row, err := p.queries().SiteRedriveDiscordDeliveryJob(ctx, dbgen.SiteRedriveDiscordDeliveryJobParams{
		NextRunAt: clock, At: pgtype.Timestamptz{Time: write.At, Valid: true}, JobID: jobID,
	})
	if err != nil {
		return quest.DeliveryReceipt{}, err
	}
	if write.Locked.Before == nil {
		return quest.DeliveryReceipt{}, fmt.Errorf("locked delivery job required")
	}
	receipt := quest.DeliveryReceipt{JobId: db.UUIDString(row.PublicID), DeliveryStatus: row.State}
	if write.Locked.Before.DesiredRevision != nil {
		receipt.DesiredRevision = *write.Locked.Before.DesiredRevision
	}
	if write.Locked.Before.AppliedRevision != nil {
		receipt.AppliedRevision = *write.Locked.Before.AppliedRevision
	}
	return receipt, nil
}

func (p *ProductPostgres) readSetting(ctx context.Context, key string) (dbgen.SiteReadSettingRow, error) {
	return p.queries().SiteReadSetting(ctx, key)
}

func (p *ProductPostgres) lockSiteSetting(ctx context.Context, key string, initial []byte, before func([]byte) *HomeBannerView) (UpdateHomeBannerState, error) {
	at := time.Now().UTC()
	if _, err := p.queries().SiteEnsureSetting(ctx, dbgen.SiteEnsureSettingParams{
		SettingKey: key, InitialPayload: initial, At: pgtype.Timestamptz{Time: at, Valid: true},
	}); err != nil {
		return UpdateHomeBannerState{}, err
	}
	row, err := p.queries().SiteLockSetting(ctx, key)
	if err != nil {
		return UpdateHomeBannerState{}, err
	}
	updatedAt := row.UpdatedAt.Time
	view := before(row.Payload)
	return UpdateHomeBannerState{
		Exists: true, SubjectID: key, OwnerID: key, UpdatedAt: &updatedAt, Before: view,
	}, nil
}

func mapAdminDeliveryJob(row dbgen.SiteAdminDeliveryJobsRow, publicOrigin string) AdminDeliveryJobView {
	state := ""
	if row.State.Valid {
		state = row.State.String
	}
	job := AdminDeliveryJobView{
		Id: db.UUIDString(row.PublicID), State: state, FailureStreak: row.Attempts.Int32,
		MaxAttempts: deliveryJobMaxAttempts, RedriveCount: row.RedriveCount.Int32,
	}
	if row.CreatedAt.Valid {
		job.CreatedAt = row.CreatedAt.Time
	}
	if row.UpdatedAt.Valid {
		job.UpdatedAt = row.UpdatedAt.Time
	}
	if row.NextRunAt.Valid {
		job.NextAttemptAt = row.NextRunAt.Time
	}
	if row.SafeErrorCode.Valid {
		job.SafeError = &row.SafeErrorCode.String
	}
	if row.QuestPublicID.Valid {
		id := db.UUIDString(row.QuestPublicID)
		job.QuestId = &id
	}
	if row.QuestShortCode.Valid {
		job.QuestShortCode = &row.QuestShortCode.String
		if publicOrigin != "" {
			link := publicOrigin + "/quests/" + row.QuestShortCode.String
			job.QuestLink = &link
		}
	}
	if row.QuestTitle.Valid {
		job.QuestTitle = &row.QuestTitle.String
	}
	if row.DiscordDesiredRevision.Valid {
		job.DesiredRevision = &row.DiscordDesiredRevision.Int32
	}
	if row.DiscordAppliedRevision.Valid {
		job.AppliedRevision = &row.DiscordAppliedRevision.Int32
	}
	if row.DiscordMessageID.Valid {
		job.MessageId = &row.DiscordMessageID.String
	}
	if row.EventUrl.Valid {
		job.EventLink = &row.EventUrl.String
	}
	return job
}

func mapLockedDeliveryJob(row dbgen.SiteLockDiscordDeliveryJobRow) AdminDeliveryJobView {
	job := AdminDeliveryJobView{
		Id: db.UUIDString(row.PublicID), State: row.State, FailureStreak: row.Attempts,
		MaxAttempts: deliveryJobMaxAttempts, RedriveCount: row.RedriveCount,
		CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time, NextAttemptAt: row.NextRunAt.Time,
	}
	if row.SafeErrorCode.Valid {
		job.SafeError = &row.SafeErrorCode.String
	}
	if row.QuestPublicID.Valid {
		id := db.UUIDString(row.QuestPublicID)
		job.QuestId = &id
	}
	if row.DiscordDesiredRevision.Valid {
		job.DesiredRevision = &row.DiscordDesiredRevision.Int32
	}
	if row.DiscordAppliedRevision.Valid {
		job.AppliedRevision = &row.DiscordAppliedRevision.Int32
	}
	return job
}

func mapCommunitySnapshot(rows []dbgen.SiteCommunitySnapshotRow) (CommunityStatsSnapshot, error) {
	if len(rows) == 0 {
		return CommunityStatsSnapshot{}, fmt.Errorf("site community snapshot returned no totals row")
	}
	first := rows[0]
	snapshot := CommunityStatsSnapshot{
		TotalMembers: first.TotalMembers, ActiveCharacters: first.ActiveCharacters,
		TotalMaps: first.TotalMaps,
		TotalRegions: first.TotalRegions, TotalQuests: first.TotalQuests,
		TotalDMs: first.TotalDms,
		Activity: member.ActivitySummaryView{
			VoiceMinutes: first.VoiceMinutes, Messages: first.Messages, Reactions: first.Reactions,
		},
		MembersByRole: make([]CountByKeyView, 0, len(rows)),
	}
	for _, row := range rows {
		if row.TotalMembers != first.TotalMembers || row.ActiveCharacters != first.ActiveCharacters ||
			row.TotalMaps != first.TotalMaps || row.TotalPointcrawlNodes != first.TotalPointcrawlNodes ||
			row.TotalRegions != first.TotalRegions || row.TotalQuests != first.TotalQuests ||
			row.TotalDms != first.TotalDms || row.VoiceMinutes != first.VoiceMinutes ||
			row.Messages != first.Messages || row.Reactions != first.Reactions {
			return CommunityStatsSnapshot{}, fmt.Errorf("site community snapshot totals differ across role rows")
		}
		if row.Role == nil {
			continue
		}
		role, ok := row.Role.(string)
		if !ok || !row.MemberCount.Valid {
			return CommunityStatsSnapshot{}, fmt.Errorf("site community snapshot returned malformed role row")
		}
		snapshot.MembersByRole = append(snapshot.MembersByRole, CountByKeyView{Key: role, Count: row.MemberCount.Int32})
	}
	return snapshot, nil
}

func mapMemberDiscovery(rows []dbgen.SiteMemberDiscoveryRow) (MemberDiscoveryPage, error) {
	if len(rows) == 0 {
		return MemberDiscoveryPage{}, fmt.Errorf("site member discovery returned no total row")
	}
	page := MemberDiscoveryPage{Total: rows[0].Total, Order: memberSearchOrder, Items: make([]member.MemberSearchHitView, 0, len(rows))}
	for _, row := range rows {
		if row.Total != page.Total {
			return MemberDiscoveryPage{}, fmt.Errorf("site member discovery totals differ across page rows")
		}
		if !row.PublicID.Valid {
			if row.Handle.Valid || row.DisplayName.Valid || row.AvatarUrl.Valid {
				return MemberDiscoveryPage{}, fmt.Errorf("site member discovery returned identity fields without a public id")
			}
			continue
		}
		if !row.Handle.Valid || !row.DisplayName.Valid {
			return MemberDiscoveryPage{}, fmt.Errorf("site member discovery returned an incomplete public identity")
		}
		var avatar *string
		if row.AvatarUrl.Valid {
			value := row.AvatarUrl.String
			avatar = &value
		}
		page.Items = append(page.Items, member.MemberSearchHitView{
			MemberId: uuid.UUID(row.PublicID.Bytes).String(), Handle: row.Handle.String,
			DisplayName: row.DisplayName.String, AvatarUrl: avatar,
		})
	}
	return page, nil
}
