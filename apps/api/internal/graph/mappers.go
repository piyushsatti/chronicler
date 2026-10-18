package graph

import (
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func intPtr(v int) *int       { return &v }
func strPtr(v string) *string { return &v }

func toDocumentType(d document.Document, body string) *DocumentType {
	cat := d.Kind
	return &DocumentType{
		ID:            d.ID,
		Slug:          d.Slug,
		Kind:          d.Kind,
		Category:      &cat,
		Status:        string(d.Status),
		Visibility:    string(d.Visibility),
		Title:         d.Title,
		AuthorID:      d.AuthorID,
		Frontmatter:   map[string]any{},
		UpdatedAt:     time.Now(),
		EffectiveBody: &body,
	}
}

func toQuestV2(q quest.LegacyQuestView) *QuestV2Type {
	status := string(q.Status)
	return &QuestV2Type{
		ID:            q.ID,
		ShortCode:     q.ShortCode,
		Kinds:         []string{"standard"},
		Status:        status,
		DmID:          q.DMID,
		ScheduledAt:   q.ScheduledAt,
		DurationHours: q.DurationHours,
		DisplayStatus: strPtr(q.DisplayStatus),
		SlotsMax:      q.SlotsMax,
		FilledCount:   q.FilledCount,
		DocumentID:    q.DocumentID,
		Tags:          []string{},
		Genres:        []string{},
		CreatedBy:     q.DMID,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		DiscordDelivery: &QuestDiscordDeliveryV2Type{
			DesiredRevision: q.DiscordDesiredRevision,
			AppliedRevision: q.DiscordAppliedRevision,
			OverallStatus:   "pending",
		},
	}
}

func toMemberType(m member.Member) *MemberType {
	return &MemberType{
		ID:          m.ID,
		Handle:      m.Handle,
		DisplayName: m.DisplayName,
		Status:      string(m.Status),
		Roles:       m.Roles,
		JoinedAt:    time.Now(),
	}
}

func toCharacterV2(c character.LegacyCharacterView) *CharacterV2Type {
	now := time.Now()
	return &CharacterV2Type{
		ID:                      c.ID,
		ShortCode:               c.ShortCode,
		Name:                    c.Name,
		OwnerID:                 c.OwnerID,
		Status:                  c.Status,
		RegionID:                "",
		BackstoryID:             "",
		Pcxp:                    c.PCXP,
		CreatedAt:               now,
		UpdatedAt:               now,
		VerificationSubmittedAt: now,
	}
}

func toHome(stats site.Stats) *HomeV2Type {
	return &HomeV2Type{
		RecentByCategory: []*HomeBucketType{},
		CommunityStats: &SiteStatsV2Type{
			TotalMembers: stats.TotalMembers,
		},
		QuestBoard: []*QuestBoardEntryType{},
	}
}

func toHexV2(h spatial.Hex) *HexV2Type {
	terrain := h.Terrain
	if terrain == "" {
		terrain = "unknown"
	}
	return &HexV2Type{
		ID:        h.ID,
		MapID:     h.MapID,
		Col:       h.Col,
		Row:       h.Row,
		Terrain:   terrain,
		Elevation: strPtr(h.Elevation),
		Climate:   strPtr(h.Climate),
		CreatedAt: time.Now(),
	}
}

func toMapV2(m spatial.LegacyMapView) *MapV2Type {
	return &MapV2Type{
		ID:        m.ID,
		Name:      m.Name,
		AtlasCode: m.AtlasCode,
		Family:    m.Family,
		RegionID:  strPtr(m.RegionID),
		Cols:      intPtr(m.Cols),
		Rows:      intPtr(m.Rows),
		CreatedBy: "",
		CreatedAt: time.Now(),
		Hexes:     []*HexV2Type{},
		Edges:     []*HexEdgeV2Type{},
	}
}
