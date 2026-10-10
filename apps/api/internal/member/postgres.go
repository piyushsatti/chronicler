package member

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStore struct {
	q *dbgen.Queries
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{q: dbgen.New(pool)}
}

func mapMember(id pgtype.UUID, discordID, handle, displayName string, roles []string, status string) Member {
	return Member{
		ID:          db.UUIDString(id),
		DiscordID:   discordID,
		Handle:      handle,
		DisplayName: displayName,
		Roles:       roles,
		Status:      Status(status),
	}
}

func (s *PostgresStore) GetByID(ctx context.Context, id string) (Member, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return Member{}, ErrNotFound
	}
	row, err := s.q.GetMemberByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Member{}, ErrNotFound
		}
		return Member{}, err
	}
	return mapMember(row.ID, row.DiscordID, row.Handle, row.DisplayName, row.Roles, row.Status), nil
}

func (s *PostgresStore) GetByHandle(ctx context.Context, handle string) (Member, error) {
	row, err := s.q.GetMemberByHandle(ctx, handle)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Member{}, ErrNotFound
		}
		return Member{}, err
	}
	return mapMember(row.ID, row.DiscordID, row.Handle, row.DisplayName, row.Roles, row.Status), nil
}

func (s *PostgresStore) GetByDiscordID(ctx context.Context, discordID string) (Member, error) {
	row, err := s.q.GetMemberByDiscordID(ctx, discordID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Member{}, ErrNotFound
		}
		return Member{}, err
	}
	return mapMember(row.ID, row.DiscordID, row.Handle, row.DisplayName, row.Roles, row.Status), nil
}

func (s *PostgresStore) List(ctx context.Context, f ListFilter) ([]Member, int64, error) {
	status := ""
	if f.Status != nil {
		status = *f.Status
	}
	total, err := s.q.CountMembersFiltered(ctx, status)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.q.ListMembers(ctx, dbgen.ListMembersParams{
		Column1: status,
		Limit:   int32(f.Limit),
		Offset:  int32(f.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]Member, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapMember(row.ID, row.DiscordID, row.Handle, row.DisplayName, row.Roles, row.Status))
	}
	return out, total, nil
}

func (s *PostgresStore) RoleHistory(ctx context.Context, memberID string, limit int) ([]RoleChange, error) {
	uid, err := db.ParseUUID(memberID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.q.ListMemberRoleHistory(ctx, dbgen.ListMemberRoleHistoryParams{
		MemberID: uid,
		RowLimit: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]RoleChange, 0, len(rows))
	for _, row := range rows {
		out = append(out, RoleChange{
			ID:         db.UUIDString(row.ID),
			MemberID:   db.UUIDString(row.MemberID),
			OldRoles:   row.OldRoles,
			NewRoles:   row.NewRoles,
			ChangedBy:  db.UUIDString(row.ChangedBy),
			OccurredAt: row.OccurredAt.Time,
			Note:       db.TextOrEmpty(row.Note),
		})
	}
	return out, nil
}

func (s *PostgresStore) Availability(ctx context.Context, memberID string) ([]AvailabilityWindow, error) {
	uid, err := db.ParseUUID(memberID)
	if err != nil {
		return nil, ErrNotFound
	}
	rows, err := s.q.ListMemberAvailability(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]AvailabilityWindow, 0, len(rows))
	for _, row := range rows {
		out = append(out, AvailabilityWindow{
			Weekday:     int(row.Weekday),
			StartMinute: int(row.StartMinute),
			EndMinute:   int(row.EndMinute),
		})
	}
	return out, nil
}

func (s *PostgresStore) EnsureFromDiscord(ctx context.Context, discordID, displayName, avatarURL string) (string, []auth.Role, []string, []string, error) {
	handle := discordID
	if len(handle) > 32 {
		handle = handle[:32]
	}
	var avatar pgtype.Text
	if avatarURL != "" {
		avatar = pgtype.Text{String: avatarURL, Valid: true}
	}
	row, err := s.q.UpsertMemberFromDiscord(ctx, dbgen.UpsertMemberFromDiscordParams{
		DiscordID:   discordID,
		Handle:      handle,
		DisplayName: displayName,
		AvatarUrl:   avatar,
		Roles:       []string{"player"},
	})
	if err != nil {
		return "", nil, nil, nil, err
	}
	roles := make([]auth.Role, 0, len(row.Roles))
	for _, r := range row.Roles {
		roles = append(roles, auth.Role(r))
	}
	return db.UUIDString(row.ID), roles, nil, nil, nil
}
