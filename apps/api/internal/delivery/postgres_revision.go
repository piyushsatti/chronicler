package delivery

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type PostgresRevisionApplier struct {
	q *dbgen.Queries
}

func NewPostgresRevisionApplier(pool *pgxpool.Pool) *PostgresRevisionApplier {
	return &PostgresRevisionApplier{q: dbgen.New(pool)}
}

func parseQuestPublicID(questID string) (pgtype.UUID, error) {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("invalid quest public id: %w", err)
	}
	return uid, nil
}

func (p *PostgresRevisionApplier) ApplyDiscordRevision(ctx context.Context, questID string, desired int) error {
	uid, err := parseQuestPublicID(questID)
	if err != nil {
		return err
	}
	return p.q.ApplyQuestDiscordRevision(ctx, dbgen.ApplyQuestDiscordRevisionParams{
		PublicID: uid,
		Desired:  int32(desired),
	})
}

func (p *PostgresRevisionApplier) SetDiscordMessageID(ctx context.Context, questID string, messageID string) error {
	uid, err := parseQuestPublicID(questID)
	if err != nil {
		return err
	}
	return p.q.SetQuestDiscordMessageID(ctx, dbgen.SetQuestDiscordMessageIDParams{
		DiscordMessageID: pgtype.Text{String: messageID, Valid: messageID != ""},
		PublicID:         uid,
	})
}

// PostgresReconciler re-enqueues discord delivery when desired still leads applied
// after a job finishes (bursts that landed while state was running).
type PostgresReconciler struct {
	q        *dbgen.Queries
	enqueuer *jobs.Enqueuer
}

func NewPostgresReconciler(pool *pgxpool.Pool, enqueuer *jobs.Enqueuer) *PostgresReconciler {
	return &PostgresReconciler{q: dbgen.New(pool), enqueuer: enqueuer}
}

func (p *PostgresReconciler) Reconcile(ctx context.Context, questPublicID string) error {
	if p.enqueuer == nil {
		return nil
	}
	uid, err := parseQuestPublicID(questPublicID)
	if err != nil {
		return err
	}
	row, err := p.q.QuestDiscordRevisions(ctx, uid)
	if err != nil {
		return err
	}
	if row.DiscordAppliedRevision >= row.DiscordDesiredRevision {
		return nil
	}
	return p.enqueuer.EnqueueQuestDiscord(ctx, jobs.QuestDiscordPayload{
		ID:              row.ID,
		PublicID:        db.UUIDString(row.PublicID),
		DesiredRevision: int(row.DiscordDesiredRevision),
	})
}

// LoadAnnounceQuest reads the quest, its DM's Discord id and its raw brief.
// The brief is projected for an ordinary member before it is posted.
func (p *PostgresRevisionApplier) LoadAnnounceQuest(ctx context.Context, questID string) (AnnounceQuest, error) {
	uid, err := parseQuestPublicID(questID)
	if err != nil {
		return AnnounceQuest{}, err
	}
	row, err := p.q.QuestDiscordAnnounceSnapshot(ctx, uid)
	if err != nil {
		return AnnounceQuest{}, err
	}
	text := func(v pgtype.Text) string {
		if v.Valid {
			return v.String
		}
		return ""
	}
	quest := AnnounceQuest{
		PublicID:        db.UUIDString(row.PublicID),
		ShortCode:       row.ShortCode,
		Status:          row.Status,
		Title:           row.DocumentTitle,
		ScheduledAt:     row.ScheduledAt.Time,
		DurationHours:   row.DurationHours,
		AppliedRevision: int(row.DiscordAppliedRevision),
		MessageID:       text(row.DiscordMessageID),
		EventID:         text(row.DiscordEventID),
		ThreadID:        text(row.DiscordThreadID),
		VoiceChannelID:  text(row.DiscordVoiceChannelID),
		DMDiscordID:     row.DmDiscordID,
		Brief: document.Document{
			ID:         db.UUIDString(row.DocumentPublicID),
			Kind:       row.DocumentKind,
			Slug:       row.DocumentSlug,
			Title:      row.DocumentTitle,
			Status:     document.Status(row.DocumentStatus),
			Visibility: document.Visibility(row.DocumentVisibility),
			AuthorID:   db.UUIDString(row.DocumentAuthorPublicID),
			Body:       row.DocumentBody,
			Policy:     row.DocumentPolicy,
		},
	}
	if row.DeletedAt.Valid {
		quest.DeletedAt = &row.DeletedAt.Time
	}
	return quest, nil
}

func (p *PostgresRevisionApplier) SetDiscordEvent(ctx context.Context, questID, eventID, eventURL string) error {
	uid, err := parseQuestPublicID(questID)
	if err != nil {
		return err
	}
	return p.q.SetQuestDiscordEvent(ctx, dbgen.SetQuestDiscordEventParams{
		DiscordEventID: pgtype.Text{String: eventID, Valid: eventID != ""},
		EventUrl:       pgtype.Text{String: eventURL, Valid: eventURL != ""},
		PublicID:       uid,
	})
}

func (p *PostgresRevisionApplier) SetDiscordThread(ctx context.Context, questID, threadID string) error {
	uid, err := parseQuestPublicID(questID)
	if err != nil {
		return err
	}
	return p.q.SetQuestDiscordThread(ctx, dbgen.SetQuestDiscordThreadParams{
		DiscordThreadID: pgtype.Text{String: threadID, Valid: threadID != ""},
		PublicID:        uid,
	})
}

// LoadDeliverySettings reads the admin-panel settings; an absent row is unset.
func (p *PostgresRevisionApplier) LoadDeliverySettings(ctx context.Context) (DeliverySettings, error) {
	read := func(key string) ([]byte, error) {
		payload, err := p.q.DeliverySettingPayload(ctx, key)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return payload, err
	}
	var settings DeliverySettings
	payload, err := read(SettingAnnounceChannel)
	if err != nil {
		return settings, err
	}
	settings.AnnounceChannelID = ParseAnnounceChannel(payload)
	if payload, err = read(SettingQuestRole); err != nil {
		return settings, err
	}
	settings.RoleID = ParseQuestRole(payload)
	if payload, err = read(SettingPublicOrigin); err != nil {
		return settings, err
	}
	settings.PublicOrigin = ParsePublicOrigin(payload)
	return settings, nil
}
