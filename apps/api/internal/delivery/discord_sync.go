package delivery

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ErrDiscordNotConfigured is returned when Discord credentials are missing
// and dry-run is not enabled. The worker must not advance applied revision.
var ErrDiscordNotConfigured = fmt.Errorf("discord delivery not configured")

// RevisionApplier marks discord_applied_revision after a successful sync.
// desired is the revision the worker was given, not a reread of the row.
type RevisionApplier interface {
	ApplyDiscordRevision(ctx context.Context, questID string, desired int) error
}

// QuestStore reads the quest to announce and records the Discord ids that
// delivery creates, each as soon as it exists so a retry resumes where it left
// off instead of posting twice.
type QuestStore interface {
	LoadAnnounceQuest(ctx context.Context, questID string) (AnnounceQuest, error)
	SetDiscordMessageID(ctx context.Context, questID string, messageID string) error
	SetDiscordEvent(ctx context.Context, questID, eventID, eventURL string) error
	SetDiscordThread(ctx context.Context, questID, threadID string) error
}

// DeliverySettings are the admin-panel values (site_settings) the worker reads
// on every sync, so a change applies without a restart.
type DeliverySettings struct {
	AnnounceChannelID string
	RoleID            string
	PublicOrigin      string
}

type SettingsReader interface {
	LoadDeliverySettings(ctx context.Context) (DeliverySettings, error)
}

// RESTSync posts or edits the quest announcement, its scheduled event and its
// thread. Discord REST shapes:
//
//	create message         https://docs.discord.com/developers/resources/message#create-message
//	scheduled event        https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event
//	thread from message    https://docs.discord.com/developers/resources/channel#start-thread-from-message
type RESTSync struct {
	// Token and GuildID are deploy secrets (DISCORD_BOT_TOKEN, GUILD_ID).
	Token   string
	GuildID string
	// FallbackChannelID (DISCORD_ANNOUNCE_CHANNEL_ID) applies only while the
	// admin panel's announce channel is empty.
	FallbackChannelID string
	// FallbackOrigin is the site origin used while no public_origin setting exists.
	FallbackOrigin string
	Settings       SettingsReader
	Quests         QuestStore
	HTTP           *http.Client
	Apply          RevisionApplier
	// DryRun applies the revision without calling Discord. Opt-in only;
	// takes precedence over configured credentials (local/dev workers).
	DryRun bool
	// APIBase overrides the Discord API host (tests). Empty = production.
	APIBase string
	// Now overrides the clock (tests).
	Now func() time.Time
}

func (r RESTSync) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now()
}

func (r RESTSync) SyncQuest(ctx context.Context, questID string, desiredRevision int) error {
	if err := r.syncDryRun(ctx, questID, desiredRevision); err != nil || r.DryRun {
		return err
	}
	if r.Token == "" || r.GuildID == "" || r.Quests == nil {
		return ErrDiscordNotConfigured
	}
	settings := DeliverySettings{}
	if r.Settings != nil {
		var err error
		if settings, err = r.Settings.LoadDeliverySettings(ctx); err != nil {
			return fmt.Errorf("discord settings: %w", err)
		}
	}
	channelID := settings.AnnounceChannelID
	if channelID == "" {
		channelID = r.FallbackChannelID
	}
	origin := settings.PublicOrigin
	if origin == "" {
		origin = strings.TrimRight(r.FallbackOrigin, "/")
	}
	if channelID == "" {
		return fmt.Errorf("%w: announce channel", ErrDiscordNotConfigured)
	}
	if origin == "" {
		return fmt.Errorf("%w: public site origin", ErrDiscordNotConfigured)
	}
	quest, err := r.Quests.LoadAnnounceQuest(ctx, questID)
	if err != nil {
		return fmt.Errorf("discord quest lookup: %w", err)
	}
	run := syncRun{RESTSync: r, questID: questID, channelID: channelID, origin: origin, roleID: settings.RoleID, quest: quest}
	if err := run.execute(ctx, desiredRevision); err != nil {
		return err
	}
	if r.Apply != nil {
		return r.Apply.ApplyDiscordRevision(ctx, questID, desiredRevision)
	}
	return nil
}

type syncRun struct {
	RESTSync
	questID   string
	channelID string
	origin    string
	roleID    string
	quest     AnnounceQuest
}

func (s *syncRun) execute(ctx context.Context, revision int) error {
	q := &s.quest
	firstPost := q.AppliedRevision == 0 && q.ThreadID == ""
	created := false
	if q.MessageID == "" && !s.terminal() {
		id, err := s.postMessage(ctx)
		if err != nil {
			return err
		}
		q.MessageID, created = id, true
		slog.InfoContext(ctx, "discord message created", "quest", s.questID, "revision", revision, "message", id)
	} else if q.MessageID != "" {
		if err := s.editMessage(ctx); err != nil {
			return err
		}
	}
	// The thread is opened on the first post only, never again. It is best
	// effort: a missing thread permission must not hold back the event or
	// leave the delivery failing, so the error is logged and the sync goes on.
	if firstPost && q.ThreadID == "" && !s.terminal() {
		if id, err := s.startThread(ctx); err != nil {
			slog.WarnContext(ctx, "discord thread not opened", "quest", s.questID, "message", q.MessageID, "error", err)
		} else {
			q.ThreadID = id
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	eventChanged, err := s.syncEvent(ctx)
	if err != nil {
		return err
	}
	if created || eventChanged {
		// The first post goes out before the event exists; add the Event line.
		if q.EventID != "" {
			return s.editMessage(ctx)
		}
	}
	return nil
}

func (s *syncRun) terminal() bool {
	return s.quest.Status == "cancelled" || s.quest.DeletedAt != nil
}

func (s *syncRun) eventURL() string {
	if s.quest.EventID == "" {
		return ""
	}
	return fmt.Sprintf("https://discord.com/events/%s/%s", s.GuildID, s.quest.EventID)
}

func (s *syncRun) questURL() string {
	return s.origin + "/quests/" + s.quest.ShortCode
}

func (s *syncRun) messageLink() string {
	return fmt.Sprintf("https://discord.com/channels/%s/%s/%s", s.GuildID, s.channelID, s.quest.MessageID)
}

func (s *syncRun) messageBody() (map[string]any, error) {
	q := s.quest
	status := q.Status
	if q.DeletedAt != nil {
		status = "deleted"
	}
	content, cut, err := BuildAnnouncement(AnnouncementInput{
		RoleID: s.roleID, Title: q.Title, Status: status, ShortCode: q.ShortCode, Body: MemberBriefBody(q.Brief),
		ScheduledAt: q.ScheduledAt, DurationHours: q.DurationHours, DMDiscordID: q.DMDiscordID,
		VoiceChannelID: q.VoiceChannelID, EventURL: s.eventURL(), SignupURL: s.questURL(),
	})
	if err != nil {
		return nil, err
	}
	if cut {
		slog.Info("discord announcement body shortened to the message limit", "quest", s.questID)
	}
	// Only the quest role may ping; mentions written in a brief never do.
	mentions := map[string]any{"parse": []string{}}
	if s.roleID != "" {
		mentions = map[string]any{"roles": []string{s.roleID}}
	}
	return map[string]any{"content": content, "allowed_mentions": mentions}, nil
}

func (s *syncRun) postMessage(ctx context.Context) (string, error) {
	body, err := s.messageBody()
	if err != nil {
		return "", err
	}
	nonce := sha256.Sum256([]byte(s.questID))
	body["nonce"], body["enforce_nonce"] = fmt.Sprintf("%x", nonce)[:25], true
	raw, err := s.call(ctx, http.MethodPost, fmt.Sprintf("/channels/%s/messages", s.channelID), body)
	if err != nil {
		return "", fmt.Errorf("discord create message: %w", err)
	}
	id, err := responseID(raw, "message")
	if err != nil {
		return "", err
	}
	persist, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.Quests.SetDiscordMessageID(persist, s.questID, id); err != nil {
		return "", fmt.Errorf("discord message id persist: %w", err)
	}
	return id, ctx.Err()
}

func (s *syncRun) editMessage(ctx context.Context) error {
	body, err := s.messageBody()
	if err != nil {
		return err
	}
	if _, err := s.call(ctx, http.MethodPatch, fmt.Sprintf("/channels/%s/messages/%s", s.channelID, s.quest.MessageID), body); err != nil {
		return fmt.Errorf("discord patch message: %w", err)
	}
	slog.InfoContext(ctx, "discord message updated", "quest", s.questID, "message", s.quest.MessageID)
	return nil
}

func (s *syncRun) startThread(ctx context.Context) (string, error) {
	raw, err := s.call(ctx, http.MethodPost,
		fmt.Sprintf("/channels/%s/messages/%s/threads", s.channelID, s.quest.MessageID),
		map[string]any{"name": s.quest.ShortCode})
	if err != nil {
		return "", fmt.Errorf("discord start thread: %w", err)
	}
	id, err := responseID(raw, "thread")
	if err != nil {
		return "", err
	}
	persist, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.Quests.SetDiscordThread(persist, s.questID, id); err != nil {
		return "", fmt.Errorf("discord thread id persist: %w", err)
	}
	return id, ctx.Err()
}

// syncEvent reconciles stored state first; only future voice quests create events.
func (s *syncRun) syncEvent(ctx context.Context) (bool, error) {
	q := &s.quest
	if q.EventID != "" {
		path := fmt.Sprintf("/guilds/%s/scheduled-events/%s", s.GuildID, q.EventID)
		raw, err := s.call(ctx, http.MethodGet, path, nil)
		if err != nil {
			var remote *DiscordAPIError
			if errors.As(err, &remote) && remote.Status == http.StatusNotFound {
				return false, fmt.Errorf("%w: stored event missing", ErrDiscordEventState)
			}
			return false, fmt.Errorf("discord get event: %w", err)
		}
		var event struct {
			Status int `json:"status"`
		}
		if err := json.Unmarshal(raw, &event); err != nil || event.Status < 1 || event.Status > 4 {
			return false, fmt.Errorf("%w: missing or unsupported status", ErrDiscordEventState)
		}
		if event.Status == 3 || event.Status == 4 {
			return false, nil
		}
		if s.terminal() {
			status := 4 // SCHEDULED -> CANCELED; ACTIVE -> COMPLETED.
			if event.Status == 2 {
				status = 3
			}
			if _, err := s.call(ctx, http.MethodPatch, path, map[string]any{"status": status}); err != nil {
				return false, fmt.Errorf("discord patch event: %w", err)
			}
			return false, nil
		}
	}
	if s.terminal() {
		return false, nil
	}
	if q.VoiceChannelID == "" || !q.ScheduledAt.After(s.now()) {
		return false, nil
	}
	name := q.Title
	if utf8.RuneCountInString(name) > 100 {
		name = string([]rune(name)[:99]) + "…"
	}
	body := map[string]any{
		"name":                 name,
		"privacy_level":        2, // GUILD_ONLY
		"scheduled_start_time": q.ScheduledAt.UTC().Format(time.RFC3339),
		"scheduled_end_time":   q.ScheduledAt.Add(time.Duration(q.DurationHours * float64(time.Hour))).UTC().Format(time.RFC3339),
		"entity_type":          2, // VOICE
		"channel_id":           q.VoiceChannelID,
		"description":          fmt.Sprintf("Announcement: %s\nQuest page: %s", s.messageLink(), s.questURL()),
	}
	if q.EventID != "" {
		if _, err := s.call(ctx, http.MethodPatch, fmt.Sprintf("/guilds/%s/scheduled-events/%s", s.GuildID, q.EventID), body); err != nil {
			return false, fmt.Errorf("discord patch event: %w", err)
		}
		return false, nil
	}
	raw, err := s.call(ctx, http.MethodPost, fmt.Sprintf("/guilds/%s/scheduled-events", s.GuildID), body)
	if err != nil {
		return false, fmt.Errorf("discord create event: %w", err)
	}
	id, err := responseID(raw, "event")
	if err != nil {
		return false, err
	}
	q.EventID = id
	persist, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.Quests.SetDiscordEvent(persist, s.questID, id, s.eventURL()); err != nil {
		return false, fmt.Errorf("discord event id persist: %w", err)
	}
	return true, ctx.Err()
}

func responseID(raw []byte, what string) (string, error) {
	var response struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &response); err != nil || response.ID == "" {
		return "", fmt.Errorf("discord api missing %s id", what)
	}
	return response.ID, nil
}

func (s *syncRun) call(ctx context.Context, method, path string, payload any) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	client := s.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	base := s.APIBase
	if base == "" {
		base = "https://discord.com/api/v10"
	}
	request, err := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bot "+s.Token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 300 {
		return nil, discordAPIStatusError(response.StatusCode, raw)
	}
	return raw, nil
}

func (r RESTSync) syncDryRun(ctx context.Context, questID string, revision int) error {
	if !r.DryRun {
		return nil
	}
	slog.InfoContext(ctx, "discord delivery dry-run", "quest", questID, "revision", revision)
	if r.Apply != nil {
		return r.Apply.ApplyDiscordRevision(ctx, questID, revision)
	}
	return nil
}

func discordAPIStatusError(status int, raw []byte) error {
	snippet := strings.TrimSpace(string(raw))
	if len(snippet) > 200 {
		snippet = snippet[:200]
	}
	return &DiscordAPIError{Status: status, Snippet: snippet}
}

// RecordingSync is a test fake that records sync calls.
type RecordingSync struct {
	mu    sync.Mutex
	Calls []string
	Apply RevisionApplier
}

func (r *RecordingSync) SyncQuest(ctx context.Context, questID string, desiredRevision int) error {
	r.mu.Lock()
	r.Calls = append(r.Calls, questID)
	r.mu.Unlock()
	if r.Apply != nil {
		return r.Apply.ApplyDiscordRevision(ctx, questID, desiredRevision)
	}
	return nil
}
