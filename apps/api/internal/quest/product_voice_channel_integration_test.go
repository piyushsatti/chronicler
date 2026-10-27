//go:build integration

package quest

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	voiceListed   = "444444444444444444"
	voiceUnlisted = "555555555555555555"
)

func setVoiceList(t *testing.T, f questCloseFixture, ids ...string) {
	t.Helper()
	list := `{"channels":[`
	for i, id := range ids {
		if i > 0 {
			list += ","
		}
		list += `{"name":"Table ` + id[:2] + `","channelId":"` + id + `"}`
	}
	list += `]}`
	if _, err := f.fixture.Pool.Exec(context.Background(), `INSERT INTO site_settings (key, payload) VALUES ('discord_voice_channels', $1::jsonb)
		ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload`, list); err != nil {
		t.Fatal(err)
	}
}

func isInvalid(err error) bool {
	e, ok := errors.AsType[*apierr.Error](err)
	return ok && e.Code == apierr.Invalid
}

// The DM picks a voice channel from the admin list on create and edit; the pick
// is stored, read back, and checked against the list on the server.
func TestQuestVoiceChannelPickedFromAdminList(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	setVoiceList(t, f, voiceListed)
	reader, _ := NewProductPostgres(f.fixture.Pool)

	spec := editorQuestInput()
	unlisted := voiceUnlisted
	spec.Input.VoiceChannelId = &unlisted
	if _, err := f.commands.CreateQuest(ctx, f.actor, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()}); !isInvalid(err) {
		t.Fatalf("a channel outside the admin list must be refused on create, got %v", err)
	}
	junk := "not-a-snowflake"
	spec.Input.VoiceChannelId = &junk
	if _, err := f.commands.CreateQuest(ctx, f.actor, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()}); !isInvalid(err) {
		t.Fatalf("a malformed id must be refused on create, got %v", err)
	}

	listed := voiceListed
	spec.Input.VoiceChannelId = &listed
	created, err := f.commands.CreateQuest(ctx, f.actor, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if created.VoiceChannelId == nil || *created.VoiceChannelId != voiceListed {
		t.Fatalf("created voice=%v", created.VoiceChannelId)
	}
	read, err := reader.ReadQuest(ctx, f.actor, QuestSpec{Id: &created.Id})
	if err != nil || read.VoiceChannelId == nil || *read.VoiceChannelId != voiceListed {
		t.Fatalf("read voice=%+v err=%v", read, err)
	}

	// Editing something else keeps the channel, even after an admin removes it from the list.
	setVoiceList(t, f)
	title := "Renamed"
	edited, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{
		ExpectedUpdatedAt: read.UpdatedAt, Title: product.Optional[string]{Set: true, Value: &title},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || edited.VoiceChannelId == nil || *edited.VoiceChannelId != voiceListed {
		t.Fatalf("edit kept voice=%v err=%v", edited.VoiceChannelId, err)
	}

	// Switching to a channel that is not listed is refused; clearing is allowed.
	other := voiceUnlisted
	if _, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{
		ExpectedUpdatedAt: edited.UpdatedAt, VoiceChannelId: product.Optional[string]{Set: true, Value: &other},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); !isInvalid(err) {
		t.Fatalf("unlisted channel on edit must be refused, got %v", err)
	}
	cleared, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{
		ExpectedUpdatedAt: edited.UpdatedAt, VoiceChannelId: product.Optional[string]{Set: true},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || cleared.VoiceChannelId != nil {
		t.Fatalf("cleared voice=%v err=%v", cleared.VoiceChannelId, err)
	}
	setVoiceList(t, f, voiceUnlisted)
	repick, err := f.commands.UpdateQuest(ctx, f.actor, UpdateQuestSpec{Id: created.Id, Input: QuestEditFields{
		ExpectedUpdatedAt: cleared.UpdatedAt, VoiceChannelId: product.Optional[string]{Set: true, Value: &other},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || repick.VoiceChannelId == nil || *repick.VoiceChannelId != voiceUnlisted {
		t.Fatalf("repick voice=%v err=%v", repick.VoiceChannelId, err)
	}
}

// Quests without a voice channel stay valid; the column check rejects non-snowflakes.
func TestQuestVoiceChannelColumnRejectsNonSnowflakes(t *testing.T) {
	f := newQuestCloseFixture(t)
	created, err := f.commands.CreateQuest(context.Background(), f.actor, editorQuestInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || created.VoiceChannelId != nil {
		t.Fatalf("created=%+v err=%v", created, err)
	}
	if _, err := f.fixture.Pool.Exec(context.Background(), `UPDATE quests SET discord_voice_channel_id='12345' WHERE public_id=$1`, created.Id); err == nil {
		t.Fatal("database accepted a short voice channel id")
	}
}
