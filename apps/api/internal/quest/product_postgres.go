package quest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("quest database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) queries() *dbgen.Queries { return dbgen.New(p.DB) }

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "quest product surface pending")
}

func questUUID(value string) (pgtype.UUID, error) {
	id, err := db.ParseUUID(value)
	if err != nil || db.UUIDString(id) != value {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid quest id")
	}
	return id, nil
}

func mapQuestBatchRow(row dbgen.ProductQuestBatchReadRow) *QuestView {
	if !row.PublicID.Valid {
		return nil
	}
	view := &QuestView{
		Id:            db.UUIDString(row.PublicID),
		Status:        row.Status.String,
		DisplayStatus: strPtr(row.DisplayStatus),
		ScheduledAt:   row.ScheduledAt.Time,
		DurationHours: row.DurationHours.Float64,
		SlotsMax:      row.SlotsMax.Int32,
		FilledCount:   row.FilledCount.Int32,
		Tags:          row.Tags,
		Genres:        row.Genres,
		Kinds:         row.Kinds,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
	}
	if row.ShortCode.Valid {
		view.ShortCode = row.ShortCode.String
	}
	if row.DmPublicID.Valid {
		view.DmId = db.UUIDString(row.DmPublicID)
	}
	if row.CreatedByPublicID.Valid {
		view.CreatedBy = db.UUIDString(row.CreatedByPublicID)
	}
	if row.DocumentPublicID.Valid {
		id := db.UUIDString(row.DocumentPublicID)
		view.DocumentId = &id
	}
	if row.ArcPublicID.Valid {
		id := db.UUIDString(row.ArcPublicID)
		view.ArcId = &id
	}
	if row.SignupType.Valid {
		view.SignupType = &row.SignupType.String
	}
	if row.Apl.Valid {
		view.Apl = &row.Apl.Int32
	}
	if row.DiscordMessageID.Valid {
		view.DiscordMessageId = &row.DiscordMessageID.String
	}
	if row.DiscordEventID.Valid {
		view.DiscordEventId = &row.DiscordEventID.String
	}
	if row.EventUrl.Valid {
		view.EventUrl = &row.EventUrl.String
	}
	return view
}

func mapQuestListPageRow(row dbgen.ProductQuestListPageRow) *QuestView {
	if !row.PublicID.Valid {
		return nil
	}
	view := &QuestView{
		Id:            db.UUIDString(row.PublicID),
		Status:        row.Status.String,
		ScheduledAt:   row.ScheduledAt.Time,
		DurationHours: row.DurationHours.Float64,
		SlotsMax:      row.SlotsMax.Int32,
		FilledCount:   row.FilledCount.Int32,
		Tags:          row.Tags,
		Genres:        row.Genres,
		Kinds:         row.Kinds,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
		Regions:       []string{},
	}
	if row.ShortCode.Valid {
		view.ShortCode = row.ShortCode.String
	}
	if row.DisplayStatus.Valid {
		view.DisplayStatus = &row.DisplayStatus.String
	}
	if row.DmPublicID.Valid {
		view.DmId = db.UUIDString(row.DmPublicID)
	}
	if row.CreatedByPublicID.Valid {
		view.CreatedBy = db.UUIDString(row.CreatedByPublicID)
	}
	if row.DocumentPublicID.Valid {
		id := db.UUIDString(row.DocumentPublicID)
		view.DocumentId = &id
	}
	if row.ArcPublicID.Valid {
		id := db.UUIDString(row.ArcPublicID)
		view.ArcId = &id
	}
	if row.SignupType.Valid {
		view.SignupType = &row.SignupType.String
	}
	if row.Apl.Valid {
		view.Apl = &row.Apl.Int32
	}
	if row.DiscordMessageID.Valid {
		view.DiscordMessageId = &row.DiscordMessageID.String
	}
	if row.DiscordEventID.Valid {
		view.DiscordEventId = &row.DiscordEventID.String
	}
	if row.EventUrl.Valid {
		view.EventUrl = &row.EventUrl.String
	}
	return view
}

func mapQuestBoardPageRow(row dbgen.ProductQuestBoardPageRow) *QuestView {
	return mapQuestListPageRow(dbgen.ProductQuestListPageRow{
		Total: row.Total, PublicID: row.PublicID, ShortCode: row.ShortCode, Kinds: row.Kinds,
		Status: row.Status, DisplayStatus: row.DisplayStatus, DmPublicID: row.DmPublicID,
		ArcPublicID: row.ArcPublicID, ScheduledAt: row.ScheduledAt, DurationHours: row.DurationHours,
		SlotsMax: row.SlotsMax, FilledCount: row.FilledCount, DocumentPublicID: row.DocumentPublicID,
		Tags: row.Tags, Genres: row.Genres, Apl: row.Apl, SignupType: row.SignupType,
		DiscordDesiredRevision: row.DiscordDesiredRevision, DiscordAppliedRevision: row.DiscordAppliedRevision,
		DiscordMessageID: row.DiscordMessageID, DiscordEventID: row.DiscordEventID, EventUrl: row.EventUrl,
		CreatedByPublicID: row.CreatedByPublicID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	})
}

func mapQuestRecentlyClosedPageRow(row dbgen.ProductQuestRecentlyClosedPageRow) *QuestView {
	return mapQuestListPageRow(dbgen.ProductQuestListPageRow{
		Total: row.Total, PublicID: row.PublicID, ShortCode: row.ShortCode, Kinds: row.Kinds,
		Status: row.Status, DisplayStatus: row.DisplayStatus, DmPublicID: row.DmPublicID,
		ArcPublicID: row.ArcPublicID, ScheduledAt: row.ScheduledAt, DurationHours: row.DurationHours,
		SlotsMax: row.SlotsMax, FilledCount: row.FilledCount, DocumentPublicID: row.DocumentPublicID,
		Tags: row.Tags, Genres: row.Genres, Apl: row.Apl, SignupType: row.SignupType,
		DiscordDesiredRevision: row.DiscordDesiredRevision, DiscordAppliedRevision: row.DiscordAppliedRevision,
		DiscordMessageID: row.DiscordMessageID, DiscordEventID: row.DiscordEventID, EventUrl: row.EventUrl,
		CreatedByPublicID: row.CreatedByPublicID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	})
}

func mapQuestReadByIDRow(row dbgen.ProductQuestReadByIDRow) *QuestView {
	if row.DeletedAt.Valid {
		return nil
	}
	view := &QuestView{
		Id:            db.UUIDString(row.PublicID),
		ShortCode:     row.ShortCode,
		Kinds:         row.Kinds,
		Status:        row.Status,
		DisplayStatus: strPtr(row.DisplayStatus),
		ScheduledAt:   row.ScheduledAt.Time,
		DurationHours: row.DurationHours,
		SlotsMax:      row.SlotsMax,
		FilledCount:   row.FilledCount,
		Tags:          row.Tags,
		Genres:        row.Genres,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
		Regions:       []string{},
	}
	if row.DmPublicID.Valid {
		view.DmId = db.UUIDString(row.DmPublicID)
	}
	if row.CreatedByPublicID.Valid {
		view.CreatedBy = db.UUIDString(row.CreatedByPublicID)
	}
	if row.DocumentPublicID.Valid {
		id := db.UUIDString(row.DocumentPublicID)
		view.DocumentId = &id
	}
	if row.ArcPublicID.Valid {
		id := db.UUIDString(row.ArcPublicID)
		view.ArcId = &id
	}
	if row.SignupType.Valid {
		view.SignupType = &row.SignupType.String
	}
	if row.Apl.Valid {
		view.Apl = &row.Apl.Int32
	}
	if row.DiscordMessageID.Valid {
		view.DiscordMessageId = &row.DiscordMessageID.String
	}
	if row.DiscordEventID.Valid {
		view.DiscordEventId = &row.DiscordEventID.String
	}
	if row.EventUrl.Valid {
		view.EventUrl = &row.EventUrl.String
	}
	return view
}

func mapQuestReadByShortCodeRow(row dbgen.ProductQuestReadByShortCodeRow) *QuestView {
	if row.DeletedAt.Valid {
		return nil
	}
	return mapQuestReadByIDRow(dbgen.ProductQuestReadByIDRow(row))
}

func optionalTime(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *value, Valid: true}
}

func questsListParams(spec QuestsSpec) (dbgen.ProductQuestListPageParams, error) {
	params := dbgen.ProductQuestListPageParams{
		AsOf:           questAsOf(spec.AsOf),
		TagFilterSet:   spec.TagFilterSet,
		TagVariants:    spec.TagVariants,
		GenreFilterSet: spec.GenreFilterSet,
		GenreVariants:  spec.GenreVariants,
		RowLimit:       spec.Limit,
		RowOffset:      spec.Offset,
		ShortCodes:     []string{},
	}
	if spec.Filters != nil {
		f := spec.Filters
		if f.Status != nil {
			params.Status = *f.Status
		}
		if f.DisplayStatus != nil {
			params.DisplayStatus = *f.DisplayStatus
		}
		if f.Kind != nil {
			params.Kind = *f.Kind
		}
		if f.Search != nil {
			params.Search = *f.Search
		}
		if len(f.ShortCodes) > 0 {
			params.ShortCodes = f.ShortCodes
		}
		params.ScheduledFrom = optionalTime(f.ScheduledFrom)
		params.ScheduledTo = optionalTime(f.ScheduledTo)
		var err error
		params.DmID, err = optionalPublicUUID(f.DmId)
		if err != nil {
			return dbgen.ProductQuestListPageParams{}, err
		}
		params.ArcID, err = optionalPublicUUID(f.ArcId)
		if err != nil {
			return dbgen.ProductQuestListPageParams{}, err
		}
		params.RegionID, err = optionalPublicUUID(f.RegionId)
		if err != nil {
			return dbgen.ProductQuestListPageParams{}, err
		}
	}
	return params, nil
}

func questListFromPageRows(rows []dbgen.ProductQuestListPageRow) QuestV2ListResult {
	var total int32
	items := make([]QuestView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if view := mapQuestListPageRow(row); view != nil {
			items = append(items, *view)
		}
	}
	return QuestV2ListResult{Items: items, Total: total}
}

func mapQuestArcReadRow(row dbgen.ProductQuestReadArcRow) *QuestArcView {
	return &QuestArcView{
		Id:         db.UUIDString(row.PublicID),
		Name:       row.Name,
		CreatedBy:  db.UUIDString(row.CreatedByPublicID),
		CreatedAt:  row.CreatedAt.Time,
		QuestCount: row.QuestCount,
	}
}

func mapQuestArcListPageRow(row dbgen.ProductQuestListArcsRow) *QuestArcView {
	if !row.PublicID.Valid {
		return nil
	}
	return &QuestArcView{
		Id:         db.UUIDString(row.PublicID),
		Name:       row.Name.String,
		CreatedBy:  db.UUIDString(row.CreatedByPublicID),
		CreatedAt:  row.CreatedAt.Time,
		QuestCount: row.QuestCount.Int32,
	}
}

func questArcListFromPageRows(rows []dbgen.ProductQuestListArcsRow) QuestArcV2ListResult {
	var total int32
	items := make([]QuestArcView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if view := mapQuestArcListPageRow(row); view != nil {
			items = append(items, *view)
		}
	}
	return QuestArcV2ListResult{Items: items, Total: total}
}

func strPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func optionalPublicUUID(id *string) (pgtype.UUID, error) {
	if id == nil || strings.TrimSpace(*id) == "" {
		return pgtype.UUID{}, nil
	}
	value := strings.TrimSpace(*id)
	parsed, err := db.ParseUUID(value)
	if err != nil {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid id")
	}
	if db.UUIDString(parsed) != value {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid id")
	}
	return parsed, nil
}

func questAsOf(value time.Time) pgtype.Timestamptz {
	if value.IsZero() {
		value = time.Now().UTC()
	}
	return pgtype.Timestamptz{Time: value, Valid: true}
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid || t.String == "" {
		return nil
	}
	s := t.String
	return &s
}

func regionIDs(value interface{}) []string {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func documentAdminOverride(value interface{}) bool {
	override, ok := value.(bool)
	return ok && override
}

func documentPolicyStrings(raw []byte) []string {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func mapQuestDmSummaryDocumentRow(row dbgen.ProductQuestDmSummariesPageRow) document.DocumentView {
	view := document.DocumentView{
		Id:          db.UUIDString(row.PublicID),
		Kind:        row.Kind.String,
		Slug:        row.Slug.String,
		Title:       row.Title.String,
		Status:      row.Status.String,
		Visibility:  row.Visibility.String,
		Policy:      documentPolicyStrings(row.Policy),
		AuthorId:    db.UUIDString(row.AuthorPublicID),
		UpdatedAt:   row.UpdatedAt.Time,
		Frontmatter: json.RawMessage("{}"),
	}
	if row.Category.Valid {
		view.Category = &row.Category.String
	}
	if row.Body.Valid {
		body := row.Body.String
		view.EffectiveBody = &body
	}
	if row.PublishedAt.Valid {
		t := row.PublishedAt.Time
		view.PublishedAt = &t
	}
	if row.DeletedAt.Valid {
		t := row.DeletedAt.Time
		view.DeletedAt = &t
	}
	return view
}

func (p *ProductPostgres) documentSQLViewer(ctx context.Context, actor auth.Authority) (document.SQLViewer, error) {
	scope := document.ScopeFromAuthority(actor)
	if !scope.Authenticated() {
		return document.SQLScope(scope), nil
	}
	memberID, err := db.ParseUUID(scope.MemberID)
	if err != nil {
		return document.SQLScope(scope), nil
	}
	readerIDs, err := p.queries().ListDocumentReaders(ctx, memberID)
	if err != nil {
		return document.SQLViewer{}, err
	}
	scope.ReaderOf = make(map[string]struct{}, len(readerIDs))
	for _, id := range readerIDs {
		scope.ReaderOf[db.UUIDString(id)] = struct{}{}
	}
	return document.SQLScope(scope), nil
}

func (p *ProductPostgres) dmSummariesTargetIDs(ctx context.Context, actor auth.Authority, spec DmSummariesSpec) (pgtype.UUID, pgtype.UUID, error) {
	var questFilter pgtype.UUID
	if spec.Filters != nil && spec.Filters.QuestId != nil && strings.TrimSpace(*spec.Filters.QuestId) != "" {
		questID, err := questUUID(strings.TrimSpace(*spec.Filters.QuestId))
		if err != nil {
			return pgtype.UUID{}, pgtype.UUID{}, err
		}
		questFilter = questID
		row, err := p.queries().ProductQuestReadByID(ctx, dbgen.ProductQuestReadByIDParams{
			AsOf:    questAsOf(spec.AsOf),
			QuestID: questID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return pgtype.UUID{}, pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid quest id")
			}
			return pgtype.UUID{}, pgtype.UUID{}, err
		}
		if row.DeletedAt.Valid || !row.DmPublicID.Valid {
			return pgtype.UUID{}, pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid quest id")
		}
		return row.DmPublicID, questFilter, nil
	}
	claims := actor.Claims()
	if claims.Anonymous() || strings.TrimSpace(claims.MemberID) == "" {
		return pgtype.UUID{}, pgtype.UUID{}, nil
	}
	dmID, err := db.ParseUUID(claims.MemberID)
	if err != nil {
		return pgtype.UUID{}, pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid member id")
	}
	return dmID, questFilter, nil
}

func questStateCountsParams(spec QuestStateCountsSpec) (dbgen.ProductQuestStateCountsParams, error) {
	params := dbgen.ProductQuestStateCountsParams{
		TagFilterSet:   spec.TagFilterSet,
		TagVariants:    spec.TagVariants,
		GenreFilterSet: spec.GenreFilterSet,
		GenreVariants:  spec.GenreVariants,
	}
	if spec.Filters != nil {
		var err error
		params.ArcID, err = optionalPublicUUID(spec.Filters.ArcId)
		if err != nil {
			return dbgen.ProductQuestStateCountsParams{}, err
		}
		params.DmID, err = optionalPublicUUID(spec.Filters.DmId)
		if err != nil {
			return dbgen.ProductQuestStateCountsParams{}, err
		}
		params.RegionID, err = optionalPublicUUID(spec.Filters.RegionId)
		if err != nil {
			return dbgen.ProductQuestStateCountsParams{}, err
		}
		if spec.Filters.Kind != nil {
			params.Kind = *spec.Filters.Kind
		}
	}
	return params, nil
}

func (p *ProductPostgres) ReadBatchQuests(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[QuestView], error) {
	out := make([]product.BatchResult[QuestView], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := questUUID(key.ID)
		if err != nil {
			out[i] = product.BatchResult[QuestView]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.queries().ProductQuestBatchRead(ctx, dbgen.ProductQuestBatchReadParams{
		AsOf:     pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		QuestIds: ids,
	})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		// unnest WITH ORDINALITY is 1-based and covers only the valid ids.
		position := int(row.InputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		out[positions[position]] = product.BatchResult[QuestView]{Value: mapQuestBatchRow(row)}
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchQuestHexes(context.Context, auth.Authority, []QuestHexesKey) ([]product.BatchResult[HexList], error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadBatchQuestRegions(context.Context, auth.Authority, []QuestRegionsKey) ([]product.BatchResult[RegionIDList], error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadBatchArcs(context.Context, auth.Authority, []IDKey) ([]product.BatchResult[QuestArcView], error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadBatchArcQuests(context.Context, auth.Authority, []ArcQuestsKey) ([]product.BatchResult[QuestList], error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadBatchDelivery(context.Context, auth.Authority, []IDKey) ([]product.BatchResult[QuestDiscordDeliveryView], error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadBatchRewardEntitlements(context.Context, auth.Authority, []RewardEntitlementsKey) ([]product.BatchResult[RewardList], error) {
	return nil, p.pending()
}

func (p *ProductPostgres) ReadRewardDecisionCoverage(_ context.Context, questIDs []string) ([]RewardDecisionCoverage, error) {
	out := make([]RewardDecisionCoverage, len(questIDs))
	for i, id := range questIDs {
		out[i] = RewardDecisionCoverage{QuestID: id}
	}
	return out, nil
}

func (p *ProductPostgres) ReadDmSummaries(ctx context.Context, actor auth.Authority, spec DmSummariesSpec) (document.DocumentListResult, error) {
	viewer, err := p.documentSQLViewer(ctx, actor)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	dmID, questID, err := p.dmSummariesTargetIDs(ctx, actor, spec)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	if !dmID.Valid {
		return document.DocumentListResult{}, nil
	}
	search := ""
	if spec.Filters != nil && spec.Filters.Search != nil {
		search = *spec.Filters.Search
	}
	rows, err := p.queries().ProductQuestDmSummariesPage(ctx, dbgen.ProductQuestDmSummariesPageParams{
		ViewerAdmin:  viewer.Admin,
		ViewerID:     viewer.ID,
		ViewerRoles:  viewer.Roles,
		ViewerHandle: viewer.Handle,
		ViewerLiveDm: viewer.LiveDM,
		ReaderIds:    viewer.Readers,
		DmID:         dmID,
		QuestID:      questID,
		Search:       search,
		RowOffset:    spec.Offset,
		RowLimit:     spec.Limit,
	})
	if err != nil {
		return document.DocumentListResult{}, err
	}
	scope := document.ScopeFromAuthority(actor)
	var total int32
	items := make([]document.DocumentView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if documentAdminOverride(row.AdminOverride) {
			document.AuditSQLOverride(ctx, scope, true, "quest_dm_summaries", "page")
		}
		if !row.PublicID.Valid {
			continue
		}
		items = append(items, mapQuestDmSummaryDocumentRow(row))
	}
	return document.DocumentListResult{Items: items, Total: total}, nil
}
func (p *ProductPostgres) ReadMyQuestSignups(ctx context.Context, actor auth.Authority, spec MyQuestSignupsSpec) (ParticipationPage, error) {
	memberID, err := db.ParseUUID(actor.Claims().MemberID)
	if err != nil {
		return ParticipationPage{}, apierr.New(apierr.Invalid, "invalid member id")
	}
	rows, err := p.queries().ProductQuestMySignupsPage(ctx, dbgen.ProductQuestMySignupsPageParams{
		AsOf:      questAsOf(spec.AsOf),
		MemberID:  memberID,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return ParticipationPage{}, err
	}
	var total int32
	items := make([]QuestParticipantView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.QuestID.Valid {
			continue
		}
		items = append(items, QuestParticipantView{
			QuestId:           row.QuestID.String,
			MemberId:          row.MemberID.String,
			CharacterId:       row.CharacterID.String,
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
	return ParticipationPage{Items: items, Total: total}, nil
}

func (p *ProductPostgres) ReadOpenQuestSeats(ctx context.Context, _ auth.Authority, spec OpenQuestSeatsSpec) (OpenQuestSeatsV2Result, error) {
	dmID, err := optionalPublicUUID(spec.DmId)
	if err != nil {
		return OpenQuestSeatsV2Result{}, err
	}
	regionID, err := optionalPublicUUID(spec.RegionId)
	if err != nil {
		return OpenQuestSeatsV2Result{}, err
	}
	rows, err := p.queries().ProductQuestOpenSeatsPage(ctx, dbgen.ProductQuestOpenSeatsPageParams{
		DmID:      dmID,
		RegionID:  regionID,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return OpenQuestSeatsV2Result{}, err
	}
	var total int32
	items := make([]OpenQuestSeatView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if !row.PublicID.Valid {
			continue
		}
		items = append(items, OpenQuestSeatView{
			QuestId:     db.UUIDString(row.PublicID),
			ShortCode:   row.ShortCode.String,
			DmId:        db.UUIDString(row.DmPublicID),
			RegionIds:   regionIDs(row.RegionIds),
			ScheduledAt: row.ScheduledAt.Time,
			Status:      row.Status.String,
			SlotsMax:    row.SlotsMax.Int32,
			FilledCount: row.FilledCount.Int32,
			OpenSeats:   row.OpenSeats.Int32,
		})
	}
	return OpenQuestSeatsV2Result{Entries: items, Total: total}, nil
}
func (p *ProductPostgres) ReadQuest(ctx context.Context, _ auth.Authority, spec QuestSpec) (*QuestView, error) {
	asOf := questAsOf(spec.AsOf)
	switch {
	case spec.Id != nil && strings.TrimSpace(*spec.Id) != "":
		questID, err := questUUID(strings.TrimSpace(*spec.Id))
		if err != nil {
			return nil, err
		}
		row, err := p.queries().ProductQuestReadByID(ctx, dbgen.ProductQuestReadByIDParams{
			AsOf:    asOf,
			QuestID: questID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		return mapQuestReadByIDRow(row), nil
	case spec.ShortCode != nil && strings.TrimSpace(*spec.ShortCode) != "":
		row, err := p.queries().ProductQuestReadByShortCode(ctx, dbgen.ProductQuestReadByShortCodeParams{
			AsOf:      asOf,
			ShortCode: strings.TrimSpace(*spec.ShortCode),
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		return mapQuestReadByShortCodeRow(row), nil
	default:
		return nil, apierr.New(apierr.Invalid, "quest id or short code required")
	}
}

func (p *ProductPostgres) ReadQuestBoard(ctx context.Context, _ auth.Authority, spec QuestBoardSpec) (QuestV2ListResult, error) {
	regionID, err := optionalPublicUUID(spec.RegionId)
	if err != nil {
		return QuestV2ListResult{}, err
	}
	rows, err := p.queries().ProductQuestBoardPage(ctx, dbgen.ProductQuestBoardPageParams{
		AsOf:      questAsOf(spec.AsOf),
		RegionID:  regionID,
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return QuestV2ListResult{}, err
	}
	var total int32
	items := make([]QuestView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if view := mapQuestBoardPageRow(row); view != nil {
			items = append(items, *view)
		}
	}
	return QuestV2ListResult{Items: items, Total: total}, nil
}
func (p *ProductPostgres) ReadQuestGenreOptions(ctx context.Context, _ auth.Authority, _ QuestGenreOptionsSpec) ([]string, error) {
	rows, err := p.queries().ProductQuestGenreOptions(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		if genre, ok := row.(string); ok && genre != "" {
			out = append(out, genre)
		}
	}
	return out, nil
}
func (p *ProductPostgres) ReadQuestStateCounts(ctx context.Context, _ auth.Authority, spec QuestStateCountsSpec) ([]QuestStateCountView, error) {
	params, err := questStateCountsParams(spec)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductQuestStateCounts(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]QuestStateCountView, len(rows))
	for i, row := range rows {
		out[i] = QuestStateCountView{State: row.State, Count: int32(row.Count)}
	}
	return out, nil
}
func (p *ProductPostgres) ReadQuests(ctx context.Context, _ auth.Authority, spec QuestsSpec) (QuestV2ListResult, error) {
	params, err := questsListParams(spec)
	if err != nil {
		return QuestV2ListResult{}, err
	}
	rows, err := p.queries().ProductQuestListPage(ctx, params)
	if err != nil {
		return QuestV2ListResult{}, err
	}
	return questListFromPageRows(rows), nil
}

func (p *ProductPostgres) ReadRecentlyClosedQuests(ctx context.Context, _ auth.Authority, spec RecentlyClosedQuestsSpec) (QuestV2ListResult, error) {
	regionID, err := optionalPublicUUID(spec.RegionId)
	if err != nil {
		return QuestV2ListResult{}, err
	}
	rows, err := p.queries().ProductQuestRecentlyClosedPage(ctx, dbgen.ProductQuestRecentlyClosedPageParams{
		AsOf:        questAsOf(spec.AsOf),
		ClosedSince: optionalTime(spec.ClosedSince),
		RegionID:    regionID,
		RowOffset:   spec.Offset,
		RowLimit:    spec.Limit,
	})
	if err != nil {
		return QuestV2ListResult{}, err
	}
	var total int32
	items := make([]QuestView, 0, len(rows))
	for i, row := range rows {
		if i == 0 {
			total = int32(row.Total)
		}
		if view := mapQuestRecentlyClosedPageRow(row); view != nil {
			items = append(items, *view)
		}
	}
	return QuestV2ListResult{Items: items, Total: total}, nil
}
func (p *ProductPostgres) ReadQuestArc(ctx context.Context, _ auth.Authority, spec QuestArcSpec) (*QuestArcView, error) {
	arcID, err := questUUID(strings.TrimSpace(spec.Id))
	if err != nil {
		return nil, err
	}
	row, err := p.queries().ProductQuestReadArc(ctx, arcID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return mapQuestArcReadRow(row), nil
}
func (p *ProductPostgres) ReadQuestArcs(ctx context.Context, _ auth.Authority, spec QuestArcsSpec) (QuestArcV2ListResult, error) {
	rows, err := p.queries().ProductQuestListArcs(ctx, dbgen.ProductQuestListArcsParams{
		RowOffset: spec.Offset,
		RowLimit:  spec.Limit,
	})
	if err != nil {
		return QuestArcV2ListResult{}, err
	}
	return questArcListFromPageRows(rows), nil
}

func (p *ProductPostgres) internalMember(ctx context.Context, publicID string) (int64, error) {
	uid, err := db.ParseUUID(publicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid member id")
	}
	id, err := p.queries().MemberInternalID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, apierr.New(apierr.NotFound, "member not found")
		}
		return 0, err
	}
	return id, nil
}

func (p *ProductPostgres) LockUpsertQuestArc(ctx context.Context, spec UpsertQuestArcSpec) (UpsertQuestArcState, error) {
	if spec.Id == nil {
		return UpsertQuestArcState{}, nil
	}
	arcID, err := questUUID(*spec.Id)
	if err != nil {
		return UpsertQuestArcState{}, err
	}
	row, err := p.queries().ProductQuestLockArc(ctx, arcID)
	if errors.Is(err, pgx.ErrNoRows) {
		return UpsertQuestArcState{}, nil
	}
	if err != nil {
		return UpsertQuestArcState{}, err
	}
	before := mapQuestArcReadRow(dbgen.ProductQuestReadArcRow{
		PublicID:          row.PublicID,
		Name:              row.Name,
		CreatedByPublicID: row.CreatedByPublicID,
		CreatedAt:         row.CreatedAt,
		QuestCount:        0,
	})
	return UpsertQuestArcState{
		Exists:    true,
		SubjectID: db.UUIDString(row.PublicID),
		Before:    before,
	}, nil
}

func (p *ProductPostgres) StoreUpsertQuestArc(ctx context.Context, write UpsertQuestArcWrite) (QuestArcView, error) {
	spec := write.ValidatedInput
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	var arcPublicID pgtype.UUID
	if spec.Id == nil {
		if write.Locked.Exists {
			return QuestArcView{}, fmt.Errorf("quest arc create cannot have a locked existing arc")
		}
		memberID, err := p.internalMember(ctx, write.ActorID)
		if err != nil {
			return QuestArcView{}, err
		}
		row, err := p.queries().ProductQuestInsertArc(ctx, dbgen.ProductQuestInsertArcParams{
			Name:      spec.Name,
			CreatedBy: memberID,
			At:        at,
		})
		if err != nil {
			return QuestArcView{}, err
		}
		arcPublicID = row.PublicID
	} else {
		if !write.Locked.Exists || write.Locked.SubjectID != *spec.Id {
			return QuestArcView{}, apierr.New(apierr.NotFound, "quest arc not found")
		}
		parsedID, err := questUUID(*spec.Id)
		if err != nil {
			return QuestArcView{}, err
		}
		arcPublicID = parsedID
		if _, err = p.queries().ProductQuestUpdateArc(ctx, dbgen.ProductQuestUpdateArcParams{
			Name:  spec.Name,
			ArcID: arcPublicID,
		}); err != nil {
			return QuestArcView{}, err
		}
	}
	view, err := p.ReadQuestArc(ctx, auth.Authority{}, QuestArcSpec{Id: db.UUIDString(arcPublicID), AsOf: write.At})
	if err != nil {
		return QuestArcView{}, err
	}
	if view == nil {
		return QuestArcView{}, fmt.Errorf("quest arc missing after write")
	}
	return *view, nil
}
func (p *ProductPostgres) LockRemoveQuestFromArc(ctx context.Context, spec RemoveQuestFromArcSpec) (RemoveQuestFromArcState, error) {
	questID, err := questUUID(spec.QuestId)
	if err != nil {
		return RemoveQuestFromArcState{}, err
	}
	row, err := p.queries().ProductQuestLockByID(ctx, questID)
	if errors.Is(err, pgx.ErrNoRows) {
		return RemoveQuestFromArcState{}, nil
	}
	if err != nil {
		return RemoveQuestFromArcState{}, err
	}
	if row.DeletedAt.Valid {
		return RemoveQuestFromArcState{}, nil
	}
	before, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &spec.QuestId, AsOf: spec.AsOf})
	if err != nil {
		return RemoveQuestFromArcState{}, err
	}
	if before == nil {
		return RemoveQuestFromArcState{}, nil
	}
	return RemoveQuestFromArcState{
		Exists:    true,
		SubjectID: spec.QuestId,
		Before:    before,
	}, nil
}

func (p *ProductPostgres) StoreRemoveQuestFromArc(ctx context.Context, write RemoveQuestFromArcWrite) (QuestView, error) {
	if !write.Locked.Exists {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return QuestView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if _, err := p.queries().ProductQuestClearArc(ctx, dbgen.ProductQuestClearArcParams{
		At:      at,
		QuestID: questID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.ValidatedInput.QuestId, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	return *view, nil
}
