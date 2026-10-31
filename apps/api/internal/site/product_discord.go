package site

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// Discord admin panel settings (M4-12). Values live in site_settings:
// discord_announce_channel, discord_voice_channels and the existing
// quest_announcement_role. The bot token and guild id stay deploy secrets.

type DiscordVoiceChannelView struct {
	ChannelId string
	Name      string
}

type DiscordVoiceChannelFields struct {
	ChannelId string
	Name      string
}

type DiscordSettingsView struct {
	AnnounceChannelId *string
	RoleId            *string
	VoiceChannels     []DiscordVoiceChannelView
}

type DiscordSettingsFields struct {
	AnnounceChannelId *string
	RoleId            *string
	VoiceChannels     []DiscordVoiceChannelFields
}

type DiscordSettingsSpec struct{}
type QuestVoiceChannelsSpec struct{}

type UpdateDiscordSettingsSpec struct {
	Input DiscordSettingsFields
}

type UpdateDiscordSettingsState struct {
	Exists    bool
	SubjectID string
	OwnerID   string
	Version   int64
	UpdatedAt *time.Time
}

type UpdateDiscordSettingsWrite struct {
	ActorID        string
	At             time.Time
	Input          UpdateDiscordSettingsSpec
	Locked         UpdateDiscordSettingsState
	ValidatedInput UpdateDiscordSettingsSpec
}

func optionalSnowflake(value *string, what string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	id := strings.TrimSpace(*value)
	if id == "" {
		return nil, nil
	}
	if !delivery.ValidSnowflake(id) {
		return nil, apierr.New(apierr.Invalid, what+" must be a Discord ID of 17 to 20 digits")
	}
	return &id, nil
}

func (s ProductQueries) DiscordSettings(ctx context.Context, actor auth.Authority, spec DiscordSettingsSpec) (DiscordSettingsView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.discordSettings")); err != nil {
		return DiscordSettingsView{}, err
	}
	return s.Reads.Site.ReadDiscordSettings(ctx, actor, spec)
}

// QuestVoiceChannels is the list a DM picks from on the quest form.
func (s ProductQueries) QuestVoiceChannels(ctx context.Context, actor auth.Authority, spec QuestVoiceChannelsSpec) ([]DiscordVoiceChannelView, error) {
	if err := s.admit(ctx, actor, auth.Operation("Query.questVoiceChannels")); err != nil {
		return nil, err
	}
	view, err := s.Reads.Site.ReadDiscordSettings(ctx, actor, DiscordSettingsSpec{})
	if err != nil {
		return nil, err
	}
	return view.VoiceChannels, nil
}

func (s ProductCommands) UpdateDiscordSettings(ctx context.Context, actor auth.Authority, spec UpdateDiscordSettingsSpec, meta product.CommandMeta) (DiscordSettingsView, error) {
	var err error
	if spec.Input.AnnounceChannelId, err = optionalSnowflake(spec.Input.AnnounceChannelId, "announce channel ID"); err != nil {
		return DiscordSettingsView{}, err
	}
	if spec.Input.RoleId, err = optionalSnowflake(spec.Input.RoleId, "quest role ID"); err != nil {
		return DiscordSettingsView{}, err
	}
	channels := make([]delivery.VoiceChannel, len(spec.Input.VoiceChannels))
	for i, channel := range spec.Input.VoiceChannels {
		channels[i] = delivery.VoiceChannel{Name: channel.Name, ChannelID: channel.ChannelId}
	}
	clean, err := delivery.ValidateVoiceChannels(channels)
	if err != nil {
		return DiscordSettingsView{}, apierr.New(apierr.Invalid, err.Error())
	}
	spec.Input.VoiceChannels = make([]DiscordVoiceChannelFields, len(clean))
	for i, channel := range clean {
		spec.Input.VoiceChannels[i] = DiscordVoiceChannelFields{Name: channel.Name, ChannelId: channel.ChannelID}
	}
	return runSiteCommand(ctx, s, actor, "updateDiscordSettings", spec, meta, delivery.SettingAnnounceChannel, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DiscordSettingsView, error) {
		locked, err := repos.Site.LockUpdateDiscordSettings(ctx, spec)
		if err != nil {
			return DiscordSettingsView{}, err
		}
		if !locked.Exists {
			return DiscordSettingsView{}, apierr.New(apierr.NotFound, "discord settings not found")
		}
		return repos.Site.StoreUpdateDiscordSettings(ctx, UpdateDiscordSettingsWrite{ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked})
	})
}

func (p *ProductPostgres) ReadDiscordSettings(ctx context.Context, _ auth.Authority, _ DiscordSettingsSpec) (DiscordSettingsView, error) {
	view := DiscordSettingsView{VoiceChannels: []DiscordVoiceChannelView{}}
	if payload, err := p.settingPayload(ctx, delivery.SettingAnnounceChannel); err != nil {
		return view, err
	} else if id := delivery.ParseAnnounceChannel(payload); id != "" {
		view.AnnounceChannelId = &id
	}
	if payload, err := p.settingPayload(ctx, delivery.SettingQuestRole); err != nil {
		return view, err
	} else if id := delivery.ParseQuestRole(payload); id != "" {
		view.RoleId = &id
	}
	payload, err := p.settingPayload(ctx, delivery.SettingVoiceChannels)
	if err != nil {
		return view, err
	}
	for _, channel := range delivery.ParseVoiceChannels(payload) {
		view.VoiceChannels = append(view.VoiceChannels, DiscordVoiceChannelView{Name: channel.Name, ChannelId: channel.ChannelID})
	}
	return view, nil
}

func (p *ProductPostgres) settingPayload(ctx context.Context, key string) ([]byte, error) {
	row, err := p.readSetting(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return row.Payload, nil
}

func (p *ProductPostgres) LockUpdateDiscordSettings(ctx context.Context, _ UpdateDiscordSettingsSpec) (UpdateDiscordSettingsState, error) {
	announce, err := delivery.MarshalAnnounceChannel("")
	if err != nil {
		return UpdateDiscordSettingsState{}, err
	}
	state, err := p.lockSiteSetting(ctx, delivery.SettingAnnounceChannel, announce, func([]byte) *HomeBannerView { return nil })
	if err != nil {
		return UpdateDiscordSettingsState{}, err
	}
	return UpdateDiscordSettingsState{Exists: state.Exists, SubjectID: state.SubjectID, OwnerID: state.OwnerID, UpdatedAt: state.UpdatedAt}, nil
}

func (p *ProductPostgres) StoreUpdateDiscordSettings(ctx context.Context, write UpdateDiscordSettingsWrite) (DiscordSettingsView, error) {
	input := write.ValidatedInput.Input
	at := pgtype.Timestamptz{Time: write.At, Valid: true}
	announce := ""
	if input.AnnounceChannelId != nil {
		announce = *input.AnnounceChannelId
	}
	announcePayload, err := delivery.MarshalAnnounceChannel(announce)
	if err != nil {
		return DiscordSettingsView{}, err
	}
	channels := make([]delivery.VoiceChannel, len(input.VoiceChannels))
	for i, channel := range input.VoiceChannels {
		channels[i] = delivery.VoiceChannel{Name: channel.Name, ChannelID: channel.ChannelId}
	}
	voicePayload, err := delivery.MarshalVoiceChannels(channels)
	if err != nil {
		return DiscordSettingsView{}, err
	}
	rolePayload, err := marshalQuestAnnouncementRole(AnnouncementRoleFields{Enabled: input.RoleId != nil, RoleId: input.RoleId})
	if err != nil {
		return DiscordSettingsView{}, err
	}
	for _, setting := range []struct {
		key     string
		payload []byte
	}{
		{delivery.SettingAnnounceChannel, announcePayload},
		{delivery.SettingVoiceChannels, voicePayload},
		{delivery.SettingQuestRole, rolePayload},
	} {
		if _, err := p.queries().SiteEnsureSetting(ctx, dbgen.SiteEnsureSettingParams{SettingKey: setting.key, InitialPayload: setting.payload, At: at}); err != nil {
			return DiscordSettingsView{}, err
		}
		if _, err := p.queries().SiteReplaceSetting(ctx, dbgen.SiteReplaceSettingParams{Payload: setting.payload, At: at, SettingKey: setting.key}); err != nil {
			return DiscordSettingsView{}, err
		}
	}
	return p.ReadDiscordSettings(ctx, auth.Authority{}, DiscordSettingsSpec{})
}
