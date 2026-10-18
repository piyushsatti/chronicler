package character

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

const characterProductListSummaries = `-- name: CharacterProductListSummaries :many
SELECT document.public_id AS id, document.kind, document.slug, document.title,
       document.category, document.status, document.visibility, document.policy,
       document.frontmatter_yaml, author.public_id AS author_id, document.published_at,
       document.deleted_at, deleted_by.public_id AS deleted_by, document.updated_at,
       document.version, document.body
FROM document_links link
JOIN documents document ON document.id = link.source_id
JOIN characters character ON character.id = link.character_target_id
JOIN members author ON author.id = document.author_id
LEFT JOIN members deleted_by ON deleted_by.id = document.deleted_by
WHERE character.public_id = $1
  AND link.relation = 'summarizes'
  AND document.kind = 'summary'
  AND document.deleted_at IS NULL
ORDER BY link.summary_append_order ASC, document.public_id ASC
LIMIT $2 OFFSET $3`

const characterProductCountSummaries = `-- name: CharacterProductCountSummaries :one
SELECT count(*)::int AS total
FROM document_links link
JOIN documents document ON document.id = link.source_id
JOIN characters character ON character.id = link.character_target_id
WHERE character.public_id = $1
  AND link.relation = 'summarizes'
  AND document.kind = 'summary'
  AND document.deleted_at IS NULL`

func (p *ProductPostgres) ReadCharacterLogs(ctx context.Context, _ auth.Authority, spec CharacterLogsSpec) (CharacterLogListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return CharacterLogListResult{}, err
	}
	rows, err := p.queries().CharacterProductListLogs(ctx, dbgen.CharacterProductListLogsParams{
		CharacterID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return CharacterLogListResult{}, err
	}
	total, err := p.queries().CharacterProductCountLogs(ctx, characterID)
	if err != nil {
		return CharacterLogListResult{}, err
	}
	out := CharacterLogListResult{Items: make([]CharacterLogView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, CharacterLogView{
			Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Body: row.Body,
			CreatedAt: row.CreatedAt.Time, CreatedBy: characterUUIDPointer(row.CreatedBy),
			QuestId: characterUUIDPointer(row.QuestID),
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadBackstories(ctx context.Context, _ auth.Authority, spec BackstoriesSpec) (BackstoryPage, error) {
	arg := dbgen.CharacterProductListBackstoriesParams{RowLimit: spec.Limit, RowOffset: spec.Offset}
	if spec.Filters != nil {
		arg.IncludeRetired = spec.Filters.IncludeRetired
		if spec.Filters.Cohort != nil {
			arg.Cohort = pgtype.Text{String: *spec.Filters.Cohort, Valid: true}
		}
		if spec.Filters.RegionId != nil {
			id, err := characterProductID(*spec.Filters.RegionId)
			if err != nil {
				return BackstoryPage{}, err
			}
			arg.RegionID = id
		}
	}
	rows, err := p.queries().CharacterProductListBackstories(ctx, arg)
	if err != nil {
		return BackstoryPage{}, err
	}
	total, err := p.queries().CharacterProductCountBackstories(ctx, dbgen.CharacterProductCountBackstoriesParams{
		IncludeRetired: arg.IncludeRetired, RegionID: arg.RegionID, Cohort: arg.Cohort,
	})
	if err != nil {
		return BackstoryPage{}, err
	}
	out := BackstoryPage{Items: make([]BackstoryView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, BackstoryView{
			Id: db.UUIDString(row.ID), Name: row.Name, Lore: row.Lore, Cohort: row.Cohort,
			Retired: row.Retired, SourceRegionId: characterUUIDPointer(row.SourceRegionID),
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCreationCatalog(ctx context.Context, _ auth.Authority, spec CreationCatalogSpec) (CreationCatalogPage, error) {
	arg := dbgen.CharacterProductCreationCatalogParams{RowLimit: spec.Limit, RowOffset: spec.Offset, IncludeAll: false}
	if spec.Filters != nil {
		arg.IncludeAll = spec.Filters.IncludeAll
		arg.Kind = optionalCharacterText(spec.Filters.Kind)
		if spec.Filters.RegionId != nil {
			id, err := characterProductID(*spec.Filters.RegionId)
			if err != nil {
				return CreationCatalogPage{}, err
			}
			arg.RegionID = id
		}
	}
	rows, err := p.queries().CharacterProductCreationCatalog(ctx, arg)
	if err != nil {
		return CreationCatalogPage{}, err
	}
	total, err := p.queries().CharacterProductCountCreationCatalog(ctx, dbgen.CharacterProductCountCreationCatalogParams{
		IncludeAll: arg.IncludeAll, Kind: arg.Kind, RegionID: arg.RegionID,
	})
	if err != nil {
		return CreationCatalogPage{}, err
	}
	out := CreationCatalogPage{Items: make([]CreationCatalogEntryView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, CreationCatalogEntryView{
			Id: db.UUIDString(row.ID), Kind: row.Kind, Name: row.Name, Available: row.Available,
			Description: characterTextPointer(row.Description), Retired: row.Retired,
			IntroducedByRegionId: characterUUIDPointer(row.IntroducedByRegionID),
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCoPlayers(ctx context.Context, _ auth.Authority, spec CoPlayersSpec) (CoPlayerPage, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return CoPlayerPage{}, err
	}
	rows, err := p.queries().CharacterProductListCoPlayers(ctx, dbgen.CharacterProductListCoPlayersParams{
		PublicID: characterID, Limit: spec.Limit, Offset: spec.Offset,
	})
	if err != nil {
		return CoPlayerPage{}, err
	}
	total, err := p.queries().CharacterProductCountCoPlayers(ctx, characterID)
	if err != nil {
		return CoPlayerPage{}, err
	}
	out := CoPlayerPage{Items: make([]CoPlayerView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, CoPlayerView{
			CharacterId: db.UUIDString(row.CharacterID), MemberId: db.UUIDString(row.MemberID), QuestCount: row.QuestCount,
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadDowntimeProjects(ctx context.Context, _ auth.Authority, spec DowntimeProjectsSpec) (DowntimeProjectListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	rows, err := p.queries().CharacterProductListDowntimeProjects(ctx, dbgen.CharacterProductListDowntimeProjectsParams{
		PublicID: characterID, Limit: spec.Limit, Offset: spec.Offset,
	})
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	total, err := p.queries().CharacterProductCountDowntimeProjects(ctx, characterID)
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	out := DowntimeProjectListResult{Items: make([]DowntimeProjectView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, DowntimeProjectView{
			Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Name: row.Name,
			Target: int32PointerFromInt4(row.Target), Goal: characterTextPointer(row.Goal), Notes: characterTextPointer(row.Notes),
			Progress: row.Progress, Status: row.Status, UpdatedAt: row.UpdatedAt.Time,
		})
	}
	return out, nil
}

func int32PointerFromInt4(value pgtype.Int4) *int32 {
	if !value.Valid {
		return nil
	}
	v := value.Int32
	return &v
}

func (p *ProductPostgres) ReadMyQuestRewards(ctx context.Context, actor auth.Authority, spec MyQuestRewardsSpec) (RewardEntitlementPage, error) {
	characterID, err := characterActorID(actor)
	if err != nil {
		return RewardEntitlementPage{}, err
	}
	rows, err := p.queries().CharacterProductListQuestRewards(ctx, dbgen.CharacterProductListQuestRewardsParams{
		CharacterID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return RewardEntitlementPage{}, err
	}
	total, err := p.queries().CharacterProductCountQuestRewards(ctx, characterID)
	if err != nil {
		return RewardEntitlementPage{}, err
	}
	out := RewardEntitlementPage{Items: make([]QuestRewardEntitlementView, 0, len(rows)), Total: total}
	for _, row := range rows {
		if spec.Status != nil {
			claimed := row.ClaimedAt.Valid
			if *spec.Status == RewardClaimStatusClaimed && !claimed {
				continue
			}
			if *spec.Status == RewardClaimStatusUnclaimed && claimed {
				continue
			}
		}
		out.Items = append(out.Items, mapQuestRewardRow(row))
	}
	return out, nil
}

func mapQuestRewardRow(row dbgen.CharacterProductListQuestRewardsRow) QuestRewardEntitlementView {
	return QuestRewardEntitlementView{
		Id: db.UUIDString(row.ID), QuestId: db.UUIDString(row.QuestID), CharacterId: db.UUIDString(row.CharacterID),
		AwardedBy: db.UUIDString(row.AwardedBy), AwardedAt: row.AwardedAt.Time, Pcxp: row.Pcxp,
		Note: characterTextPointer(row.Note), ClaimedAt: characterTimePointer(row.ClaimedAt),
		ProgressionEntryId: characterUUIDPointer(row.ProgressionEntryID),
	}
}

func (p *ProductPostgres) ReadParticipationsByCharacter(ctx context.Context, _ auth.Authority, spec ParticipationsByCharacterSpec) (ParticipationPageView, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return ParticipationPageView{}, err
	}
	rows, err := p.queries().CharacterProductListParticipations(ctx, dbgen.CharacterProductListParticipationsParams{
		PublicID: characterID, Limit: spec.Limit, Offset: spec.Offset,
	})
	if err != nil {
		return ParticipationPageView{}, err
	}
	total, err := p.queries().CharacterProductCountParticipations(ctx, characterID)
	if err != nil {
		return ParticipationPageView{}, err
	}
	out := ParticipationPageView{Items: make([]ParticipationView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, ParticipationView{
			QuestID: db.UUIDString(row.QuestID), MemberID: db.UUIDString(row.MemberID), CharacterID: db.UUIDString(row.CharacterID),
			Status: row.Status, Manual: row.Manual, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
			CharacterName: row.CharacterName, MemberHandle: row.MemberHandle, MemberDisplayName: row.MemberDisplayName,
			MemberAvatarURL: characterTextPointer(row.MemberAvatarUrl),
		})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCharacterSummaries(ctx context.Context, _ auth.Authority, spec CharacterSummariesSpec) (document.DocumentListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	rows, err := p.DB.Query(ctx, characterProductListSummaries, characterID, spec.Limit, spec.Offset)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	defer rows.Close()
	items := make([]document.DocumentView, 0)
	for rows.Next() {
		var id, authorID pgtype.UUID
		var kind, slug, title, status, visibility, body string
		var category pgtype.Text
		var policy []byte
		var frontmatter pgtype.Text
		var publishedAt, deletedAt pgtype.Timestamptz
		var deletedBy pgtype.UUID
		var updatedAt pgtype.Timestamptz
		var version int32
		if err := rows.Scan(&id, &kind, &slug, &title, &category, &status, &visibility, &policy, &frontmatter, &authorID, &publishedAt, &deletedAt, &deletedBy, &updatedAt, &version, &body); err != nil {
			return document.DocumentListResult{}, err
		}
		policyTokens := []string{}
		if len(policy) > 0 {
			_ = json.Unmarshal(policy, &policyTokens)
		}
		var fm json.RawMessage
		if frontmatter.Valid {
			fm = json.RawMessage(frontmatter.String)
		}
		items = append(items, document.DocumentView{
			Id: db.UUIDString(id), Kind: kind, Slug: slug, Title: title, Category: characterTextPointer(category),
			Status: status, Visibility: visibility, Policy: policyTokens, Frontmatter: fm, AuthorId: db.UUIDString(authorID),
			PublishedAt: characterTimePointer(publishedAt), DeletedAt: characterTimePointer(deletedAt),
			DeletedBy: characterUUIDPointer(deletedBy), UpdatedAt: updatedAt.Time, Version: version,
		})
	}
	if err := rows.Err(); err != nil {
		return document.DocumentListResult{}, err
	}
	var total int32
	if err := p.DB.QueryRow(ctx, characterProductCountSummaries, characterID).Scan(&total); err != nil {
		return document.DocumentListResult{}, err
	}
	return document.DocumentListResult{Items: items, Total: total}, nil
}
