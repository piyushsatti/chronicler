package delivery

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

// PlayerListTarget is the quest thread a roster is posted into.
type PlayerListTarget struct {
	Found    bool
	ThreadID string
	Status   string
	Deleted  bool
}

// PlayerListStore reads the quest thread and whether it may still be posted to.
type PlayerListStore interface {
	LoadPlayerList(ctx context.Context, questID string) (PlayerListTarget, error)
}

func parsePlayerListPayload(payload []byte) (jobs.QuestPlayerListPayload, error) {
	if len(payload) == 0 {
		return jobs.QuestPlayerListPayload{}, fmt.Errorf("%w: empty body", ErrBadPayload)
	}
	var body jobs.QuestPlayerListPayload
	if err := json.Unmarshal(payload, &body); err != nil {
		return jobs.QuestPlayerListPayload{}, fmt.Errorf("%w: %v", ErrBadPayload, err)
	}
	if body.PublicID == "" || body.Fingerprint == "" {
		return jobs.QuestPlayerListPayload{}, fmt.Errorf("%w: missing player list identity", ErrBadPayload)
	}
	return body, nil
}

func playerListContent(ids []string) (string, error) {
	if len(ids) == 0 || len(ids) > 100 {
		return "", ErrPlayerListTooLong
	}
	mentions := make([]string, len(ids))
	for i, id := range ids {
		if !ValidSnowflake(id) {
			return "", fmt.Errorf("%w: player mention", ErrBadPayload)
		}
		mentions[i] = "<@" + id + ">"
	}
	content := "Players: " + strings.Join(mentions, " ")
	if discordLen(content) > DiscordMessageLimit {
		return "", ErrPlayerListTooLong
	}
	return content, nil
}

func playerListNonce(jobKey string) string {
	sum := sha256.Sum256([]byte(jobKey))
	return fmt.Sprintf("%x", sum)[:25]
}

// PublishPlayerList posts the seated roster into the quest thread once.
// A retry adopts the newest bot message with this text. Discord omits nonce
// on a fetch; enforce_nonce still covers the short window. A changed roster
// is a new job key. shortcut: one page of 100 messages; a thread past that page can post again.
func (r RESTSync) PublishPlayerList(ctx context.Context, jobKey string, body jobs.QuestPlayerListPayload) (string, error) {
	content, err := playerListContent(body.DiscordIDs)
	if err != nil {
		return "", err
	}
	if r.DryRun {
		return "", nil
	}
	if r.Token == "" || r.Players == nil {
		return "", ErrDiscordNotConfigured
	}
	target, err := r.Players.LoadPlayerList(ctx, body.PublicID)
	if err != nil {
		return "", err
	}
	if !target.Found {
		return "", fmt.Errorf("player list quest missing")
	}
	if target.Deleted || target.Status == "cancelled" {
		return "", nil
	}
	if target.ThreadID == "" {
		return "", ErrPlayerListNoThread
	}
	nonce := playerListNonce(jobKey)
	found, err := r.playerListMessage(ctx, target.ThreadID, content)
	if err != nil {
		return "", err
	}
	if found != "" {
		return found, nil
	}
	raw, err := (&syncRun{RESTSync: r}).call(ctx, http.MethodPost, "/channels/"+target.ThreadID+"/messages", map[string]any{
		"content": content,
		"allowed_mentions": map[string]any{
			"parse": []string{},
			"users": body.DiscordIDs,
		},
		"nonce":         nonce,
		"enforce_nonce": true,
	})
	if err != nil {
		return "", fmt.Errorf("discord create message: %w", err)
	}
	id, err := responseID(raw, "message")
	if err != nil {
		return "", err
	}
	slog.InfoContext(ctx, "player list posted", "quest", body.PublicID, "message", id)
	return id, nil
}

func (r RESTSync) playerListMessage(ctx context.Context, threadID, content string) (string, error) {
	raw, err := (&syncRun{RESTSync: r}).call(ctx, http.MethodGet, "/channels/"+threadID+"/messages?limit=100", nil)
	if errors.Is(err, ErrDiscordForbidden) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("discord list messages: %w", err)
	}
	var messages []struct {
		ID      string `json:"id"`
		Content string `json:"content"`
		Author  struct {
			Bot bool `json:"bot"`
		} `json:"author"`
	}
	if err := json.Unmarshal(raw, &messages); err != nil {
		return "", fmt.Errorf("discord list messages: %w", err)
	}
	// Discord lists newest first and does not return nonce on this fetch.
	for _, message := range messages {
		if message.Author.Bot && message.Content == content && message.ID != "" {
			return message.ID, nil
		}
	}
	return "", nil
}
