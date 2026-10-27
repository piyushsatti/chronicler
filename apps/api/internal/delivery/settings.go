package delivery

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Site-setting keys for the Discord admin panel. The quest role keeps its
// existing key and payload shape ({"enabled": bool, "roleId": string|null}).
const (
	SettingAnnounceChannel   = "discord_announce_channel"
	SettingVoiceChannels     = "discord_voice_channels"
	SettingQuestRole         = "quest_announcement_role"
	SettingPublicOrigin      = "public_origin"
	MaxVoiceChannels         = 100
	maxVoiceChannelNameRunes = 100
)

var snowflakePattern = regexp.MustCompile(`^[0-9]{17,20}$`)

// ValidSnowflake reports whether id is a 17-20 digit Discord snowflake.
func ValidSnowflake(id string) bool { return snowflakePattern.MatchString(id) }

// VoiceChannel is one admin-listed voice channel a DM may pick for a quest.
type VoiceChannel struct {
	Name      string `json:"name"`
	ChannelID string `json:"channelId"`
}

// ValidateVoiceChannels trims names, checks snowflakes and rejects duplicates.
func ValidateVoiceChannels(in []VoiceChannel) ([]VoiceChannel, error) {
	if len(in) > MaxVoiceChannels {
		return nil, fmt.Errorf("at most %d voice channels", MaxVoiceChannels)
	}
	out := make([]VoiceChannel, 0, len(in))
	seen := map[string]struct{}{}
	for _, channel := range in {
		name := strings.TrimSpace(channel.Name)
		id := strings.TrimSpace(channel.ChannelID)
		if name == "" || utf8.RuneCountInString(name) > maxVoiceChannelNameRunes || !utf8.ValidString(name) {
			return nil, fmt.Errorf("each voice channel needs a name of 1 to %d characters", maxVoiceChannelNameRunes)
		}
		if !ValidSnowflake(id) {
			return nil, fmt.Errorf("voice channel %q needs a channel ID of 17 to 20 digits", name)
		}
		if _, dup := seen[id]; dup {
			return nil, fmt.Errorf("voice channel ID %s is listed twice", id)
		}
		seen[id] = struct{}{}
		out = append(out, VoiceChannel{Name: name, ChannelID: id})
	}
	return out, nil
}

// ParseVoiceChannels reads the stored list. Unreadable payloads are an empty list.
func ParseVoiceChannels(payload []byte) []VoiceChannel {
	var raw struct {
		Channels []VoiceChannel `json:"channels"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &raw) != nil || raw.Channels == nil {
		return []VoiceChannel{}
	}
	return raw.Channels
}

// MarshalVoiceChannels is the stored shape of the list.
func MarshalVoiceChannels(channels []VoiceChannel) ([]byte, error) {
	if channels == nil {
		channels = []VoiceChannel{}
	}
	return json.Marshal(map[string]any{"channels": channels})
}

// ParseAnnounceChannel reads the stored announce channel ID ("" when unset).
func ParseAnnounceChannel(payload []byte) string {
	var raw struct {
		ChannelID *string `json:"channelId"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &raw) != nil || raw.ChannelID == nil {
		return ""
	}
	return strings.TrimSpace(*raw.ChannelID)
}

// MarshalAnnounceChannel is the stored shape of the announce channel setting.
func MarshalAnnounceChannel(channelID string) ([]byte, error) {
	if channelID == "" {
		return json.Marshal(map[string]any{"channelId": nil})
	}
	return json.Marshal(map[string]any{"channelId": channelID})
}

// ParseQuestRole reads the quest role setting. A disabled setting yields "".
func ParseQuestRole(payload []byte) string {
	var raw struct {
		Enabled bool    `json:"enabled"`
		RoleID  *string `json:"roleId"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &raw) != nil || !raw.Enabled || raw.RoleID == nil {
		return ""
	}
	return strings.TrimSpace(*raw.RoleID)
}

// ParsePublicOrigin reads the stored site origin without a trailing slash.
func ParsePublicOrigin(payload []byte) string {
	var raw struct {
		Origin string `json:"origin"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &raw) != nil {
		return ""
	}
	return strings.TrimRight(strings.TrimSpace(raw.Origin), "/")
}
