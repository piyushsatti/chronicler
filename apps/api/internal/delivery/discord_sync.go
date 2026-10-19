package delivery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
)

// ErrDiscordNotConfigured is returned when Discord credentials are missing
// and dry-run is not enabled. The worker must not advance applied revision.
var ErrDiscordNotConfigured = fmt.Errorf("discord delivery not configured")

// RevisionApplier marks discord_applied_revision after a successful sync.
// desired is the revision the worker was given, not a reread of the row.
type RevisionApplier interface {
	ApplyDiscordRevision(ctx context.Context, questID string, desired int) error
}

// MessageStore loads and persists quests.discord_message_id for idempotent posts.
type MessageStore interface {
	GetDiscordMessageID(ctx context.Context, questID string) (string, error)
	SetDiscordMessageID(ctx context.Context, questID string, messageID string) error
}

// RESTSync posts or patches a minimal quest summary to Discord when configured.
type RESTSync struct {
	Token     string
	ChannelID string
	HTTP      *http.Client
	Apply     RevisionApplier
	Messages  MessageStore
	// DryRun applies the revision without calling Discord. Opt-in only;
	// takes precedence over configured credentials (local/dev workers).
	DryRun bool
	// APIBase overrides the Discord API host (tests). Empty = production.
	APIBase string
}

func (r RESTSync) SyncQuest(ctx context.Context, questID string, desiredRevision int) error {
	if r.DryRun {
		slog.InfoContext(ctx, "discord delivery dry-run", "quest", questID, "revision", desiredRevision)
		if r.Apply != nil {
			return r.Apply.ApplyDiscordRevision(ctx, questID, desiredRevision)
		}
		return nil
	}
	if r.Token == "" || r.ChannelID == "" {
		return ErrDiscordNotConfigured
	}

	body, err := json.Marshal(map[string]any{
		"content": fmt.Sprintf("Quest `%s` delivery revision %d", questID, desiredRevision),
	})
	if err != nil {
		return err
	}

	messageID := ""
	if r.Messages != nil {
		messageID, err = r.Messages.GetDiscordMessageID(ctx, questID)
		if err != nil {
			return fmt.Errorf("discord message id lookup: %w", err)
		}
	}

	client := r.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	base := r.APIBase
	if base == "" {
		base = "https://discord.com/api/v10"
	}

	var res *http.Response
	if messageID != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodPatch,
			fmt.Sprintf("%s/channels/%s/messages/%s", base, r.ChannelID, messageID),
			bytes.NewReader(body))
		if err != nil {
			return err
		}
		r.setHeaders(req)
		res, err = client.Do(req)
		if err != nil {
			return fmt.Errorf("discord patch message: %w", err)
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			fmt.Sprintf("%s/channels/%s/messages", base, r.ChannelID),
			bytes.NewReader(body))
		if err != nil {
			return err
		}
		r.setHeaders(req)
		res, err = client.Do(req)
		if err != nil {
			return fmt.Errorf("discord create message: %w", err)
		}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return discordAPIStatusError(res.StatusCode, raw)
	}

	if messageID == "" {
		var resp struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &resp); err != nil || resp.ID == "" {
			return fmt.Errorf("discord api missing message id")
		}
		if r.Messages != nil {
			if err := r.Messages.SetDiscordMessageID(ctx, questID, resp.ID); err != nil {
				return fmt.Errorf("discord message id persist: %w", err)
			}
		}
		slog.InfoContext(ctx, "discord message created", "quest", questID, "revision", desiredRevision, "message", resp.ID)
	} else {
		slog.InfoContext(ctx, "discord message updated", "quest", questID, "revision", desiredRevision, "message", messageID)
	}

	if r.Apply != nil {
		return r.Apply.ApplyDiscordRevision(ctx, questID, desiredRevision)
	}
	return nil
}

func discordAPIStatusError(status int, raw []byte) error {
	snippet := strings.TrimSpace(string(raw))
	if len(snippet) > 200 {
		snippet = snippet[:200]
	}
	if snippet == "" {
		return fmt.Errorf("discord api status %d", status)
	}
	return fmt.Errorf("discord api status %d: %s", status, snippet)
}

func (r RESTSync) setHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bot "+r.Token)
	req.Header.Set("Content-Type", "application/json")
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
