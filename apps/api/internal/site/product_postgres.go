package site

import (
	"context"
	"fmt"
	"reflect"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
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

func mapCommunitySnapshot(rows []dbgen.SiteCommunitySnapshotRow) (CommunityStatsSnapshot, error) {
	if len(rows) == 0 {
		return CommunityStatsSnapshot{}, fmt.Errorf("site community snapshot returned no totals row")
	}
	first := rows[0]
	snapshot := CommunityStatsSnapshot{
		TotalMembers: first.TotalMembers, ActiveCharacters: first.ActiveCharacters,
		TotalMaps: first.TotalMaps, TotalHexes: first.TotalHexes,
		TotalRegions: first.TotalRegions, TotalQuests: first.TotalQuests,
		TotalDMs: first.TotalDms,
		Activity: member.ActivitySummaryView{
			VoiceMinutes: first.VoiceMinutes, Messages: first.Messages, Reactions: first.Reactions,
		},
		MembersByRole: make([]CountByKeyView, 0, len(rows)),
	}
	for _, row := range rows {
		if row.TotalMembers != first.TotalMembers || row.ActiveCharacters != first.ActiveCharacters ||
			row.TotalMaps != first.TotalMaps || row.TotalHexes != first.TotalHexes ||
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
