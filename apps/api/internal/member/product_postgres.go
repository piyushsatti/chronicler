package member

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(executor dbgen.DBTX) (*ProductPostgres, error) {
	if executor == nil || (reflect.ValueOf(executor).Kind() == reflect.Pointer && reflect.ValueOf(executor).IsNil()) {
		return nil, fmt.Errorf("member database executor required")
	}
	return &ProductPostgres{DB: executor}, nil
}

func (p *ProductPostgres) queries() *dbgen.Queries {
	return dbgen.New(p.DB)
}

func productID(value string) (pgtype.UUID, error) {
	id, err := db.ParseUUID(value)
	if err != nil || db.UUIDString(id) != value {
		return pgtype.UUID{}, fmt.Errorf("invalid member public id")
	}
	return id, nil
}

func actorID(actor auth.Authority) (pgtype.UUID, error) {
	return productID(actor.Claims().MemberID)
}

func int32Total(total int64) int32 {
	if total > int64(^uint32(0)>>1) {
		return int32(^uint32(0) >> 1)
	}
	return int32(total)
}

func optionalText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func nullableText(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func availabilityNoteValue(value *string) (string, bool) {
	if value == nil {
		return "", false
	}
	return *value, true
}

func (p *ProductPostgres) ReadMember(ctx context.Context, _ auth.Authority, spec MemberSpec) (*MemberView, error) {
	arg := dbgen.ProductMemberIdentityParams{}
	if spec.Id != nil {
		id, err := productID(*spec.Id)
		if err != nil {
			return nil, nil
		}
		arg.MemberID = id
	} else if spec.Handle != nil {
		arg.Handle = pgtype.Text{String: *spec.Handle, Valid: true}
	} else {
		return nil, nil
	}
	row, err := p.queries().ProductMemberIdentity(ctx, arg)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	member := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	return &member, nil
}

func (p *ProductPostgres) ReadMemberByDiscordId(ctx context.Context, _ auth.Authority, spec MemberByDiscordIdSpec) (*MemberView, error) {
	row, err := p.queries().ProductMemberByDiscordID(ctx, spec.DiscordId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	member := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	return &member, nil
}

func (p *ProductPostgres) ReadMemberMe(ctx context.Context, actor auth.Authority, _ MemberMeSpec) (MemberView, error) {
	id, err := actorID(actor)
	if err != nil {
		return MemberView{}, err
	}
	row, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: id})
	if err != nil {
		return MemberView{}, err
	}
	return mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt), nil
}

func (p *ProductPostgres) ReadMembers(ctx context.Context, _ auth.Authority, spec MembersSpec) (MemberListResult, error) {
	arg := dbgen.ProductMembersPageParams{PageLimit: spec.Limit, PageOffset: spec.Offset, Sort: "HANDLE"}
	if spec.Sort != nil {
		arg.Sort = string(*spec.Sort)
	}
	if spec.Filters != nil {
		if spec.Filters.Role != nil {
			arg.Role = optionalText(spec.Filters.Role)
		}
		if spec.Filters.Status != nil {
			arg.Status = optionalText(spec.Filters.Status)
		}
		if spec.Filters.Search != nil {
			arg.Search = optionalText(spec.Filters.Search)
		}
	}
	rows, err := p.queries().ProductMembersPage(ctx, arg)
	if err != nil {
		return MemberListResult{}, err
	}
	out := MemberListResult{Items: []MemberView{}}
	if len(rows) == 0 {
		return out, nil
	}
	out.Total = int32Total(rows[0].Total)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		out.Items = append(out.Items, mapProductMember(row.PublicID, db.TextOrEmpty(row.DiscordID), db.TextOrEmpty(row.Handle), db.TextOrEmpty(row.DisplayName), row.AvatarUrl, row.Roles, db.TextOrEmpty(row.Status), row.JoinedAt))
	}
	return out, nil
}

func (p *ProductPostgres) LockSetMemberRoles(ctx context.Context, spec SetMemberRolesSpec) (SetMemberRolesState, error) {
	id, err := productID(spec.MemberId)
	if err != nil {
		return SetMemberRolesState{}, err
	}
	locked, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{id})
	if err != nil {
		return SetMemberRolesState{}, err
	}
	if len(locked) == 0 {
		return SetMemberRolesState{}, nil
	}
	row, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: id})
	if err != nil {
		return SetMemberRolesState{}, err
	}
	before := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	return SetMemberRolesState{Exists: true, SubjectID: spec.MemberId, OwnerID: spec.MemberId, UpdatedAt: &locked[0].UpdatedAt.Time, Before: &before, TargetMemberIDs: []string{spec.MemberId}}, nil
}

func (p *ProductPostgres) StoreSetMemberRoles(ctx context.Context, write SetMemberRolesWrite) (MemberView, error) {
	memberID, err := productID(write.ValidatedInput.MemberId)
	if err != nil {
		return MemberView{}, err
	}
	actorID, err := productID(write.ActorID)
	if err != nil {
		return MemberView{}, err
	}
	if write.HistoryID == nil {
		return MemberView{}, fmt.Errorf("member role history ID required")
	}
	if write.Locked.Before == nil {
		return MemberView{}, fmt.Errorf("locked member role state required")
	}
	historyID, err := productID(*write.HistoryID)
	if err != nil {
		return MemberView{}, err
	}
	row, err := p.queries().ProductUpdateMemberRoles(ctx, dbgen.ProductUpdateMemberRolesParams{MemberID: memberID, Roles: write.ValidatedInput.Roles, At: pgtype.Timestamptz{Time: write.At, Valid: true}})
	if err != nil {
		return MemberView{}, err
	}
	if _, err := p.queries().ProductAppendRoleHistory(ctx, dbgen.ProductAppendRoleHistoryParams{HistoryID: historyID, MemberID: memberID, OldRoles: write.Locked.Before.Roles, NewRoles: write.ValidatedInput.Roles, ActorID: actorID, At: pgtype.Timestamptz{Time: write.At, Valid: true}, Note: optionalText(write.ValidatedInput.Note)}); err != nil {
		return MemberView{}, err
	}
	return mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt), nil
}

func (p *ProductPostgres) AppendAssessment(ctx context.Context, spec AssessmentSpec) (VerificationView, error) {
	verificationID, err := productID(spec.ID)
	if err != nil {
		return VerificationView{}, err
	}
	actorID, err := productID(spec.ActorID)
	if err != nil {
		return VerificationView{}, err
	}
	verdict := strings.ToLower(string(spec.Verdict))
	if verdict != "approved" && verdict != "rejected" {
		return VerificationView{}, fmt.Errorf("invalid verification verdict %q", spec.Verdict)
	}
	var rowID pgtype.UUID
	var recordedAt pgtype.Timestamptz
	switch spec.SubjectType {
	case "character":
		if spec.ReviewRevision != nil {
			return VerificationView{}, fmt.Errorf("character assessment cannot carry a DM review revision")
		}
		targetID, err := productID(spec.SubjectID)
		if err != nil {
			return VerificationView{}, err
		}
		if spec.SubmissionToken == "" {
			return VerificationView{}, fmt.Errorf("character submission token required")
		}
		submittedAt, err := time.Parse(time.RFC3339Nano, spec.SubmissionToken)
		if err != nil {
			return VerificationView{}, fmt.Errorf("invalid character submission token: %w", err)
		}
		if spec.EvidenceAttemptID != nil {
			return VerificationView{}, fmt.Errorf("character DDB attempt evidence is not stored in squashed schema")
		}
		row, err := p.queries().ProductAppendCharacterVerification(ctx, dbgen.ProductAppendCharacterVerificationParams{
			VerificationID: verificationID, CharacterID: targetID, SubmissionToken: pgtype.Timestamptz{Time: submittedAt, Valid: true},
			Verdict: verdict, ActorID: actorID, Note: optionalText(spec.Note), At: pgtype.Timestamptz{Time: spec.At, Valid: true},
		})
		if err != nil {
			return VerificationView{}, err
		}
		rowID, recordedAt = row.PublicID, row.CreatedAt
	case "dm_profile":
		if spec.ReviewRevision == nil || *spec.ReviewRevision < 1 || *spec.ReviewRevision > 2147483647 {
			return VerificationView{}, fmt.Errorf("positive DM review revision required")
		}
		if spec.EvidenceAttemptID != nil || spec.SubmissionToken != "" {
			return VerificationView{}, fmt.Errorf("DM profile assessment cannot carry character submission fields")
		}
		targetID, err := productID(spec.SubjectID)
		if err != nil {
			return VerificationView{}, err
		}
		row, err := p.queries().ProductAppendDmVerification(ctx, dbgen.ProductAppendDmVerificationParams{
			VerificationID: verificationID, MemberID: targetID, Verdict: verdict, ActorID: actorID,
			Note: optionalText(spec.Note), At: pgtype.Timestamptz{Time: spec.At, Valid: true}, PendingRevision: int32(*spec.ReviewRevision),
		})
		if err != nil {
			return VerificationView{}, err
		}
		rowID, recordedAt = row.PublicID, row.CreatedAt
	default:
		return VerificationView{}, fmt.Errorf("unsupported assessment subject type %q", spec.SubjectType)
	}
	return VerificationView{Id: db.UUIDString(rowID), Note: spec.Note, RecordedAt: recordedAt.Time, TargetId: spec.SubjectID, TargetType: spec.SubjectType, Verdict: verdict, VerifiedBy: db.UUIDString(actorID)}, nil
}

func (p *ProductPostgres) LockSetMemberRolesBatch(ctx context.Context, spec SetMemberRolesBatchSpec) (SetMemberRolesBatchState, error) {
	ids := make([]pgtype.UUID, 0, len(spec.Changes))
	seen := make(map[string]struct{}, len(spec.Changes))
	for _, change := range spec.Changes {
		id, err := productID(change.MemberId)
		if err != nil {
			return SetMemberRolesBatchState{}, err
		}
		if _, exists := seen[change.MemberId]; !exists {
			seen[change.MemberId] = struct{}{}
			ids = append(ids, id)
		}
	}
	rows, err := p.queries().ProductLockMembers(ctx, ids)
	if err != nil {
		return SetMemberRolesBatchState{}, err
	}
	locked := make(map[string]LockedMemberState, len(rows))
	for _, row := range rows {
		id := db.UUIDString(row.PublicID)
		locked[id] = LockedMemberState{ID: id, Roles: append([]string(nil), row.Roles...), Status: row.Status, UpdatedAt: row.UpdatedAt.Time}
	}
	state := SetMemberRolesBatchState{Members: make([]LockedMemberState, 0, len(ids)), TargetMemberIDs: make([]string, 0, len(ids))}
	seen = make(map[string]struct{}, len(spec.Changes))
	for _, change := range spec.Changes {
		if _, exists := seen[change.MemberId]; exists {
			continue
		}
		seen[change.MemberId] = struct{}{}
		state.TargetMemberIDs = append(state.TargetMemberIDs, change.MemberId)
		if member, ok := locked[change.MemberId]; ok {
			state.Members = append(state.Members, member)
		}
	}
	return state, nil
}

func (p *ProductPostgres) StoreSetMemberRolesBatch(ctx context.Context, write SetMemberRolesBatchWrite) ([]MemberRoleBatchResultView, error) {
	actor, err := productID(write.ActorID)
	if err != nil {
		return nil, err
	}
	if len(write.ValidatedInput.Changes) == 0 {
		if len(write.HistoryIDs) != 0 {
			return nil, fmt.Errorf("member role history IDs supplied for an empty batch")
		}
		return []MemberRoleBatchResultView{}, nil
	}
	locked := make(map[string]LockedMemberState, len(write.Locked.Members))
	for _, member := range write.Locked.Members {
		locked[member.ID] = member
	}
	for memberID := range write.HistoryIDs {
		if _, ok := locked[memberID]; !ok {
			return nil, fmt.Errorf("member role history ID has no locked member %s", memberID)
		}
	}
	seen := make(map[string]struct{}, len(write.ValidatedInput.Changes))
	seenHistory := make(map[string]struct{}, len(write.ValidatedInput.Changes))
	changes := make([]map[string]any, 0, len(write.ValidatedInput.Changes))
	for _, change := range write.ValidatedInput.Changes {
		if _, err := productID(change.MemberId); err != nil {
			return nil, err
		}
		if _, ok := seen[change.MemberId]; ok {
			return nil, fmt.Errorf("duplicate member role target %s", change.MemberId)
		}
		seen[change.MemberId] = struct{}{}
		if _, ok := locked[change.MemberId]; !ok {
			continue
		}
		historyID, ok := write.HistoryIDs[change.MemberId]
		if !ok {
			return nil, fmt.Errorf("member role history ID required for %s", change.MemberId)
		}
		if _, err := productID(historyID); err != nil {
			return nil, err
		}
		if _, exists := seenHistory[historyID]; exists {
			return nil, fmt.Errorf("member role history IDs must be unique")
		}
		seenHistory[historyID] = struct{}{}
		changes = append(changes, map[string]any{"memberId": change.MemberId, "historyId": historyID, "note": change.Note, "roles": change.Roles})
	}
	if len(write.HistoryIDs) != len(changes) {
		return nil, fmt.Errorf("member role history ID count does not match successful batch members")
	}
	if len(changes) == 0 {
		results := make([]MemberRoleBatchResultView, 0, len(write.ValidatedInput.Changes))
		for _, change := range write.ValidatedInput.Changes {
			message := "member not found"
			results = append(results, MemberRoleBatchResultView{MemberId: change.MemberId, Error: &message})
		}
		return results, nil
	}
	encoded, err := json.Marshal(changes)
	if err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductSetMemberRolesBatch(ctx, dbgen.ProductSetMemberRolesBatchParams{Changes: encoded, At: pgtype.Timestamptz{Time: write.At, Valid: true}, ActorID: actor})
	if err != nil {
		return nil, err
	}
	updated := make(map[string]MemberView, len(rows))
	for _, row := range rows {
		id := db.UUIDString(row.PublicID)
		if expected := write.HistoryIDs[id]; expected == "" || db.UUIDString(row.HistoryID) != expected {
			return nil, fmt.Errorf("role history result did not match the prepared ID for %s", id)
		}
		updated[id] = mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	}
	if len(updated) != len(changes) {
		return nil, fmt.Errorf("role batch result did not match the locked members")
	}
	results := make([]MemberRoleBatchResultView, 0, len(write.ValidatedInput.Changes))
	for _, change := range write.ValidatedInput.Changes {
		if member, ok := updated[change.MemberId]; ok {
			results = append(results, MemberRoleBatchResultView{MemberId: change.MemberId, Member: &member, Ok: true})
			continue
		}
		message := "member not found"
		results = append(results, MemberRoleBatchResultView{MemberId: change.MemberId, Error: &message})
	}
	return results, nil
}

func (p *ProductPostgres) LockUpdateMyProfile(ctx context.Context, actorID string, _ UpdateMyProfileSpec) (UpdateMyProfileState, error) {
	id, err := productID(actorID)
	if err != nil {
		return UpdateMyProfileState{}, err
	}
	locked, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{id})
	if err != nil {
		return UpdateMyProfileState{}, err
	}
	if len(locked) == 0 {
		return UpdateMyProfileState{}, nil
	}
	row, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: id})
	if err != nil {
		return UpdateMyProfileState{}, err
	}
	before := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	return UpdateMyProfileState{Exists: true, SubjectID: actorID, OwnerID: actorID, UpdatedAt: &locked[0].UpdatedAt.Time, Before: &before, TargetMemberIDs: []string{actorID}}, nil
}

func (p *ProductPostgres) StoreUpdateMyProfile(ctx context.Context, write UpdateMyProfileWrite) (MemberView, error) {
	id, err := productID(write.ActorID)
	if err != nil {
		return MemberView{}, err
	}
	input := write.ValidatedInput.Input
	setAvatar := input.AvatarUrl.Set
	avatar := pgtype.Text{}
	if input.AvatarUrl.Value != nil {
		avatar = pgtype.Text{String: *input.AvatarUrl.Value, Valid: true}
	}
	row, err := p.queries().ProductUpdateMemberProfile(ctx, dbgen.ProductUpdateMemberProfileParams{ActorID: id, DisplayName: input.DisplayName, SetAvatar: setAvatar, AvatarUrl: avatar, At: pgtype.Timestamptz{Time: write.At, Valid: true}})
	if err != nil {
		return MemberView{}, err
	}
	return mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt), nil
}

func (p *ProductPostgres) ReadMemberActivityStats(ctx context.Context, _ auth.Authority, spec MemberActivityStatsSpec) (*MemberActivityStatsView, error) {
	id, err := productID(spec.MemberId)
	if err != nil {
		return nil, nil
	}
	row, err := p.queries().ProductMemberActivity(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view := &MemberActivityStatsView{MemberID: db.UUIDString(row.PublicID), Messages: row.Messages, VoiceMinutes: row.VoiceMinutes, QuestsPlayed: int32Total(row.QuestsPlayed), SummariesAuthored: int32Total(row.SummariesAuthored)}
	if at, ok := row.LastMessageAt.(time.Time); ok {
		view.LastMessageAt = &at
	}
	if row.LongestSessionHours > 0 {
		hours := row.LongestSessionHours
		view.LongestSessionHours = &hours
	}
	return view, nil
}

func (p *ProductPostgres) ReadMyPersonalization(ctx context.Context, actor auth.Authority, _ MyPersonalizationSpec) (*MyPersonalizationView, error) {
	id, err := actorID(actor)
	if err != nil {
		return nil, err
	}
	row, err := p.queries().ProductMemberSettings(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	settings := mapProductSettings(row)
	return &MyPersonalizationView{Settings: &settings}, nil
}

func (p *ProductPostgres) ReadBatchMembers(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[MemberView], error) {
	out := make([]product.BatchResult[MemberView], len(keys))
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := productID(key.ID)
		if err != nil {
			out[i].Err = err
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.queries().ProductBatchMembers(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		position := int(row.Position) - 1
		if position < 0 || position >= len(positions) || !row.PublicID.Valid {
			continue
		}
		member := mapProductMember(row.PublicID, db.TextOrEmpty(row.DiscordID), db.TextOrEmpty(row.Handle), db.TextOrEmpty(row.DisplayName), row.AvatarUrl, row.Roles, db.TextOrEmpty(row.Status), row.JoinedAt)
		out[positions[position]].Value = &member
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchMemberVoiceChannels(ctx context.Context, _ auth.Authority, keys []MemberVoiceChannelsKey) ([]product.BatchResult[VoiceChannelList], error) {
	out := make([]product.BatchResult[VoiceChannelList], len(keys))
	idsByPage, positionsByPage := batchMemberPages(keys, func(key MemberVoiceChannelsKey) (string, int32, int32) { return key.ParentID, key.Limit, key.Offset }, out)
	for page, ids := range idsByPage {
		rows, queryErr := p.queries().ProductBatchVoiceChannels(ctx, dbgen.ProductBatchVoiceChannelsParams{MemberIds: ids, PageLimit: page.limit, PageOffset: page.offset})
		if queryErr != nil {
			return nil, queryErr
		}
		itemsByID := make(map[string][]ChannelVoiceMinutesView)
		for _, row := range rows {
			id := db.UUIDString(row.MemberID)
			itemsByID[id] = append(itemsByID[id], ChannelVoiceMinutesView{ChannelId: row.ChannelID, Minutes: row.Minutes})
		}
		for id, positions := range positionsByPage[page] {
			value := &VoiceChannelList{Items: append([]ChannelVoiceMinutesView{}, itemsByID[id]...)}
			for _, position := range positions {
				out[position].Value = value
			}
		}
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchMemberRecentSessions(ctx context.Context, _ auth.Authority, keys []MemberRecentSessionsKey) ([]product.BatchResult[ActivityEventList], error) {
	out := make([]product.BatchResult[ActivityEventList], len(keys))
	idsByPage, positionsByPage := batchMemberPages(keys, func(key MemberRecentSessionsKey) (string, int32, int32) { return key.ParentID, key.Limit, key.Offset }, out)
	for page, ids := range idsByPage {
		rows, queryErr := p.queries().ProductBatchRecentSessions(ctx, dbgen.ProductBatchRecentSessionsParams{MemberIds: ids, PageLimit: page.limit, PageOffset: page.offset})
		if queryErr != nil {
			return nil, queryErr
		}
		itemsByID := make(map[string][]ActivityEventView)
		for _, row := range rows {
			id := db.UUIDString(row.MemberID)
			itemsByID[id] = append(itemsByID[id], ActivityEventView{Kind: row.Kind, ChannelId: row.ChannelID, OccurredAt: row.OccurredAt.Time, Amount: row.Amount})
		}
		for id, positions := range positionsByPage[page] {
			value := &ActivityEventList{Items: append([]ActivityEventView{}, itemsByID[id]...)}
			for _, position := range positions {
				out[position].Value = value
			}
		}
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchMemberRecentWeeks(ctx context.Context, _ auth.Authority, keys []MemberRecentWeeksKey) ([]product.BatchResult[WeekActivityList], error) {
	out := make([]product.BatchResult[WeekActivityList], len(keys))
	idsByPage, positionsByPage := batchMemberPages(keys, func(key MemberRecentWeeksKey) (string, int32, int32) { return key.ParentID, key.Limit, key.Offset }, out)
	for page, ids := range idsByPage {
		rows, queryErr := p.queries().ProductBatchRecentWeeks(ctx, dbgen.ProductBatchRecentWeeksParams{MemberIds: ids, PageLimit: page.limit, PageOffset: page.offset})
		if queryErr != nil {
			return nil, queryErr
		}
		itemsByID := make(map[string][]WeekActivityView)
		for _, row := range rows {
			id := db.UUIDString(row.MemberID)
			itemsByID[id] = append(itemsByID[id], WeekActivityView{PeriodStart: product.Date(row.PeriodStart.Time.Format("2006-01-02")), Messages: row.Messages, Reactions: row.Reactions, VoiceMinutes: row.VoiceMinutes})
		}
		for id, positions := range positionsByPage[page] {
			value := &WeekActivityList{Items: append([]WeekActivityView{}, itemsByID[id]...)}
			for _, position := range positions {
				out[position].Value = value
			}
		}
	}
	return out, nil
}

type memberBatchPage struct {
	limit  int32
	offset int32
}

func batchMemberPages[K any, T any](keys []K, fields func(K) (string, int32, int32), out []product.BatchResult[T]) (map[memberBatchPage][]pgtype.UUID, map[memberBatchPage]map[string][]int) {
	idsByPage := make(map[memberBatchPage][]pgtype.UUID)
	positionsByPage := make(map[memberBatchPage]map[string][]int)
	seenByPage := make(map[memberBatchPage]map[string]struct{})
	for i, key := range keys {
		idText, limit, offset := fields(key)
		id, err := productID(idText)
		if err != nil {
			out[i].Err = err
			continue
		}
		page := memberBatchPage{limit: limit, offset: offset}
		if positionsByPage[page] == nil {
			positionsByPage[page] = make(map[string][]int)
			seenByPage[page] = make(map[string]struct{})
		}
		positionsByPage[page][idText] = append(positionsByPage[page][idText], i)
		if _, exists := seenByPage[page][idText]; !exists {
			seenByPage[page][idText] = struct{}{}
			idsByPage[page] = append(idsByPage[page], id)
		}
	}
	return idsByPage, positionsByPage
}

func (p *ProductPostgres) LockGrantUnlock(ctx context.Context, spec GrantUnlockSpec) (GrantUnlockState, error) {
	memberID, err := productID(spec.MemberId)
	if err != nil {
		return GrantUnlockState{}, err
	}
	unlockableID, err := productID(spec.UnlockableId)
	if err != nil {
		return GrantUnlockState{}, err
	}
	lockedMembers, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{memberID})
	if err != nil {
		return GrantUnlockState{}, err
	}
	if len(lockedMembers) == 0 {
		return GrantUnlockState{}, nil
	}
	memberRow, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: memberID})
	if err != nil {
		return GrantUnlockState{}, err
	}
	unlockable, err := p.queries().ProductLockUnlockable(ctx, unlockableID)
	if errors.Is(err, pgx.ErrNoRows) {
		return GrantUnlockState{}, nil
	}
	if err != nil {
		return GrantUnlockState{}, err
	}
	catalog, err := mapUnlockable(unlockable)
	if err != nil {
		return GrantUnlockState{}, err
	}
	state := GrantUnlockState{Exists: true, SubjectID: spec.MemberId, OwnerID: spec.MemberId, UpdatedAt: &lockedMembers[0].UpdatedAt.Time, Before: ptrMember(mapProductMember(memberRow.PublicID, memberRow.DiscordID, memberRow.Handle, memberRow.DisplayName, memberRow.AvatarUrl, memberRow.Roles, memberRow.Status, memberRow.JoinedAt)), TargetMemberIDs: []string{spec.MemberId}, Catalog: catalog}
	existing, err := p.queries().ProductExistingGrant(ctx, dbgen.ProductExistingGrantParams{MemberID: memberID, UnlockableID: unlockableID})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return GrantUnlockState{}, err
	}
	if err == nil {
		var grantedBy *string
		if existing.GrantedBy.Valid {
			value := db.UUIDString(existing.GrantedBy)
			grantedBy = &value
		}
		state.ExistingGrant = &MemberUnlockView{MemberId: db.UUIDString(existing.MemberID), UnlockableId: db.UUIDString(existing.UnlockableID), Source: existing.Source, UnlockedAt: existing.GrantedAt.Time, GrantedBy: grantedBy}
	}
	return state, nil
}

func (p *ProductPostgres) StoreGrantUnlock(ctx context.Context, write GrantUnlockWrite) (MemberUnlockView, error) {
	memberID, err := productID(write.ValidatedInput.MemberId)
	if err != nil {
		return MemberUnlockView{}, err
	}
	unlockableID, err := productID(write.ValidatedInput.UnlockableId)
	if err != nil {
		return MemberUnlockView{}, err
	}
	actor, err := productID(write.ActorID)
	if err != nil {
		return MemberUnlockView{}, err
	}
	grantedAt, err := p.queries().ProductGrantUnlock(ctx, dbgen.ProductGrantUnlockParams{MemberID: memberID, UnlockableID: unlockableID, ActorID: actor, At: pgtype.Timestamptz{Time: write.At, Valid: true}, Note: write.ValidatedInput.Note})
	if err != nil {
		return MemberUnlockView{}, err
	}
	by := write.ActorID
	return MemberUnlockView{MemberId: write.ValidatedInput.MemberId, UnlockableId: write.ValidatedInput.UnlockableId, Source: "grant", GrantedBy: &by, UnlockedAt: grantedAt.Time}, nil
}

func ptrMember(value MemberView) *MemberView { return &value }

func mapStoredUnlockKind(value string) (UnlockKind, error) {
	switch value {
	case "achievement":
		return UnlockKindAchievement, nil
	case "dm_tier":
		return UnlockKindDmTier, nil
	default:
		return "", fmt.Errorf("unknown stored unlock kind %q", value)
	}
}

func mapAPIUnlockKind(value UnlockKind) (string, error) {
	switch value {
	case UnlockKindAchievement:
		return "achievement", nil
	case UnlockKindDmTier:
		return "dm_tier", nil
	default:
		return "", fmt.Errorf("unknown API unlock kind %q", value)
	}
}

func mapUnlockable(value dbgen.Unlockable) (UnlockableView, error) {
	kind, err := mapStoredUnlockKind(value.Kind)
	if err != nil {
		return UnlockableView{}, err
	}
	var rule *json.RawMessage
	if len(value.UnlockRule) != 0 {
		raw := json.RawMessage(append([]byte(nil), value.UnlockRule...))
		rule = &raw
	}
	return UnlockableView{Id: db.UUIDString(value.PublicID), Name: value.Name, Description: nullableText(value.Description), Kind: kind, Active: value.Active, Payload: append(json.RawMessage(nil), value.Payload...), UnlockRule: rule}, nil
}

func (p *ProductPostgres) LockSetMyAvailability(ctx context.Context, actorID string, _ SetMyAvailabilitySpec) (SetMyAvailabilityState, error) {
	id, err := productID(actorID)
	if err != nil {
		return SetMyAvailabilityState{}, err
	}
	rows, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{id})
	if err != nil {
		return SetMyAvailabilityState{}, err
	}
	if len(rows) == 0 {
		return SetMyAvailabilityState{}, nil
	}
	identity, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: id})
	if err != nil {
		return SetMyAvailabilityState{}, err
	}
	before := mapProductMember(identity.PublicID, identity.DiscordID, identity.Handle, identity.DisplayName, identity.AvatarUrl, identity.Roles, identity.Status, identity.JoinedAt)
	slots, err := p.availability(ctx, id)
	if err != nil {
		return SetMyAvailabilityState{}, err
	}
	return SetMyAvailabilityState{Exists: true, SubjectID: actorID, OwnerID: actorID, TargetMemberIDs: []string{actorID}, Before: &before, UpdatedAt: &rows[0].UpdatedAt.Time, Slots: slots}, nil
}

func (p *ProductPostgres) StoreSetMyAvailability(ctx context.Context, write SetMyAvailabilityWrite) ([]AvailabilitySlotView, error) {
	id, err := productID(write.ActorID)
	if err != nil {
		return nil, err
	}
	arg := dbgen.ProductInsertAvailabilityParams{ActorID: id, Weekdays: make([]int16, 0, len(write.ValidatedInput.Slots)), Starts: make([]int16, 0, len(write.ValidatedInput.Slots)), Ends: make([]int16, 0, len(write.ValidatedInput.Slots)), Notes: make([]string, 0, len(write.ValidatedInput.Slots)), NotesValid: make([]bool, 0, len(write.ValidatedInput.Slots))}
	keys := make([]availabilityKey, 0, len(write.ValidatedInput.Slots))
	for _, slot := range write.ValidatedInput.Slots {
		weekday, err := parseWeekday(slot.Day)
		if err != nil {
			return nil, err
		}
		start, err := parseMinuteTime(slot.StartTime)
		if err != nil {
			return nil, err
		}
		end, err := parseMinuteTime(slot.EndTime)
		if err != nil {
			return nil, err
		}
		arg.Weekdays = append(arg.Weekdays, weekday)
		arg.Starts = append(arg.Starts, start)
		arg.Ends = append(arg.Ends, end)
		note, noteValid := availabilityNoteValue(slot.Note)
		arg.Notes = append(arg.Notes, note)
		arg.NotesValid = append(arg.NotesValid, noteValid)
		keys = append(keys, availabilityKey{weekday: weekday, start: start, end: end, note: note})
	}
	if _, err := p.queries().ProductDeleteAvailability(ctx, id); err != nil {
		return nil, err
	}
	rows, err := p.queries().ProductInsertAvailability(ctx, arg)
	if err != nil {
		return nil, err
	}
	matched := make([]bool, len(rows))
	items := make([]AvailabilitySlotView, 0, len(rows))
	for _, key := range keys {
		found := false
		for i, row := range rows {
			if matched[i] || row.Weekday != key.weekday || row.StartMinute != key.start || row.EndMinute != key.end || db.TextOrEmpty(row.Note) != key.note {
				continue
			}
			matched[i] = true
			items = append(items, AvailabilitySlotView{Day: weekdayName(row.Weekday), StartTime: minuteTime(row.StartMinute), EndTime: minuteTime(row.EndMinute), Note: nullableText(row.Note)})
			found = true
			break
		}
		if !found {
			return nil, fmt.Errorf("availability insert result did not match its input")
		}
	}
	return items, nil
}

type availabilityKey struct {
	weekday, start, end int16
	note                string
}

func parseWeekday(value string) (int16, error) {
	for i, day := range []string{"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"} {
		if strings.EqualFold(value, day) {
			return int16(i), nil
		}
	}
	return 0, fmt.Errorf("invalid availability weekday %q", value)
}

func parseMinuteTime(value product.Time) (int16, error) {
	parts := strings.Split(string(value), ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, fmt.Errorf("invalid availability time %q", value)
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, fmt.Errorf("invalid availability time %q", value)
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil || hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour == 24 && minute != 0) {
		return 0, fmt.Errorf("invalid availability time %q", value)
	}
	if len(parts) == 3 && parts[2] != "00" {
		return 0, fmt.Errorf("invalid availability time %q", value)
	}
	return int16(hour*60 + minute), nil
}

func (p *ProductPostgres) ReadUnlockablesCatalog(ctx context.Context, _ auth.Authority, spec UnlockablesCatalogSpec) (UnlockablePage, error) {
	rows, err := p.queries().ProductUnlockCatalog(ctx, dbgen.ProductUnlockCatalogParams{ActiveOnly: spec.ActiveOnly, PageLimit: spec.Limit, PageOffset: spec.Offset})
	if err != nil {
		return UnlockablePage{}, err
	}
	page := UnlockablePage{Items: []UnlockableView{}}
	if len(rows) == 0 {
		return page, nil
	}
	page.Total = int32Total(rows[0].Total)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		kind, err := mapStoredUnlockKind(db.TextOrEmpty(row.Kind))
		if err != nil {
			return UnlockablePage{}, err
		}
		var rule *json.RawMessage
		if len(row.UnlockRule) != 0 {
			raw := json.RawMessage(append([]byte(nil), row.UnlockRule...))
			rule = &raw
		}
		page.Items = append(page.Items, UnlockableView{Id: db.UUIDString(row.PublicID), Name: db.TextOrEmpty(row.Name), Description: nullableText(row.Description), Kind: kind, Active: row.Active.Bool, Payload: append(json.RawMessage(nil), row.Payload...), UnlockRule: rule})
	}
	return page, nil
}

func (p *ProductPostgres) LockUpdateMySettings(ctx context.Context, actorID string, _ UpdateMySettingsSpec) (UpdateMySettingsState, error) {
	id, err := productID(actorID)
	if err != nil {
		return UpdateMySettingsState{}, err
	}
	locked, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{id})
	if err != nil {
		return UpdateMySettingsState{}, err
	}
	if len(locked) == 0 {
		return UpdateMySettingsState{}, nil
	}
	identity, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: id})
	if err != nil {
		return UpdateMySettingsState{}, err
	}
	settings, err := p.queries().ProductMemberSettings(ctx, id)
	if err != nil {
		return UpdateMySettingsState{}, err
	}
	before := mapProductMember(identity.PublicID, identity.DiscordID, identity.Handle, identity.DisplayName, identity.AvatarUrl, identity.Roles, identity.Status, identity.JoinedAt)
	return UpdateMySettingsState{Exists: true, SubjectID: actorID, OwnerID: actorID, UpdatedAt: &locked[0].UpdatedAt.Time, Before: &before, TargetMemberIDs: []string{actorID}, Settings: mapProductSettings(settings)}, nil
}

func (p *ProductPostgres) StoreUpdateMySettings(ctx context.Context, write UpdateMySettingsWrite) (MemberSettingsView, error) {
	id, err := productID(write.ActorID)
	if err != nil {
		return MemberSettingsView{}, err
	}
	patch := write.ValidatedInput.Input
	arg := dbgen.ProductStoreSettingsParams{ActorID: id, At: pgtype.Timestamptz{Time: write.At, Valid: true}}
	arg.SetTheme, arg.Theme = optionalEnum(patch.Theme)
	arg.SetMode, arg.Mode = optionalEnum(patch.Mode)
	arg.SetDensity, arg.Density = optionalEnum(patch.Density)
	arg.SetEffectsEnabled, arg.EffectsEnabled = optionalBool(patch.EffectsEnabled)
	arg.SetColorblindSafe, arg.ColorblindSafe = optionalBool(patch.ColorblindSafe)
	arg.SetReducedMotion, arg.ReducedMotion = optionalBool(patch.ReducedMotion)
	arg.SetNotifyCharacterVerification, arg.NotifyCharacterVerification = optionalBool(patch.NotifyCharacterVerification)
	arg.SetNotifyQuestSignup, arg.NotifyQuestSignup = optionalBool(patch.NotifyQuestSignup)
	arg.SetNotifyDocumentActivity, arg.NotifyDocumentActivity = optionalBool(patch.NotifyDocumentActivity)
	arg.SetNotifyQuestScheduled, arg.NotifyQuestScheduled = optionalBool(patch.NotifyQuestScheduled)
	arg.SetNotifyDmMentioned, arg.NotifyDmMentioned = optionalBool(patch.NotifyDmMentioned)
	arg.SetNotifyDmRequestDecided, arg.NotifyDmRequestDecided = optionalBool(patch.NotifyDmRequestDecided)
	arg.SetTimezone = patch.Timezone.Set
	if patch.Timezone.Set && patch.Timezone.Value != nil {
		arg.Timezone = pgtype.Text{String: *patch.Timezone.Value, Valid: true}
	}
	row, err := p.queries().ProductStoreSettings(ctx, arg)
	if err != nil {
		return MemberSettingsView{}, err
	}
	return MemberSettingsView{MemberId: write.ActorID, Theme: Theme(strings.ToUpper(row.Theme)), Mode: ColorMode(strings.ToUpper(row.Mode)), Density: Density(strings.ToUpper(row.Density)), EffectsEnabled: row.EffectsEnabled, ColorblindSafe: row.ColorblindSafe, ReducedMotion: row.ReducedMotion, NotifyCharacterVerification: row.NotifyCharacterVerification, NotifyQuestSignup: row.NotifyQuestSignup, NotifyDocumentActivity: row.NotifyDocumentActivity, NotifyQuestScheduled: row.NotifyQuestScheduled, NotifyDmMentioned: row.NotifyDmMentioned, NotifyDmRequestDecided: row.NotifyDmRequestDecided, Timezone: nullableText(row.Timezone), UpdatedAt: &row.UpdatedAt.Time}, nil
}

func optionalBool(value product.Optional[bool]) (bool, pgtype.Bool) {
	if !value.Set {
		return false, pgtype.Bool{}
	}
	if value.Value == nil {
		return true, pgtype.Bool{}
	}
	return true, pgtype.Bool{Bool: *value.Value, Valid: true}
}

func optionalEnum[T ~string](value product.Optional[T]) (bool, pgtype.Text) {
	if !value.Set {
		return false, pgtype.Text{}
	}
	if value.Value == nil {
		return true, pgtype.Text{}
	}
	return true, pgtype.Text{String: strings.ToLower(string(*value.Value)), Valid: true}
}

func mapProductSettings(row dbgen.ProductMemberSettingsRow) MemberSettingsView {
	return MemberSettingsView{MemberId: db.UUIDString(row.MemberID), Theme: Theme(strings.ToUpper(row.Theme)), Mode: ColorMode(strings.ToUpper(row.Mode)), Density: Density(strings.ToUpper(row.Density)), EffectsEnabled: row.EffectsEnabled, ColorblindSafe: row.ColorblindSafe, ReducedMotion: row.ReducedMotion, NotifyCharacterVerification: row.NotifyCharacterVerification, NotifyQuestSignup: row.NotifyQuestSignup, NotifyDocumentActivity: row.NotifyDocumentActivity, NotifyQuestScheduled: row.NotifyQuestScheduled, NotifyDmMentioned: row.NotifyDmMentioned, NotifyDmRequestDecided: row.NotifyDmRequestDecided, Timezone: nullableText(row.Timezone), UpdatedAt: &row.UpdatedAt.Time}
}

func (p *ProductPostgres) LockSetUnlockableActive(ctx context.Context, spec SetUnlockableActiveSpec) (SetUnlockableActiveState, error) {
	id, err := productID(spec.Id)
	if err != nil {
		return SetUnlockableActiveState{}, err
	}
	row, err := p.queries().ProductLockUnlockable(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return SetUnlockableActiveState{}, nil
	}
	if err != nil {
		return SetUnlockableActiveState{}, err
	}
	before, err := mapUnlockable(row)
	if err != nil {
		return SetUnlockableActiveState{}, err
	}
	return SetUnlockableActiveState{Exists: true, SubjectID: spec.Id, Before: &before}, nil
}

func (p *ProductPostgres) StoreSetUnlockableActive(ctx context.Context, write SetUnlockableActiveWrite) (UnlockableView, error) {
	id, err := productID(write.ValidatedInput.Id)
	if err != nil {
		return UnlockableView{}, err
	}
	row, err := p.queries().ProductSetUnlockableActive(ctx, dbgen.ProductSetUnlockableActiveParams{Active: write.ValidatedInput.Active, UnlockableID: id})
	if err != nil {
		return UnlockableView{}, err
	}
	if db.UUIDString(row.PublicID) != db.UUIDString(id) {
		return UnlockableView{}, fmt.Errorf("unlockable result did not match the prepared public ID")
	}
	return mapUnlockable(row)
}

func (p *ProductPostgres) LockUpsertUnlockable(ctx context.Context, spec UpsertUnlockableSpec) (UpsertUnlockableState, error) {
	if spec.Id == nil {
		return UpsertUnlockableState{}, nil
	}
	id, err := productID(*spec.Id)
	if err != nil {
		return UpsertUnlockableState{}, err
	}
	row, err := p.queries().ProductLockUnlockable(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return UpsertUnlockableState{}, nil
	}
	if err != nil {
		return UpsertUnlockableState{}, err
	}
	before, err := mapUnlockable(row)
	if err != nil {
		return UpsertUnlockableState{}, err
	}
	return UpsertUnlockableState{Exists: true, SubjectID: *spec.Id, Before: &before}, nil
}

func (p *ProductPostgres) StoreUpsertUnlockable(ctx context.Context, write UpsertUnlockableWrite) (UnlockableView, error) {
	var id pgtype.UUID
	var err error
	creating := write.ValidatedInput.Id == nil
	if creating {
		if write.Locked.Exists {
			return UnlockableView{}, fmt.Errorf("catalog create cannot have a locked existing unlockable")
		}
		if write.UnlockableID == "" {
			return UnlockableView{}, fmt.Errorf("unlockable public ID required for create")
		}
		id, err = productID(write.UnlockableID)
	} else {
		id, err = productID(*write.ValidatedInput.Id)
		if err == nil && (!write.Locked.Exists || write.Locked.SubjectID != *write.ValidatedInput.Id) {
			err = fmt.Errorf("unlockable ID does not match the locked catalog item")
		}
		if err == nil && write.Input.Id != nil && *write.Input.Id != *write.ValidatedInput.Id {
			err = fmt.Errorf("validated unlockable ID does not match the requested catalog item")
		}
		if err == nil && write.UnlockableID != "" && write.UnlockableID != *write.ValidatedInput.Id {
			err = fmt.Errorf("unlockable ID does not match the locked catalog item")
		}
	}
	if err != nil {
		return UnlockableView{}, err
	}
	input := write.ValidatedInput.Input
	kind, err := mapAPIUnlockKind(input.Kind)
	if err != nil {
		return UnlockableView{}, fmt.Errorf("invalid unlockable kind %q", input.Kind)
	}
	var rule []byte
	if input.UnlockRule != nil {
		rule = []byte(*input.UnlockRule)
	}
	var row dbgen.Unlockable
	if creating {
		row, err = p.queries().ProductCreateUnlockable(ctx, dbgen.ProductCreateUnlockableParams{UnlockableID: id, Name: input.Name, Description: optionalText(input.Description), Kind: kind, Active: input.Active, Payload: []byte(input.Payload), UnlockRule: rule})
	} else {
		row, err = p.queries().ProductUpdateUnlockable(ctx, dbgen.ProductUpdateUnlockableParams{Name: input.Name, Description: optionalText(input.Description), Kind: kind, Active: input.Active, Payload: []byte(input.Payload), UnlockRule: rule, UnlockableID: id})
	}
	if err != nil {
		return UnlockableView{}, err
	}
	if db.UUIDString(row.PublicID) != db.UUIDString(id) {
		return UnlockableView{}, fmt.Errorf("unlockable result did not match the prepared public ID")
	}
	return mapUnlockable(row)
}

func (p *ProductPostgres) ReadMemberRoleHistory(ctx context.Context, _ auth.Authority, spec MemberRoleHistorySpec) (RoleChangePage, error) {
	id, err := productID(spec.MemberId)
	if err != nil {
		return RoleChangePage{Items: []RoleChangeView{}}, nil
	}
	rows, err := p.queries().ProductRoleHistory(ctx, dbgen.ProductRoleHistoryParams{MemberID: id, PageLimit: spec.Limit, PageOffset: spec.Offset})
	if err != nil {
		return RoleChangePage{}, err
	}
	page := RoleChangePage{Items: []RoleChangeView{}}
	if len(rows) == 0 {
		return page, nil
	}
	page.Total = int32Total(rows[0].Total)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		page.Items = append(page.Items, RoleChangeView{Id: db.UUIDString(row.PublicID), MemberId: db.UUIDString(row.MemberID), OldRoles: append([]string(nil), row.OldRoles...), NewRoles: append([]string(nil), row.NewRoles...), ChangedBy: db.UUIDString(row.ChangedBy), OccurredAt: row.OccurredAt.Time, Note: nullableText(row.Note)})
	}
	return page, nil
}

func (p *ProductPostgres) ReadMemberAvailability(ctx context.Context, _ auth.Authority, spec MemberAvailabilitySpec) ([]AvailabilitySlotView, error) {
	id, err := productID(spec.MemberId)
	if err != nil {
		return []AvailabilitySlotView{}, nil
	}
	return p.availability(ctx, id)
}

func (p *ProductPostgres) ReadMyAvailability(ctx context.Context, actor auth.Authority, _ MyAvailabilitySpec) ([]AvailabilitySlotView, error) {
	id, err := actorID(actor)
	if err != nil {
		return nil, err
	}
	return p.availability(ctx, id)
}

func (p *ProductPostgres) availability(ctx context.Context, id pgtype.UUID) ([]AvailabilitySlotView, error) {
	rows, err := p.queries().ProductMemberAvailability(ctx, id)
	if err != nil {
		return nil, err
	}
	items := make([]AvailabilitySlotView, 0, len(rows))
	for _, row := range rows {
		items = append(items, AvailabilitySlotView{Day: weekdayName(row.Weekday), StartTime: minuteTime(row.StartMinute), EndTime: minuteTime(row.EndMinute), Note: nullableText(row.Note)})
	}
	return items, nil
}

func (p *ProductPostgres) ReadDmRequests(ctx context.Context, actor auth.Authority, spec DmRequestsSpec) (RequestPage, error) {
	id, err := actorID(actor)
	if err != nil {
		return RequestPage{}, err
	}
	return p.requests(ctx, true, id, spec.Limit, spec.Offset)
}

func (p *ProductPostgres) ReadMyRequests(ctx context.Context, actor auth.Authority, spec MyRequestsSpec) (RequestPage, error) {
	id, err := actorID(actor)
	if err != nil {
		return RequestPage{}, err
	}
	return p.requests(ctx, false, id, spec.Limit, spec.Offset)
}

func (p *ProductPostgres) requests(ctx context.Context, addressed bool, id pgtype.UUID, limit, offset int32) (RequestPage, error) {
	_ = ctx
	_ = addressed
	_ = id
	_ = limit
	_ = offset
	return RequestPage{Items: []RequestView{}, Total: 0}, nil
}

func (p *ProductPostgres) LockCreateRequest(ctx context.Context, actorID string, spec CreateRequestSpec) (CreateRequestState, error) {
	if actorID == spec.TargetDmId {
		return CreateRequestState{}, nil
	}
	actor, err := productID(actorID)
	if err != nil {
		return CreateRequestState{}, err
	}
	target, err := productID(spec.TargetDmId)
	if err != nil {
		return CreateRequestState{}, err
	}
	rows, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{actor, target})
	if err != nil {
		return CreateRequestState{}, err
	}
	found := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if row.Status == "active" {
			found[db.UUIDString(row.PublicID)] = struct{}{}
		}
	}
	if _, ok := found[actorID]; !ok {
		return CreateRequestState{}, nil
	}
	if _, ok := found[spec.TargetDmId]; !ok {
		return CreateRequestState{}, nil
	}
	profile, err := p.queries().ProductLockDmProfile(ctx, target)
	if errors.Is(err, pgx.ErrNoRows) {
		return CreateRequestState{}, nil
	}
	if err != nil {
		return CreateRequestState{}, err
	}
	if profile.Status != "approved" {
		return CreateRequestState{}, nil
	}
	return CreateRequestState{Exists: true, SubjectID: spec.TargetDmId, OwnerID: actorID, TargetMemberIDs: []string{actorID, spec.TargetDmId}}, nil
}

func (p *ProductPostgres) StoreCreateRequest(ctx context.Context, write CreateRequestWrite) (RequestView, error) {
	_ = ctx
	_ = write
	return RequestView{}, fmt.Errorf("dm_requests removed in squashed schema")
}

func (p *ProductPostgres) LockDecideRequest(ctx context.Context, spec DecideRequestSpec) (DecideRequestState, error) {
	_ = ctx
	if _, err := productID(spec.RequestId); err != nil {
		return DecideRequestState{}, nil
	}
	return DecideRequestState{}, nil
}

func (p *ProductPostgres) StoreDecideRequest(ctx context.Context, write DecideRequestWrite) (RequestView, error) {
	_ = ctx
	_ = write
	return RequestView{}, fmt.Errorf("dm_requests removed in squashed schema")
}

func (p *ProductPostgres) ReadMyUnlocks(ctx context.Context, actor auth.Authority, spec MyUnlocksSpec) (GrantSnapshot, error) {
	id, err := actorID(actor)
	if err != nil {
		return GrantSnapshot{}, err
	}
	catalogRows, err := p.queries().ProductCompleteUnlockCatalog(ctx)
	if err != nil {
		return GrantSnapshot{}, err
	}
	catalog := make([]UnlockableView, 0, len(catalogRows))
	for _, row := range catalogRows {
		kind, err := mapStoredUnlockKind(row.Kind)
		if err != nil {
			return GrantSnapshot{}, err
		}
		var rule *json.RawMessage
		if len(row.UnlockRule) != 0 {
			value := json.RawMessage(append([]byte(nil), row.UnlockRule...))
			rule = &value
		}
		catalog = append(catalog, UnlockableView{Id: db.UUIDString(row.PublicID), Name: row.Name, Description: nullableText(row.Description), Kind: kind, Active: row.Active, Payload: append(json.RawMessage(nil), row.Payload...), UnlockRule: rule})
	}
	grantRows, err := p.queries().ProductMemberGrants(ctx, id)
	if err != nil {
		return GrantSnapshot{}, err
	}
	grants := make([]MemberUnlockView, 0, len(grantRows))
	for _, row := range grantRows {
		var grantedBy *string
		if row.GrantedBy.Valid {
			value := db.UUIDString(row.GrantedBy)
			grantedBy = &value
		}
		grants = append(grants, MemberUnlockView{MemberId: db.UUIDString(row.MemberID), UnlockableId: db.UUIDString(row.UnlockableID), Source: row.Source, UnlockedAt: row.GrantedAt.Time, GrantedBy: grantedBy})
	}
	progress, err := p.queries().ProductMemberDriverProgress(ctx, dbgen.ProductMemberDriverProgressParams{MemberID: id, AsOf: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}})
	if err != nil {
		return GrantSnapshot{}, err
	}
	start, end := pageBounds(len(grants), spec.Offset, spec.Limit)
	return GrantSnapshot{AllGrants: grants, PagedGrants: append([]MemberUnlockView(nil), grants[start:end]...), Catalog: catalog, Total: int32Total(int64(len(grants))), DriverProgress: DriverProgressView{DmSessionsCount: int32(progress.DmSessionsCount), PlayerQuestsCount: int32(progress.PlayerQuestsCount), TenureMonths: progress.TenureMonths}}, nil
}

func pageBounds(length int, offset, limit int32) (int, int) {
	start := int(offset)
	if start < 0 {
		start = 0
	}
	if start > length {
		start = length
	}
	end := start + int(limit)
	if limit < 0 {
		end = start
	}
	if end > length {
		end = length
	}
	return start, end
}

func (p *ProductPostgres) ReadIsFollowing(ctx context.Context, actor auth.Authority, spec IsFollowingSpec) (bool, error) {
	actorPublicID, err := actorID(actor)
	if err != nil {
		return false, err
	}
	targetID, err := productID(spec.MemberId)
	if err != nil {
		return false, nil
	}
	_ = actorPublicID
	_ = targetID
	return false, nil
}

func (p *ProductPostgres) RequestParties(ctx context.Context, id string) (notification.RequestParties, error) {
	_ = ctx
	_ = id
	return notification.RequestParties{}, nil
}

func (p *ProductPostgres) LockFollowPerson(ctx context.Context, actorID string, spec FollowPersonSpec) (FollowPersonState, error) {
	actor, err := productID(actorID)
	if err != nil {
		return FollowPersonState{}, err
	}
	target, err := productID(spec.MemberId)
	if err != nil {
		return FollowPersonState{}, err
	}
	rows, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{actor, target})
	if err != nil {
		return FollowPersonState{}, err
	}
	var targetRow, actorRow *dbgen.ProductLockMembersRow
	for i := range rows {
		if db.UUIDString(rows[i].PublicID) == spec.MemberId {
			targetRow = &rows[i]
		}
		if db.UUIDString(rows[i].PublicID) == actorID {
			actorRow = &rows[i]
		}
	}
	if targetRow == nil || actorRow == nil || targetRow.Status != "active" || actorRow.Status != "active" {
		return FollowPersonState{}, nil
	}
	return FollowPersonState{Exists: true, SubjectID: spec.MemberId, OwnerID: actorID, TargetMemberIDs: []string{actorID, spec.MemberId}}, nil
}

func (p *ProductPostgres) StoreFollowPerson(ctx context.Context, write FollowPersonWrite) (product.CommandReceipt, error) {
	actor, err := productID(write.ActorID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	target, err := productID(write.ValidatedInput.MemberId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	_ = actor
	_ = target
	return product.CommandReceipt{}, fmt.Errorf("member_follows removed in squashed schema")
}

func (p *ProductPostgres) LockUnfollowPerson(ctx context.Context, actorID string, spec UnfollowPersonSpec) (UnfollowPersonState, error) {
	actor, err := productID(actorID)
	if err != nil {
		return UnfollowPersonState{}, err
	}
	target, err := productID(spec.MemberId)
	if err != nil {
		return UnfollowPersonState{}, err
	}
	rows, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{actor, target})
	if err != nil {
		return UnfollowPersonState{}, err
	}
	var targetRow, actorRow *dbgen.ProductLockMembersRow
	for i := range rows {
		if db.UUIDString(rows[i].PublicID) == spec.MemberId {
			targetRow = &rows[i]
		}
		if db.UUIDString(rows[i].PublicID) == actorID {
			actorRow = &rows[i]
		}
	}
	if targetRow == nil || actorRow == nil || targetRow.Status != "active" || actorRow.Status != "active" {
		return UnfollowPersonState{}, nil
	}
	return UnfollowPersonState{Exists: true, SubjectID: spec.MemberId, OwnerID: actorID, TargetMemberIDs: []string{actorID, spec.MemberId}}, nil
}

func (p *ProductPostgres) StoreUnfollowPerson(ctx context.Context, write UnfollowPersonWrite) (product.CommandReceipt, error) {
	actor, err := productID(write.ActorID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	target, err := productID(write.ValidatedInput.MemberId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	_ = actor
	_ = target
	return product.CommandReceipt{}, fmt.Errorf("member_follows removed in squashed schema")
}

func mapProductMember(id pgtype.UUID, discord string, handle, name string, avatar pgtype.Text, roles []string, status string, joined pgtype.Timestamptz) MemberView {
	return MemberView{Id: db.UUIDString(id), DiscordId: nullableText(pgtype.Text{String: discord, Valid: discord != ""}), Handle: handle, DisplayName: name, AvatarUrl: nullableText(avatar), Roles: append([]string(nil), roles...), Status: status, JoinedAt: joined.Time}
}

func mapDirectoryEntry(publicID pgtype.UUID, handle, displayName pgtype.Text, avatar pgtype.Text, roles []string, status pgtype.Text, tagline pgtype.Text, tableInfo []byte, acceptingPlayers pgtype.Bool, dmProfileStatus pgtype.Text, reviewRevision pgtype.Int4, isDM pgtype.Bool, availableDays []int16) DirectoryEntryView {
	entry := DirectoryEntryView{
		MemberId: db.UUIDString(publicID), Handle: db.TextOrEmpty(handle), DisplayName: db.TextOrEmpty(displayName),
		AvatarUrl: nullableText(avatar), Roles: append([]string(nil), roles...), Status: db.TextOrEmpty(status),
		IsDm: isDM.Valid && isDM.Bool,
	}
	if tagline.Valid {
		entry.Tagline = &tagline.String
	}
	if len(tableInfo) > 0 {
		raw := json.RawMessage(append([]byte(nil), tableInfo...))
		entry.TableInfo = &raw
	}
	if acceptingPlayers.Valid {
		entry.AcceptingPlayers = &acceptingPlayers.Bool
	}
	if dmProfileStatus.Valid {
		entry.DmProfileStatus = &dmProfileStatus.String
	}
	if reviewRevision.Valid {
		entry.DmProfileReviewRevision = &reviewRevision.Int32
	}
	if len(availableDays) > 0 {
		entry.AvailableDays = make([]string, 0, len(availableDays))
		for _, day := range availableDays {
			entry.AvailableDays = append(entry.AvailableDays, weekdayName(day))
		}
	}
	return entry
}

func mapDmProfile(memberID string, row dbgen.ProductLockDmProfileRow) DmProfileView {
	return mapDmProfileRow(memberID, row.Tagline, row.Philosophy, row.HouseRules, row.TableInfo, row.AcceptingPlayers, row.Status, row.ReviewRevision)
}

func mapDmProfileRow(memberID string, tagline, philosophy, houseRules pgtype.Text, tableInfo []byte, acceptingPlayers bool, status string, revision int32) DmProfileView {
	view := DmProfileView{MemberId: memberID, AcceptingPlayers: acceptingPlayers, Status: status, ReviewRevision: revision}
	view.Tagline = nullableText(tagline)
	view.Philosophy = nullableText(philosophy)
	view.HouseRules = nullableText(houseRules)
	if len(tableInfo) > 0 {
		raw := json.RawMessage(append([]byte(nil), tableInfo...))
		view.TableInfo = &raw
	}
	return view
}

func (p *ProductPostgres) ReadCommunityDirectory(ctx context.Context, _ auth.Authority, spec CommunityDirectorySpec) (CommunityDirectoryResult, error) {
	arg := dbgen.ProductCommunityDirectoryParams{PageLimit: spec.Limit, PageOffset: spec.Offset}
	if spec.Filters != nil {
		arg.Role = optionalText(spec.Filters.Role)
		arg.Search = optionalText(spec.Filters.Search)
		arg.ProfileStatus = optionalText(spec.Filters.DmProfileStatus)
		if spec.Filters.AcceptingPlayers != nil {
			arg.AcceptingPlayers = pgtype.Bool{Bool: *spec.Filters.AcceptingPlayers, Valid: true}
		}
	}
	rows, err := p.queries().ProductCommunityDirectory(ctx, arg)
	if err != nil {
		return CommunityDirectoryResult{}, err
	}
	out := CommunityDirectoryResult{Entries: []DirectoryEntryView{}}
	if len(rows) == 0 {
		return out, nil
	}
	out.Total = int32Total(rows[0].Total)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		out.Entries = append(out.Entries, mapDirectoryEntry(row.PublicID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.Tagline, row.TableInfo, row.AcceptingPlayers, row.DmProfileStatus, row.ReviewRevision, row.IsDm, row.AvailableDays))
	}
	return out, nil
}

func (p *ProductPostgres) ReadPendingDmProfileVerifications(ctx context.Context, _ auth.Authority, spec PendingDmProfileVerificationsSpec) (CommunityDirectoryResult, error) {
	rows, err := p.queries().ProductPendingDmProfiles(ctx, dbgen.ProductPendingDmProfilesParams{PageLimit: spec.Limit, PageOffset: spec.Offset})
	if err != nil {
		return CommunityDirectoryResult{}, err
	}
	out := CommunityDirectoryResult{Entries: []DirectoryEntryView{}}
	if len(rows) == 0 {
		return out, nil
	}
	out.Total = int32Total(rows[0].Total)
	for _, row := range rows {
		if !row.PublicID.Valid {
			continue
		}
		out.Entries = append(out.Entries, mapDirectoryEntry(row.PublicID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.Tagline, row.TableInfo, row.AcceptingPlayers, row.DmProfileStatus, row.ReviewRevision, row.IsDm, row.AvailableDays))
	}
	return out, nil
}

func (p *ProductPostgres) LockUpdateMyDmProfile(ctx context.Context, actorID string, _ UpdateMyDmProfileSpec) (UpdateMyDmProfileState, error) {
	memberID, err := productID(actorID)
	if err != nil {
		return UpdateMyDmProfileState{}, err
	}
	if _, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{memberID}); err != nil {
		return UpdateMyDmProfileState{}, err
	}
	row, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: memberID})
	if err != nil {
		return UpdateMyDmProfileState{}, err
	}
	before := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	state := UpdateMyDmProfileState{
		Exists: true, SubjectID: actorID, OwnerID: actorID, Before: &before, TargetMemberIDs: []string{actorID},
	}
	profileRow, err := p.queries().ProductLockDmProfile(ctx, memberID)
	if errors.Is(err, pgx.ErrNoRows) {
		return state, nil
	}
	if err != nil {
		return UpdateMyDmProfileState{}, err
	}
	profile := mapDmProfile(actorID, profileRow)
	state.Profile = &profile
	state.ReviewRevision = int64(profile.ReviewRevision)
	state.UpdatedAt = &profileRow.UpdatedAt.Time
	return state, nil
}

func (p *ProductPostgres) StoreUpdateMyDmProfile(ctx context.Context, write UpdateMyDmProfileWrite) (DmProfileView, error) {
	memberID, err := productID(write.ActorID)
	if err != nil {
		return DmProfileView{}, err
	}
	input := write.ValidatedInput.Input
	status := "draft"
	revision := int32(1)
	if write.Locked.Profile != nil {
		status = write.Locked.Profile.Status
		revision = write.Locked.Profile.ReviewRevision
		if write.Locked.Profile.Status == "approved" {
			status = "draft"
			revision++
		}
	}
	var tableInfo []byte
	if input.TableInfo != nil {
		tableInfo = append([]byte(nil), (*input.TableInfo)...)
	} else if write.Locked.Profile != nil {
		tableInfo = dmProfileTableBytes(write.Locked.Profile)
	}
	tagline, philosophy, houseRules := input.Tagline, input.Philosophy, input.HouseRules
	if write.Locked.Profile != nil {
		if tagline == nil {
			tagline = write.Locked.Profile.Tagline
		}
		if philosophy == nil {
			philosophy = write.Locked.Profile.Philosophy
		}
		if houseRules == nil {
			houseRules = write.Locked.Profile.HouseRules
		}
	}
	stored, err := p.queries().ProductStoreDmProfile(ctx, dbgen.ProductStoreDmProfileParams{
		MemberID: memberID, Tagline: optionalText(tagline), Philosophy: optionalText(philosophy), HouseRules: optionalText(houseRules),
		TableInfo: tableInfo, AcceptingPlayers: input.AcceptingPlayers, Status: status, Revision: revision, At: pgtype.Timestamptz{Time: write.At, Valid: true},
	})
	if err != nil {
		return DmProfileView{}, err
	}
	return mapDmProfileRow(write.ActorID, stored.Tagline, stored.Philosophy, stored.HouseRules, stored.TableInfo, stored.AcceptingPlayers, stored.Status, stored.ReviewRevision), nil
}

func (p *ProductPostgres) LockSubmitDmProfileForVerification(ctx context.Context, actorID string, spec SubmitDmProfileForVerificationSpec) (SubmitDmProfileForVerificationState, error) {
	state, profile, err := p.lockDmProfileMutation(ctx, actorID)
	if err != nil {
		return SubmitDmProfileForVerificationState{}, err
	}
	if profile == nil {
		return SubmitDmProfileForVerificationState{}, apierr.New(apierr.NotFound, "dm profile not found")
	}
	if profile.ReviewRevision != spec.ExpectedRevision {
		return SubmitDmProfileForVerificationState{}, apierr.New(apierr.Conflict, "dm profile revision mismatch")
	}
	if profile.Status != "draft" && profile.Status != "rejected" {
		return SubmitDmProfileForVerificationState{}, apierr.New(apierr.Conflict, "dm profile not submittable")
	}
	return SubmitDmProfileForVerificationState{
		Exists: state.Exists, SubjectID: state.SubjectID, OwnerID: state.OwnerID, Before: state.Before,
		TargetMemberIDs: state.TargetMemberIDs, ReviewRevision: int64(profile.ReviewRevision), Profile: *profile,
		UpdatedAt: state.UpdatedAt,
	}, nil
}

func (p *ProductPostgres) StoreSubmitDmProfileForVerification(ctx context.Context, write SubmitDmProfileForVerificationWrite) (DmProfileView, error) {
	memberID, err := productID(write.ActorID)
	if err != nil {
		return DmProfileView{}, err
	}
	profile := write.Locked.Profile
	stored, err := p.queries().ProductStoreDmProfile(ctx, dbgen.ProductStoreDmProfileParams{
		MemberID: memberID, Tagline: optionalText(profile.Tagline), Philosophy: optionalText(profile.Philosophy), HouseRules: optionalText(profile.HouseRules),
		TableInfo: dmProfileTableBytes(&profile), AcceptingPlayers: profile.AcceptingPlayers, Status: "pending", Revision: profile.ReviewRevision,
		At: pgtype.Timestamptz{Time: write.At, Valid: true},
	})
	if err != nil {
		return DmProfileView{}, err
	}
	return mapDmProfileRow(write.ActorID, stored.Tagline, stored.Philosophy, stored.HouseRules, stored.TableInfo, stored.AcceptingPlayers, stored.Status, stored.ReviewRevision), nil
}

func (p *ProductPostgres) LockDecideDmProfileVerification(ctx context.Context, spec DecideDmProfileVerificationSpec) (DecideDmProfileVerificationState, error) {
	memberID, err := productID(spec.MemberId)
	if err != nil {
		return DecideDmProfileVerificationState{}, err
	}
	if _, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{memberID}); err != nil {
		return DecideDmProfileVerificationState{}, err
	}
	row, err := p.queries().ProductMemberIdentity(ctx, dbgen.ProductMemberIdentityParams{MemberID: memberID})
	if err != nil {
		return DecideDmProfileVerificationState{}, err
	}
	before := mapProductMember(row.PublicID, row.DiscordID, row.Handle, row.DisplayName, row.AvatarUrl, row.Roles, row.Status, row.JoinedAt)
	profileRow, err := p.queries().ProductLockDmProfile(ctx, memberID)
	if errors.Is(err, pgx.ErrNoRows) {
		return DecideDmProfileVerificationState{}, apierr.New(apierr.NotFound, "dm profile not found")
	}
	if err != nil {
		return DecideDmProfileVerificationState{}, err
	}
	profile := mapDmProfile(spec.MemberId, profileRow)
	if profile.ReviewRevision != spec.ExpectedRevision {
		return DecideDmProfileVerificationState{}, apierr.New(apierr.Conflict, "dm profile revision mismatch")
	}
	if profile.Status != "pending" {
		return DecideDmProfileVerificationState{}, apierr.New(apierr.Conflict, "dm profile not pending verification")
	}
	return DecideDmProfileVerificationState{
		Exists: true, SubjectID: spec.MemberId, OwnerID: spec.MemberId, Before: &before,
		TargetMemberIDs: []string{spec.MemberId}, ReviewRevision: int64(profile.ReviewRevision), Profile: profile,
		UpdatedAt: &profileRow.UpdatedAt.Time,
	}, nil
}

func (p *ProductPostgres) StoreDecideDmProfileVerification(ctx context.Context, write DecideDmProfileVerificationWrite) (DmProfileView, error) {
	memberID, err := productID(write.ValidatedInput.MemberId)
	if err != nil {
		return DmProfileView{}, err
	}
	actorID, err := productID(write.ActorID)
	if err != nil {
		return DmProfileView{}, err
	}
	status := "rejected"
	if write.ValidatedInput.Verdict == VerificationVerdictApproved {
		status = "approved"
	}
	profile := write.Locked.Profile
	stored, err := p.queries().ProductStoreDmProfile(ctx, dbgen.ProductStoreDmProfileParams{
		MemberID: memberID, Tagline: optionalText(profile.Tagline), Philosophy: optionalText(profile.Philosophy), HouseRules: optionalText(profile.HouseRules),
		TableInfo: dmProfileTableBytes(&profile), AcceptingPlayers: profile.AcceptingPlayers, Status: status, Revision: profile.ReviewRevision,
		At: pgtype.Timestamptz{Time: write.At, Valid: true},
	})
	if err != nil {
		return DmProfileView{}, err
	}
	verificationID := write.DecisionID
	if verificationID == nil {
		return DmProfileView{}, fmt.Errorf("dm profile verification id required")
	}
	id, err := productID(*verificationID)
	if err != nil {
		return DmProfileView{}, err
	}
	if _, err := p.queries().ProductAppendDmVerification(ctx, dbgen.ProductAppendDmVerificationParams{
		VerificationID: id, MemberID: memberID, Verdict: status, ActorID: actorID, Note: optionalText(write.ValidatedInput.Note),
		At: pgtype.Timestamptz{Time: write.At, Valid: true}, PendingRevision: profile.ReviewRevision,
	}); err != nil {
		return DmProfileView{}, err
	}
	return mapDmProfileRow(write.ValidatedInput.MemberId, stored.Tagline, stored.Philosophy, stored.HouseRules, stored.TableInfo, stored.AcceptingPlayers, stored.Status, stored.ReviewRevision), nil
}

func (p *ProductPostgres) lockDmProfileMutation(ctx context.Context, actorID string) (UpdateMyDmProfileState, *DmProfileView, error) {
	state, err := p.LockUpdateMyDmProfile(ctx, actorID, UpdateMyDmProfileSpec{})
	if err != nil {
		return UpdateMyDmProfileState{}, nil, err
	}
	return state, state.Profile, nil
}

func dmProfileTableBytes(profile *DmProfileView) []byte {
	if profile == nil || profile.TableInfo == nil {
		return nil
	}
	return append([]byte(nil), (*profile.TableInfo)...)
}

func minuteTime(value int16) product.Time {
	return product.Time(fmt.Sprintf("%02d:%02d:00", value/60, value%60))
}
func weekdayName(value int16) string {
	return [...]string{"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"}[value%7]
}
