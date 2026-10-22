package quest

import (
	"testing"
)

func TestQuestClosureValidation(t *testing.T) {
	const id = "10000000-0000-4000-8000-000000000001"
	const other = "10000000-0000-4000-8000-000000000002"
	for _, tc := range []struct {
		name    string
		status  string
		input   CloseQuestFields
		invalid bool
	}{
		{"final attendance", "signed_up", CloseQuestFields{Attendance: []ParticipationAttestationFields{{CharacterId: id, Status: "played"}}, Rewards: []QuestPcxpAwardFields{{CharacterId: id, Pcxp: 4}}}, false},
		{"existing final", "played", CloseQuestFields{}, false},
		{"missing final", "waitlisted", CloseQuestFields{}, true},
		{"unknown attendance", "played", CloseQuestFields{Attendance: []ParticipationAttestationFields{{CharacterId: other, Status: "played"}}}, true},
		{"withdrawn attendance", "withdrawn", CloseQuestFields{Attendance: []ParticipationAttestationFields{{CharacterId: id, Status: "played"}}}, true},
		{"no show award", "no_show", CloseQuestFields{Rewards: []QuestPcxpAwardFields{{CharacterId: id, Pcxp: 4}}}, true},
		{"unknown award", "played", CloseQuestFields{Rewards: []QuestPcxpAwardFields{{CharacterId: other, Pcxp: 4}}}, true},
		{"duplicate award", "played", CloseQuestFields{Rewards: []QuestPcxpAwardFields{{CharacterId: id, Pcxp: 4}, {CharacterId: id, Pcxp: 2}}}, true},
		{"duplicate attendance", "played", CloseQuestFields{Attendance: []ParticipationAttestationFields{{CharacterId: id, Status: "played"}, {CharacterId: id, Status: "no_show"}}}, true},
		{"invalid status", "played", CloseQuestFields{Attendance: []ParticipationAttestationFields{{CharacterId: id, Status: "signed_up"}}}, true},
		{"zero award", "played", CloseQuestFields{Rewards: []QuestPcxpAwardFields{{CharacterId: id, Pcxp: 0}}}, true},
		{"negative award", "played", CloseQuestFields{Rewards: []QuestPcxpAwardFields{{CharacterId: id, Pcxp: -1}}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := normalizeQuestClosure(&tc.input)
			if err == nil {
				err = validateQuestClosure(CloseQuestState{Before: &QuestView{Status: "played"}, Roster: []QuestParticipantView{{CharacterId: id, Status: tc.status}}}, []string{id}, tc.input)
			}
			if (err != nil) != tc.invalid {
				t.Fatalf("error=%v, invalid=%v", err, tc.invalid)
			}
		})
	}
	if err := validateQuestClosure(CloseQuestState{Before: &QuestView{Status: "played"}, Roster: []QuestParticipantView{{CharacterId: id, Status: "played"}}}, []string{other}, CloseQuestFields{}); err == nil {
		t.Fatal("changed roster accepted")
	}
}
