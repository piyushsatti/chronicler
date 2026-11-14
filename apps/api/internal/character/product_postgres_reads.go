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
	var total int32
	out := CharacterLogListResult{Items: make([]CharacterLogView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		out.Items = append(out.Items, CharacterLogView{
			Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Body: row.Body.String,
			CreatedAt: row.CreatedAt.Time, CreatedBy: characterUUIDPointer(row.CreatedBy),
			QuestId: characterUUIDPointer(row.QuestID),
		})
	}
	out.Total = total
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
	var total int32
	out := BackstoryPage{Items: make([]BackstoryView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		out.Items = append(out.Items, BackstoryView{
			Id: db.UUIDString(row.ID), Name: row.Name.String, Lore: row.Lore.String, Cohort: row.Cohort.String,
			Retired: row.Retired.Bool, SourceRegionId: characterUUIDPointer(row.SourceRegionID),
		})
	}
	out.Total = total
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
	var total int32
	out := CreationCatalogPage{Items: make([]CreationCatalogEntryView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		out.Items = append(out.Items, CreationCatalogEntryView{
			Id: db.UUIDString(row.ID), Kind: row.Kind.String, Name: row.Name.String, Available: row.Available.Bool,
			Description: characterTextPointer(row.Description), Retired: row.Retired.Bool,
			IntroducedByRegionId: characterUUIDPointer(row.IntroducedByRegionID),
		})
	}
	out.Total = total
	return out, nil
}

func (p *ProductPostgres) ReadCoPlayers(ctx context.Context, _ auth.Authority, spec CoPlayersSpec) (CoPlayerPage, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return CoPlayerPage{}, err
	}
	rows, err := p.queries().CharacterProductListCoPlayers(ctx, dbgen.CharacterProductListCoPlayersParams{
		PublicID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return CoPlayerPage{}, err
	}
	var total int32
	out := CoPlayerPage{Items: make([]CoPlayerView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.CharacterID.Valid {
			continue
		}
		out.Items = append(out.Items, CoPlayerView{
			CharacterId: db.UUIDString(row.CharacterID), MemberId: db.UUIDString(row.MemberID), QuestCount: row.QuestCount.Int32,
		})
	}
	out.Total = total
	return out, nil
}

func (p *ProductPostgres) ReadDowntimeProjects(ctx context.Context, _ auth.Authority, spec DowntimeProjectsSpec) (DowntimeProjectListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	rows, err := p.queries().CharacterProductListDowntimeProjects(ctx, dbgen.CharacterProductListDowntimeProjectsParams{
		PublicID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return DowntimeProjectListResult{}, err
	}
	var total int32
	out := DowntimeProjectListResult{Items: make([]DowntimeProjectView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		out.Items = append(out.Items, DowntimeProjectView{
			Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Name: row.Name.String,
			Target: int32PointerFromInt4(row.Target), Goal: characterTextPointer(row.Goal), Notes: characterTextPointer(row.Notes),
			Progress: row.Progress.Int32, Status: row.Status.String, UpdatedAt: row.UpdatedAt.Time,
		})
	}
	out.Total = total
	return out, nil
}

func int32PointerFromInt4(value pgtype.Int4) *int32 {
	if !value.Valid {
		return nil
	}
	v := value.Int32
	return &v
}

// ReadMyQuestRewards returns an empty page: E1 dropped quest_reward_entitlements.
func (p *ProductPostgres) ReadMyQuestRewards(context.Context, auth.Authority, MyQuestRewardsSpec) (RewardEntitlementPage, error) {
	return RewardEntitlementPage{Items: []QuestRewardEntitlementView{}}, nil
}

func (p *ProductPostgres) ReadParticipationsByCharacter(ctx context.Context, _ auth.Authority, spec ParticipationsByCharacterSpec) (ParticipationPageView, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return ParticipationPageView{}, err
	}
	rows, err := p.queries().CharacterProductListParticipations(ctx, dbgen.CharacterProductListParticipationsParams{
		PublicID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
	})
	if err != nil {
		return ParticipationPageView{}, err
	}
	var total int32
	out := ParticipationPageView{Items: make([]ParticipationView, 0, len(rows))}
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.QuestID.Valid {
			continue
		}
		out.Items = append(out.Items, ParticipationView{
			QuestID: db.UUIDString(row.QuestID), MemberID: db.UUIDString(row.MemberID), CharacterID: db.UUIDString(row.CharacterID),
			Status: row.Status.String, Manual: row.Manual.Bool, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
			CharacterName: row.CharacterName.String, MemberHandle: row.MemberHandle.String, MemberDisplayName: row.MemberDisplayName.String,
			MemberAvatarURL: characterTextPointer(row.MemberAvatarUrl),
		})
	}
	out.Total = total
	return out, nil
}

func (p *ProductPostgres) ReadCharacterSummaries(ctx context.Context, actor auth.Authority, spec CharacterSummariesSpec) (document.DocumentListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	scope, err := document.ViewerScopeWithReaders(ctx, p.queries(), actor)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	viewer := document.SQLScope(scope)
	rows, err := p.queries().CharacterProductListSummaries(ctx, dbgen.CharacterProductListSummariesParams{
		CharacterID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset,
		ViewerID: viewer.ID, ViewerRoles: viewer.Roles, ViewerHandle: viewer.Handle,
		ViewerAdmin: viewer.Admin, ViewerLiveDm: viewer.LiveDM, ReaderIds: viewer.Readers,
	})
	if err != nil {
		return document.DocumentListResult{}, err
	}
	var total int32
	items := make([]document.DocumentView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.ID.Valid {
			continue
		}
		var policyTokens []string
		if len(row.Policy) > 0 {
			_ = json.Unmarshal(row.Policy, &policyTokens)
		}
		var fm json.RawMessage
		if row.FrontmatterYaml.Valid {
			fm = json.RawMessage(row.FrontmatterYaml.String)
		}
		items = append(items, document.DocumentView{
			Id: db.UUIDString(row.ID), Kind: row.Kind.String, Slug: row.Slug.String, Title: row.Title.String, Category: characterTextPointer(row.Category),
			Status: row.Status.String, Visibility: row.Visibility.String, Policy: policyTokens, Frontmatter: fm, AuthorId: db.UUIDString(row.AuthorID),
			PublishedAt: characterTimePointer(row.PublishedAt), DeletedAt: characterTimePointer(row.DeletedAt),
			DeletedBy: characterUUIDPointer(row.DeletedBy), UpdatedAt: row.UpdatedAt.Time, Version: row.Version.Int32,
		})
	}
	return document.DocumentListResult{Items: items, Total: total}, nil
}
