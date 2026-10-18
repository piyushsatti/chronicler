package site

import (
	"context"
	"fmt"
	"reflect"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
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

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "site product surface pending")
}

func (p *ProductPostgres) ReadHomeCommunity(ctx context.Context, _ auth.Authority, _ HomeSpec) (CommunityStatsSnapshot, error) {
	rows, err := dbgen.New(p.DB).SiteCommunitySnapshot(ctx)
	if err != nil {
		return CommunityStatsSnapshot{}, err
	}
	return mapCommunitySnapshot(rows)
}

func (p *ProductPostgres) ReadSiteStats(ctx context.Context, actor auth.Authority, spec SiteStatsSpec) (CommunityStatsSnapshot, error) {
	return p.ReadHomeCommunity(ctx, actor, HomeSpec{})
}

func (p *ProductPostgres) ReadMemberSearch(ctx context.Context, _ auth.Authority, spec SearchSpec) (MemberDiscoveryPage, error) {
	rows, err := dbgen.New(p.DB).SiteMemberDiscovery(ctx, dbgen.SiteMemberDiscoveryParams{
		Query: spec.Query, PageLimit: spec.Limit, PageOffset: spec.Offset,
	})
	if err != nil {
		return MemberDiscoveryPage{}, err
	}
	return mapMemberDiscovery(rows)
}

func (p *ProductPostgres) ReadBatchActiveAlerts(_ context.Context, _ auth.Authority, keys []ActiveAlertsKey) ([]product.BatchResult[AlertList], error) {
	return make([]product.BatchResult[AlertList], len(keys)), nil
}

func (p *ProductPostgres) ReadAdminOperations(context.Context, auth.Authority, AdminOperationsSpec) (AdminOperationsView, error) {
	return AdminOperationsView{}, p.pending()
}
func (p *ProductPostgres) ReadDiscordDeliveryMode(context.Context, auth.Authority, DiscordDeliveryModeSpec) (string, error) {
	return "", p.pending()
}
func (p *ProductPostgres) ReadHomeBanner(context.Context, auth.Authority, HomeBannerSpec) (HomeBannerView, error) {
	return HomeBannerView{}, p.pending()
}
func (p *ProductPostgres) ReadQuestAnnouncementRoleSetting(context.Context, auth.Authority, QuestAnnouncementRoleSettingSpec) (QuestAnnouncementRoleSettingView, error) {
	return QuestAnnouncementRoleSettingView{}, p.pending()
}
func (p *ProductPostgres) ReadSearchableKinds(context.Context, auth.Authority, SearchableKindsSpec) ([]SearchKindView, error) {
	return nil, p.pending()
}

func (p *ProductPostgres) LockRedriveDiscordDelivery(context.Context, RedriveDiscordDeliverySpec) (RedriveDiscordDeliveryState, error) {
	return RedriveDiscordDeliveryState{}, p.pending()
}
func (p *ProductPostgres) StoreRedriveDiscordDelivery(context.Context, RedriveDiscordDeliveryWrite) (quest.DeliveryReceipt, error) {
	return quest.DeliveryReceipt{}, p.pending()
}
func (p *ProductPostgres) LockUpdateHomeBanner(context.Context, UpdateHomeBannerSpec) (UpdateHomeBannerState, error) {
	return UpdateHomeBannerState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateHomeBanner(context.Context, UpdateHomeBannerWrite) (HomeBannerView, error) {
	return HomeBannerView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateQuestAnnouncementRoleSetting(context.Context, UpdateQuestAnnouncementRoleSettingSpec) (UpdateQuestAnnouncementRoleSettingState, error) {
	return UpdateQuestAnnouncementRoleSettingState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateQuestAnnouncementRoleSetting(context.Context, UpdateQuestAnnouncementRoleSettingWrite) (QuestAnnouncementRoleSettingView, error) {
	return QuestAnnouncementRoleSettingView{}, p.pending()
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
