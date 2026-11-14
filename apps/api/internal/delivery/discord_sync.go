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
	"math"
	"net/http"
	"strconv"
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
	Players        PlayerListStore
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
	created, msgErr := s.syncMessage(ctx, revision)
	// The thread is opened on the first post only, never again. It is best
	// effort: a missing thread permission must not hold back the event or
	// leave the delivery failing, so the error is logged and the sync goes on.
	if firstPost && q.ThreadID == "" && !s.terminal() && q.MessageID != "" {
		if id, err := s.startThread(ctx); err != nil {
			slog.WarnContext(ctx, "discord thread not opened", "quest", s.questID, "message", q.MessageID, "error", err)
		} else {
			q.ThreadID = id
		}
	}
	if err := ctx.Err(); err != nil {
		return errors.Join(msgErr, err)
	}
	eventChanged, eventErr := s.syncEvent(ctx)
	var editErr error
	if (created || eventChanged) && q.EventID != "" && q.MessageID != "" {
		// The first post goes out before the event exists; replace Pending.
		editErr = s.editMessage(ctx)
	}
	return errors.Join(msgErr, eventErr, editErr)
}

func (s *syncRun) syncMessage(ctx context.Context, revision int) (bool, error) {
	q := &s.quest
	if q.MessageID == "" && !s.terminal() {
		id, err := s.postMessage(ctx)
		if err != nil {
			return false, err
		}
		q.MessageID = id
		slog.InfoContext(ctx, "discord message created", "quest", s.questID, "revision", revision, "message", id)
		return true, nil
	}
	if q.MessageID != "" {
		if err := s.editMessage(ctx); err != nil {
			return false, err
		}
	}
	return false, nil
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
		AvgPartyLevel:  q.AvgPartyLevel,
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

// syncEvent reconciles stored state first; only future quests create events.
func (s *syncRun) syncEvent(ctx context.Context) (bool, error) {
	q := &s.quest
	if q.EventID != "" {
		update, err := s.reconcileStoredEvent(ctx)
		if err != nil || !update {
			return false, err
		}
	}
	if s.terminal() || !q.ScheduledAt.After(s.now()) {
		return false, nil
	}
	name := q.Title
	if utf8.RuneCountInString(name) > 100 {
		name = string([]rune(name)[:99]) + "…"
	}
	body := s.eventBody(name)
	if q.EventID != "" {
		if _, err := s.call(ctx, http.MethodPatch, fmt.Sprintf("/guilds/%s/scheduled-events/%s", s.GuildID, q.EventID), body); err != nil {
			return false, fmt.Errorf("discord patch event: %w", err)
		}
		return false, nil
	}
	// No announcement yet: only cancel/update an existing event; never create
	// one whose description would link to a missing message.
	if q.MessageID == "" {
		return false, nil
	}
	return s.createOrAdoptEvent(ctx, name, body)
}

func (s *syncRun) eventBody(name string) map[string]any {
	q := s.quest
	body := map[string]any{
		"name":                 name,
		"privacy_level":        2, // GUILD_ONLY
		"scheduled_start_time": q.ScheduledAt.UTC().Format(time.RFC3339),
		"scheduled_end_time":   q.ScheduledAt.Add(time.Duration(q.DurationHours * float64(time.Hour))).UTC().Format(time.RFC3339),
		"entity_type":          2, // VOICE
		"channel_id":           q.VoiceChannelID,
		"entity_metadata":      nil,
		"description":          fmt.Sprintf("Announcement: %s\nQuest page: %s", s.messageLink(), s.questURL()),
	}
	if q.VoiceChannelID == "" {
		location := []rune(s.questURL())
		if len(location) > 100 {
			location = location[:100]
		}
		body["entity_type"], body["channel_id"] = 3, nil // EXTERNAL
		body["entity_metadata"] = map[string]any{"location": string(location)}
	}
	return body
}

func (s *syncRun) createOrAdoptEvent(ctx context.Context, name string, body map[string]any) (bool, error) {
	if id, err := s.findBotEvent(ctx, name, s.quest.ScheduledAt); err != nil {
		return false, err
	} else if id != "" {
		return s.persistEventID(ctx, id)
	}
	raw, err := s.call(ctx, http.MethodPost, fmt.Sprintf("/guilds/%s/scheduled-events", s.GuildID), body)
	if err != nil {
		return false, fmt.Errorf("discord create event: %w", err)
	}
	id, err := responseID(raw, "event")
	if err != nil {
		return false, err
	}
	return s.persistEventID(ctx, id)
}

func (s *syncRun) persistEventID(ctx context.Context, id string) (bool, error) {
	s.quest.EventID = id
	persist, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.Quests.SetDiscordEvent(persist, s.questID, id, s.eventURL()); err != nil {
		return false, fmt.Errorf("discord event id persist: %w", err)
	}
	return true, ctx.Err()
}

// botUserIDs caches GET /users/@me by bot token for the process lifetime
// (one lookup per worker token).
var botUserIDs sync.Map

// ClearBotUserIDCache clears the bot user cache. Tests only.
func ClearBotUserIDCache() {
	botUserIDs.Range(func(key, _ any) bool {
		botUserIDs.Delete(key)
		return true
	})
}

func (s *syncRun) botUserID(ctx context.Context) (string, error) {
	if id, ok := botUserIDs.Load(s.Token); ok {
		return id.(string), nil
	}
	raw, err := s.call(ctx, http.MethodGet, "/users/@me", nil)
	if err != nil {
		return "", fmt.Errorf("discord bot user: %w", err)
	}
	id, err := responseID(raw, "user")
	if err != nil {
		return "", err
	}
	if actual, loaded := botUserIDs.LoadOrStore(s.Token, id); loaded {
		return actual.(string), nil
	}
	return id, nil
}

func (s *syncRun) findBotEvent(ctx context.Context, name string, start time.Time) (string, error) {
	botID, err := s.botUserID(ctx)
	if err != nil {
		return "", err
	}
	raw, err := s.call(ctx, http.MethodGet, fmt.Sprintf("/guilds/%s/scheduled-events", s.GuildID), nil)
	if err != nil {
		return "", fmt.Errorf("discord list events: %w", err)
	}
	var events []struct {
		ID                 string `json:"id"`
		Name               string `json:"name"`
		CreatorID          string `json:"creator_id"`
		ScheduledStartTime string `json:"scheduled_start_time"`
	}
	if err := json.Unmarshal(raw, &events); err != nil {
		return "", fmt.Errorf("discord list events: %w", err)
	}
	wantStart := start.UTC()
	for _, event := range events {
		if event.CreatorID != botID || event.Name != name {
			continue
		}
		got, err := time.Parse(time.RFC3339, event.ScheduledStartTime)
		if err != nil {
			continue
		}
		if got.UTC().Equal(wantStart) {
			return event.ID, nil
		}
	}
	return "", nil
}

func (s *syncRun) reconcileStoredEvent(ctx context.Context) (bool, error) {
	path := fmt.Sprintf("/guilds/%s/scheduled-events/%s", s.GuildID, s.quest.EventID)
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
	if !s.terminal() {
		return true, nil
	}
	status := 4 // SCHEDULED -> CANCELED; ACTIVE -> COMPLETED.
	if event.Status == 2 {
		status = 3
	}
	if _, err := s.call(ctx, http.MethodPatch, path, map[string]any{"status": status}); err != nil {
		return false, fmt.Errorf("discord patch event: %w", err)
	}
	return false, nil
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
	// Discord's edge rejects a GET that carries a body (even "null") with an HTML 400 or 502.
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(encoded)
	}
	client := s.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	base := s.APIBase
	if base == "" {
		base = "https://discord.com/api/v10"
	}
	request, err := http.NewRequestWithContext(ctx, method, base+path, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bot "+s.Token)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 300 {
		return nil, discordAPIStatusError(response.StatusCode, response.Header, raw)
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

func discordAPIStatusError(status int, header http.Header, raw []byte) error {
	snippet := strings.TrimSpace(string(raw))
	if len(snippet) > 200 {
		snippet = snippet[:200]
	}
	err := &DiscordAPIError{Status: status, Snippet: snippet}
	if status == http.StatusTooManyRequests {
		err.RetryAfter = parseDiscordRetryAfter(header, raw)
	}
	return err
}

func parseDiscordRetryAfter(header http.Header, raw []byte) time.Duration {
	if secs, ok := positiveRetrySeconds(strings.TrimSpace(header.Get("Retry-After"))); ok {
		return retryAfterDuration(secs)
	}
	var body struct {
		RetryAfter float64 `json:"retry_after"`
	}
	if json.Unmarshal(raw, &body) != nil || !finitePositive(body.RetryAfter) {
		return 0
	}
	return retryAfterDuration(body.RetryAfter)
}

func positiveRetrySeconds(raw string) (float64, bool) {
	secs, err := strconv.ParseFloat(raw, 64)
	if err != nil || !finitePositive(secs) {
		return 0, false
	}
	return secs, true
}

func finitePositive(secs float64) bool {
	return secs > 0 && !math.IsInf(secs, 0) && !math.IsNaN(secs)
}

func retryAfterDuration(secs float64) time.Duration {
	if secs > 300 {
		secs = 300
	}
	return time.Duration(math.Ceil(secs * float64(time.Second)))
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
