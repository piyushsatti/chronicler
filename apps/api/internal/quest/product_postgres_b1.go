package quest

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) ReadDmStats(ctx context.Context, _ auth.Authority, spec DmStatsSpec) (*DmStatsView, error) {
	dmID, err := questUUID(strings.TrimSpace(spec.MemberId))
	if err != nil {
		return nil, apierr.New(apierr.Invalid, "invalid member id")
	}
	count, err := p.queries().ProductQuestDmStats(ctx, dmID)
	if err != nil {
		return nil, err
	}
	history, err := p.ReadDmSessionHistory(ctx, auth.Authority{}, DmSessionHistorySpec{
		MemberId: spec.MemberId,
		Limit:    1,
		Offset:   0,
		AsOf:     spec.AsOf,
	})
	if err != nil {
		return nil, err
	}
	view := &DmStatsView{SessionCount: count}
	if len(history.Items) > 0 {
		item := history.Items[0]
		view.LastSession = &item
	}
	return view, nil
}

func (p *ProductPostgres) ReadDmSessionHistory(ctx context.Context, _ auth.Authority, spec DmSessionHistorySpec) (DmSessionHistoryV2Result, error) {
	dmID, err := questUUID(strings.TrimSpace(spec.MemberId))
	if err != nil {
		return DmSessionHistoryV2Result{}, apierr.New(apierr.Invalid, "invalid member id")
	}
	rows, err := p.queries().ProductQuestDmSessionHistoryPage(ctx, dbgen.ProductQuestDmSessionHistoryPageParams{
		AsOf:      questAsOf(spec.AsOf),
		DmID:      dmID,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return DmSessionHistoryV2Result{}, err
	}
	var total int32
	items := make([]DmLastSessionView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.PublicID.Valid {
			continue
		}
		questView := mapQuestListPageRow(dbgen.ProductQuestListPageRow{
			Total: row.Total, PublicID: row.PublicID, ShortCode: row.ShortCode, Kinds: row.Kinds,
			Status: row.Status, DisplayStatus: row.DisplayStatus, DmPublicID: row.DmPublicID,
			ArcPublicID: row.ArcPublicID, ScheduledAt: row.ScheduledAt, DurationHours: row.DurationHours,
			SlotsMax: row.SlotsMax, FilledCount: row.FilledCount, DocumentPublicID: row.DocumentPublicID,
			Tags: row.Tags, Genres: row.Genres, Apl: row.Apl, SignupType: row.SignupType,
			DiscordDesiredRevision: row.DiscordDesiredRevision, DiscordAppliedRevision: row.DiscordAppliedRevision,
			DiscordMessageID: row.DiscordMessageID, DiscordEventID: row.DiscordEventID, EventUrl: row.EventUrl,
			CreatedByPublicID: row.CreatedByPublicID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		})
		if questView == nil {
			continue
		}
		item := DmLastSessionView{Quest: *questView}
		if row.RecapPublicID.Valid {
			recap := document.DocumentView{
				Id:          db.UUIDString(row.RecapPublicID),
				Kind:        row.RecapKind.String,
				Slug:        row.RecapSlug.String,
				Title:       row.RecapTitle.String,
				Status:      row.RecapStatus.String,
				Visibility:  row.RecapVisibility.String,
				AuthorId:    db.UUIDString(row.RecapAuthorPublicID),
				UpdatedAt:   row.RecapUpdatedAt.Time,
				Frontmatter: []byte("{}"),
			}
			item.RecapDocument = &recap
		}
		items = append(items, item)
	}
	return DmSessionHistoryV2Result{Items: items, Total: total}, nil
}

func (p *ProductPostgres) ReadQuestSummaries(ctx context.Context, actor auth.Authority, spec QuestSummariesSpec) (QuestSummariesV2Result, error) {
	questID, err := questUUID(strings.TrimSpace(spec.QuestId))
	if err != nil {
		return QuestSummariesV2Result{}, err
	}
	if _, err := p.queries().ProductQuestReadByID(ctx, dbgen.ProductQuestReadByIDParams{
		AsOf:    questAsOf(spec.AsOf),
		QuestID: questID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestSummariesV2Result{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return QuestSummariesV2Result{}, err
	}
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return QuestSummariesV2Result{}, err
	}
	rows, err := p.queries().ProductQuestSummariesPage(ctx, dbgen.ProductQuestSummariesPageParams{
		ViewerAdmin:  viewer.Admin,
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
		QuestID:      questID,
		RowOffset:    spec.Offset,
		RowLimit:     spec.Limit,
	})
	if err != nil {
		return QuestSummariesV2Result{}, err
	}
	scope := document.ScopeFromAuthority(actor)
	var total int32
	summaries := make([]document.DocumentView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if documentAdminOverride(row.AdminOverride) {
			document.AuditSQLOverride(ctx, scope, true, "quest_summaries", "page")
		}
		if !row.PublicID.Valid {
			continue
		}
		summaries = append(summaries, mapQuestDmSummaryDocumentRow(dbgen.ProductQuestDmSummariesPageRow{
			Total: row.Total, ID: row.ID, PublicID: row.PublicID, Kind: row.Kind, Slug: row.Slug,
			Title: row.Title, Category: row.Category, Status: row.Status, Visibility: row.Visibility,
			Body: row.Body, Policy: row.Policy, AuthorPublicID: row.AuthorPublicID,
			PublishedAt: row.PublishedAt, DeletedAt: row.DeletedAt, CreatedAt: row.CreatedAt,
			UpdatedAt: row.UpdatedAt, AdminOverride: row.AdminOverride,
		}))
	}
	_ = total // page total is embedded in document list semantics via summaries length for this surface
	totals, err := p.questSummaryTotals(ctx, questID)
	if err != nil {
		return QuestSummariesV2Result{}, err
	}
	return QuestSummariesV2Result{Summaries: summaries, Totals: totals}, nil
}

func (p *ProductPostgres) questSummaryTotals(ctx context.Context, questID pgtype.UUID) (QuestSummaryTotalsView, error) {
	row, err := p.queries().ProductQuestSummaryTotals(ctx, questID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestSummaryTotalsView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return QuestSummaryTotalsView{}, err
	}
	switch row.Status {
	case "closed":
		if row.HasQuestRewardRows {
			total := int32(row.TotalPcxp)
			return QuestSummaryTotalsView{Coverage: RewardCoverageComplete, TotalPcxpAwarded: &total}, nil
		}
		// Closed without quest_reward ledger rows: honest legacy gap until close writes a coverage marker.
		return QuestSummaryTotalsView{Coverage: RewardCoverageLegacyUnknown}, nil
	default:
		zero := int32(0)
		return QuestSummaryTotalsView{Coverage: RewardCoverageComplete, TotalPcxpAwarded: &zero}, nil
	}
}

func (p *ProductPostgres) ReadBatchParticipants(ctx context.Context, _ auth.Authority, keys []ParticipantsKey) ([]product.BatchResult[ParticipantList], error) {
	out := make([]product.BatchResult[ParticipantList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, 0, len(keys))
	statuses := make([]string, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := questUUID(key.ParentID)
		if err != nil {
			out[i] = product.BatchResult[ParticipantList]{Err: err}
			continue
		}
		ids = append(ids, id)
		if key.HasStatus {
			statuses = append(statuses, key.Status)
		} else {
			statuses = append(statuses, "")
		}
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	// Empty status string means no filter; convert to NULL-compatible empty for unnest pairing.
	statusArgs := make([]string, len(statuses))
	for i, status := range statuses {
		if status == "" {
			statusArgs[i] = ""
			continue
		}
		statusArgs[i] = status
	}
	rows, err := p.queries().ProductQuestBatchParticipants(ctx, dbgen.ProductQuestBatchParticipantsParams{
		QuestIds: ids,
		Statuses: statusArgs,
	})
	if err != nil {
		return nil, err
	}
	grouped := make(map[int][]QuestParticipantView, len(positions))
	for _, row := range rows {
		position := int(row.InputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		slot := positions[position]
		if row.QuestPublicID == "" || row.CharacterPublicID == "" {
			continue
		}
		grouped[slot] = append(grouped[slot], QuestParticipantView{
			QuestId:           row.QuestPublicID,
			MemberId:          row.MemberPublicID,
			CharacterId:       row.CharacterPublicID,
			CharacterName:     row.CharacterName.String,
			MemberHandle:      row.MemberHandle.String,
			MemberDisplayName: row.MemberDisplayName.String,
			MemberAvatarUrl:   textPtr(row.MemberAvatarUrl),
			Status:            row.Status.String,
			Manual:            row.Manual.Bool,
			CreatedAt:         row.CreatedAt.Time,
			UpdatedAt:         row.UpdatedAt.Time,
		})
	}
	for _, slot := range positions {
		items := grouped[slot]
		if items == nil {
			items = []QuestParticipantView{}
		}
		out[slot] = product.BatchResult[ParticipantList]{Value: &ParticipantList{Items: items}}
	}
	return out, nil
}
