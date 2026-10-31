//go:build integration

package site

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	dsGuildChannel = "222222222222222222"
	dsRole         = "333333333333333333"
	dsVoiceA       = "444444444444444444"
	dsVoiceB       = "555555555555555555"
)

type discordFixture struct {
	commands *ProductCommands
	queries  *ProductQueries
	admin    auth.Authority
	dm       auth.Authority
	player   auth.Authority
	pool     *db.Pool
}

func newDiscordFixture(t *testing.T) discordFixture {
	t.Helper()
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	authorityFor := func(handle string, roles ...string) auth.Authority {
		id := uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$2,$2,$3)`, id, handle, roles); err != nil {
			t.Fatal(err)
		}
		authRoles := make([]auth.Role, len(roles))
		for i, role := range roles {
			authRoles[i] = auth.Role(role)
		}
		if handle == "ds-dm" {
			if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, id); err != nil {
				t.Fatal(err)
			}
		}
		a, err := auth.NewAuthority(id, authRoles, "active", handle)
		if err != nil {
			t.Fatal(err)
		}
		return a
	}
	f := discordFixture{
		admin:  authorityFor("ds-admin", "admin"),
		dm:     authorityFor("ds-dm", "dm"),
		player: authorityFor("ds-player", "player"),
		pool:   fixture.Pool,
	}
	runner := db.NewRunner(fixture.Pool, func(tx pgx.Tx) ProductCommandRepos {
		pg, _ := NewProductPostgres(tx)
		policy, _ := auth.NewPoolPolicy(tx)
		replay, _ := idempotency.NewRepository(tx)
		audit, _ := auth.NewOverrideRecorder(replay)
		store, _ := member.NewFromDBTX(tx, "")
		return ProductCommandRepos{Operations: pg, Site: pg, Policy: policy, Authority: store.ResolveAuthority, Replay: replay, Producer: notification.NewProducer(), Audit: audit}
	})
	commands, err := NewProductCommands(runner, func() time.Time { return time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC) }, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	reader, _ := NewProductPostgres(fixture.Pool)
	docReader, _ := document.NewProductPostgres(fixture.Pool)
	policy, _ := auth.NewPoolPolicy(fixture.Pool)
	observer, _ := auth.NewSafeOverrideObserver(slog.Default())
	queries, err := NewProductQueries(ProductReadRepos{Site: reader}, policy, time.Now, observer, docReader)
	if err != nil {
		t.Fatal(err)
	}
	f.commands, f.queries = commands, queries
	return f
}

func settingsInput() UpdateDiscordSettingsSpec {
	channel, role := dsGuildChannel, dsRole
	return UpdateDiscordSettingsSpec{Input: DiscordSettingsFields{
		AnnounceChannelId: &channel, RoleId: &role,
		VoiceChannels: []DiscordVoiceChannelFields{{Name: " Table One ", ChannelId: dsVoiceA}, {Name: "Table Two", ChannelId: dsVoiceB}},
	}}
}

func isCode(err error, code apierr.Code) bool {
	e, ok := errors.AsType[*apierr.Error](err)
	return ok && e.Code == code
}

func TestDiscordSettingsAdminRoundTrip(t *testing.T) {
	f := newDiscordFixture(t)
	ctx := context.Background()
	empty, err := f.queries.DiscordSettings(ctx, f.admin, DiscordSettingsSpec{})
	if err != nil || empty.AnnounceChannelId != nil || empty.RoleId != nil || len(empty.VoiceChannels) != 0 {
		t.Fatalf("empty settings=%+v err=%v", empty, err)
	}
	saved, err := f.commands.UpdateDiscordSettings(ctx, f.admin, settingsInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if saved.AnnounceChannelId == nil || *saved.AnnounceChannelId != dsGuildChannel || saved.RoleId == nil || *saved.RoleId != dsRole ||
		len(saved.VoiceChannels) != 2 || saved.VoiceChannels[0].Name != "Table One" || saved.VoiceChannels[1].ChannelId != dsVoiceB {
		t.Fatalf("saved=%+v", saved)
	}
	read, err := f.queries.DiscordSettings(ctx, f.admin, DiscordSettingsSpec{})
	if err != nil || len(read.VoiceChannels) != 2 || read.RoleId == nil || *read.RoleId != dsRole {
		t.Fatalf("read=%+v err=%v", read, err)
	}
	// The role is the existing quest_announcement_role setting, so the Delivery page still sees it.
	var role string
	if err := f.pool.QueryRow(ctx, `SELECT payload->>'roleId' FROM site_settings WHERE key='quest_announcement_role'`).Scan(&role); err != nil || role != dsRole {
		t.Fatalf("role setting=%q err=%v", role, err)
	}
	// Empty values clear a setting, and removing channels works.
	cleared, err := f.commands.UpdateDiscordSettings(ctx, f.admin, UpdateDiscordSettingsSpec{Input: DiscordSettingsFields{VoiceChannels: []DiscordVoiceChannelFields{}}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || cleared.AnnounceChannelId != nil || cleared.RoleId != nil || len(cleared.VoiceChannels) != 0 {
		t.Fatalf("cleared=%+v err=%v", cleared, err)
	}
}

func TestDiscordSettingsAreAdminOnlyOnTheServer(t *testing.T) {
	f := newDiscordFixture(t)
	ctx := context.Background()
	for name, actor := range map[string]auth.Authority{"dm": f.dm, "player": f.player} {
		if _, err := f.commands.UpdateDiscordSettings(ctx, actor, settingsInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()}); !isCode(err, apierr.Forbidden) {
			t.Errorf("%s write: want FORBIDDEN got %v", name, err)
		}
		if _, err := f.queries.DiscordSettings(ctx, actor, DiscordSettingsSpec{}); !isCode(err, apierr.Forbidden) {
			t.Errorf("%s read: want FORBIDDEN got %v", name, err)
		}
	}
	if _, err := f.queries.DiscordSettings(ctx, auth.Authority{}, DiscordSettingsSpec{}); err == nil {
		t.Error("anonymous read must be refused")
	}
	var n int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM site_settings WHERE key LIKE 'discord_%'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("refused writes left %d settings rows, err=%v", n, err)
	}
}

func TestQuestVoiceChannelsReadableByDMAndAdminNotPlayers(t *testing.T) {
	f := newDiscordFixture(t)
	ctx := context.Background()
	if _, err := f.commands.UpdateDiscordSettings(ctx, f.admin, settingsInput(), product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	for name, actor := range map[string]auth.Authority{"dm": f.dm, "admin": f.admin} {
		channels, err := f.queries.QuestVoiceChannels(ctx, actor, QuestVoiceChannelsSpec{})
		if err != nil || len(channels) != 2 || channels[0].Name != "Table One" || channels[0].ChannelId != dsVoiceA {
			t.Errorf("%s channels=%+v err=%v", name, channels, err)
		}
	}
	if _, err := f.queries.QuestVoiceChannels(ctx, f.player, QuestVoiceChannelsSpec{}); !isCode(err, apierr.Forbidden) {
		t.Errorf("player: want FORBIDDEN got %v", err)
	}
}

func TestDiscordSettingsValidateSnowflakesNamesAndDuplicates(t *testing.T) {
	f := newDiscordFixture(t)
	ctx := context.Background()
	bad := func(mutate func(*DiscordSettingsFields)) error {
		spec := settingsInput()
		mutate(&spec.Input)
		_, err := f.commands.UpdateDiscordSettings(ctx, f.admin, spec, product.CommandMeta{IdempotencyKey: uuid.NewString()})
		return err
	}
	short, long, letters := "1234567890123456", "123456789012345678901", "33333333333333333x"
	cases := map[string]func(*DiscordSettingsFields){
		"announce too short":   func(s *DiscordSettingsFields) { s.AnnounceChannelId = &short },
		"announce too long":    func(s *DiscordSettingsFields) { s.AnnounceChannelId = &long },
		"role has a letter":    func(s *DiscordSettingsFields) { s.RoleId = &letters },
		"voice id too short":   func(s *DiscordSettingsFields) { s.VoiceChannels[0].ChannelId = short },
		"voice id with letter": func(s *DiscordSettingsFields) { s.VoiceChannels[0].ChannelId = letters },
		"voice name empty":     func(s *DiscordSettingsFields) { s.VoiceChannels[0].Name = "  " },
		"voice id duplicated":  func(s *DiscordSettingsFields) { s.VoiceChannels[1].ChannelId = dsVoiceA },
	}
	for name, mutate := range cases {
		if err := bad(mutate); !isCode(err, apierr.Invalid) {
			t.Errorf("%s: want INVALID got %v", name, err)
		}
	}
	exact := "12345678901234567" // 17 digits
	twenty := "12345678901234567890"
	if err := bad(func(s *DiscordSettingsFields) { s.AnnounceChannelId = &exact; s.RoleId = &twenty }); err != nil {
		t.Fatalf("17 and 20 digit ids are valid: %v", err)
	}
}

func TestLegacyRoleMutationNowRequiresSnowflake(t *testing.T) {
	f := newDiscordFixture(t)
	ctx := context.Background()
	word := "everyone"
	_, err := f.commands.UpdateQuestAnnouncementRoleSetting(ctx, f.admin, UpdateQuestAnnouncementRoleSettingSpec{Input: AnnouncementRoleFields{Enabled: true, RoleId: &word}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if !isCode(err, apierr.Invalid) {
		t.Fatalf("want INVALID got %v", err)
	}
}
