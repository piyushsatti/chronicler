package quest

import (
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func normalizeQuestClosure(input *CloseQuestFields) error {
	if len(input.Rewards) > 100 {
		return apierr.New(apierr.Invalid, "at most 100 quest rewards allowed")
	}
	seen := make(map[string]bool, len(input.Attendance))
	for i := range input.Attendance {
		entry := &input.Attendance[i]
		entry.CharacterId = strings.TrimSpace(entry.CharacterId)
		if err := commandPublicID(&entry.CharacterId); err != nil {
			return err
		}
		if seen[entry.CharacterId] || entry.Status != "played" && entry.Status != "no_show" {
			return apierr.New(apierr.Invalid, "attendance requires unique characters and played or no_show status")
		}
		seen[entry.CharacterId] = true
	}
	seen = make(map[string]bool, len(input.Rewards))
	for i := range input.Rewards {
		reward := &input.Rewards[i]
		reward.CharacterId = strings.TrimSpace(reward.CharacterId)
		if err := commandPublicID(&reward.CharacterId); err != nil {
			return err
		}
		if seen[reward.CharacterId] || reward.Pcxp <= 0 {
			return apierr.New(apierr.Invalid, "rewards require unique characters and positive pcxp")
		}
		seen[reward.CharacterId] = true
	}
	return nil
}

func validateQuestClosure(locked CloseQuestState, characters []string, input CloseQuestFields) error {
	if locked.Before == nil || locked.Before.Status != "played" {
		return apierr.New(apierr.Conflict, "quest must be played before close")
	}
	statuses := make(map[string]string, len(locked.Roster))
	for _, participant := range locked.Roster {
		statuses[participant.CharacterId] = participant.Status
	}
	if len(characters) != len(statuses) {
		return apierr.New(apierr.Conflict, "quest roster changed during close")
	}
	for _, id := range characters {
		if _, ok := statuses[id]; !ok {
			return apierr.New(apierr.Conflict, "quest roster changed during close")
		}
	}
	for _, entry := range input.Attendance {
		status, ok := statuses[entry.CharacterId]
		if !ok || status == "withdrawn" {
			return apierr.New(apierr.Invalid, "attendance requires a current roster participant")
		}
		statuses[entry.CharacterId] = entry.Status
	}
	for _, status := range statuses {
		if status == "signed_up" || status == "waitlisted" {
			return apierr.New(apierr.Invalid, "final attendance required for every pending participant")
		}
	}
	for _, reward := range input.Rewards {
		if statuses[reward.CharacterId] != "played" {
			return apierr.New(apierr.Invalid, "quest reward requires played attendance")
		}
	}
	return nil
}
