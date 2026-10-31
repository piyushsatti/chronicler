package member

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"reflect"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type PostgresStore struct {
	q                 *dbgen.Queries
	configuredOwnerID string
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	store, err := NewFromDBTX(pool, "")
	if err != nil {
		panic(err)
	}
	return store
}

func NewFromDBTX(executor dbgen.DBTX, configuredOwnerID string) (*PostgresStore, error) {
	if executor == nil || (reflect.ValueOf(executor).Kind() == reflect.Pointer && reflect.ValueOf(executor).IsNil()) {
		return nil, fmt.Errorf("member database executor required")
	}
	if configuredOwnerID != "" {
		parsed, err := uuid.Parse(configuredOwnerID)
		if err != nil || parsed.String() != configuredOwnerID {
			return nil, fmt.Errorf("invalid configured owner identity")
		}
	}
	return &PostgresStore{q: dbgen.New(executor), configuredOwnerID: configuredOwnerID}, nil
}

// ConfiguredOwnerID returns the immutable platform-owner identity wired at construction.
func (s *PostgresStore) ConfiguredOwnerID() string {
	return s.configuredOwnerID
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

// ResolveAuthority reads current member and DM-profile state in one statement.
// It deliberately accepts no token roles and caches nothing across requests.
func (s *PostgresStore) ResolveAuthority(ctx context.Context, id string) (auth.Authority, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return auth.NewAuthority("", nil, "", "")
	}
	row, err := s.q.GetMemberAuthority(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.NewAuthority("", nil, "", "")
		}
		return auth.Authority{}, err
	}
	roles := make([]auth.Role, len(row.Roles))
	for i, role := range row.Roles {
		roles[i] = auth.Role(role)
	}
	return auth.NewAuthorityWithOwner(db.UUIDString(row.ID), roles, row.Status, row.DmStatus, row.Handle, s.configuredOwnerID)
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
	if _, err := db.ParseUUID(memberID); err != nil {
		return nil, ErrNotFound
	}
	_ = limit
	return nil, nil
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
		Roles:       []string{"guest"},
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
