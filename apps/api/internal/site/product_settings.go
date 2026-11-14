package site

import (
	"encoding/json"
	"strings"
)

const (
	settingHomeBanner              = "home_banner"
	settingQuestAnnouncementRole   = "quest_announcement_role"
	settingDiscordDeliveryMode     = "discord_delivery_mode"
	settingPublicOrigin            = "public_origin"
	defaultDiscordDeliveryMode     = "disabled"
)

func defaultHomeBannerPayload() []byte {
	payload, _ := json.Marshal(map[string]any{"enabled": false})
	return payload
}

func defaultQuestAnnouncementRolePayload() []byte {
	payload, _ := json.Marshal(map[string]any{"enabled": false, "roleId": nil})
	return payload
}

func parseHomeBanner(payload []byte) HomeBannerView {
	view := HomeBannerView{}
	if len(payload) == 0 {
		return view
	}
	var raw map[string]json.RawMessage
	if json.Unmarshal(payload, &raw) != nil {
		return view
	}
	if value, ok := raw["enabled"]; ok {
		_ = json.Unmarshal(value, &view.Enabled)
	}
	view.Body = jsonStringPtr(raw["body"])
	view.CtaHref = jsonStringPtr(raw["ctaHref"])
	view.CtaLabel = jsonStringPtr(raw["ctaLabel"])
	view.MediaKind = jsonStringPtr(raw["mediaKind"])
	view.MediaLabel = jsonStringPtr(raw["mediaLabel"])
	view.MediaUrl = jsonStringPtr(raw["mediaUrl"])
	view.Title = jsonStringPtr(raw["title"])
	if text, ok := raw["text"]; ok && view.Body == nil {
		view.Body = jsonStringPtr(text)
	}
	return view
}

func marshalHomeBanner(fields HomeBannerFields) ([]byte, error) {
	payload := map[string]any{"enabled": fields.Enabled}
	if fields.Body != nil {
		payload["body"] = *fields.Body
	}
	if fields.CtaHref != nil {
		payload["ctaHref"] = *fields.CtaHref
	}
	if fields.CtaLabel != nil {
		payload["ctaLabel"] = *fields.CtaLabel
	}
	if fields.MediaKind != nil {
		payload["mediaKind"] = *fields.MediaKind
	}
	if fields.MediaLabel != nil {
		payload["mediaLabel"] = *fields.MediaLabel
	}
	if fields.MediaUrl != nil {
		payload["mediaUrl"] = *fields.MediaUrl
	}
	if fields.Title != nil {
		payload["title"] = *fields.Title
	}
	return json.Marshal(payload)
}

func parseQuestAnnouncementRole(payload []byte) QuestAnnouncementRoleSettingView {
	view := QuestAnnouncementRoleSettingView{}
	if len(payload) == 0 {
		return view
	}
	var raw struct {
		Enabled bool    `json:"enabled"`
		RoleId  *string `json:"roleId"`
	}
	if json.Unmarshal(payload, &raw) != nil {
		return view
	}
	view.Enabled = raw.Enabled
	view.RoleId = raw.RoleId
	return view
}

func marshalQuestAnnouncementRole(fields AnnouncementRoleFields) ([]byte, error) {
	return json.Marshal(map[string]any{"enabled": fields.Enabled, "roleId": fields.RoleId})
}

func parseDiscordDeliveryMode(payload []byte) string {
	if len(payload) == 0 {
		return defaultDiscordDeliveryMode
	}
	var raw struct {
		Mode string `json:"mode"`
	}
	if json.Unmarshal(payload, &raw) != nil || strings.TrimSpace(raw.Mode) == "" {
		return defaultDiscordDeliveryMode
	}
	return raw.Mode
}

func parsePublicOrigin(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	var raw struct {
		Origin string `json:"origin"`
	}
	if json.Unmarshal(payload, &raw) != nil {
		return ""
	}
	return strings.TrimRight(raw.Origin, "/")
}

func jsonStringPtr(raw json.RawMessage) *string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return nil
	}
	return &value
}

func mapSearchKinds(kinds []SearchKind) []SearchKindView {
	out := make([]SearchKindView, len(kinds))
	for i, kind := range kinds {
		out[i] = SearchKindView{
			Key:             kind.Key,
			Label:           kind.Label,
			Searchable:      kind.Searchable,
			ExclusionReason: kind.ExclusionReason,
		}
	}
	return out
}
