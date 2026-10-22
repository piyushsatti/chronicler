package graph

import (
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
)

func TestCharacterMirrorMapping(t *testing.T) {
	empty := toCharacterView(character.CharacterView{})
	if empty.DdbMirror != nil || empty.Proficiencies == nil || len(empty.Proficiencies) != 0 {
		t.Fatalf("absent mirror or empty proficiencies changed: %+v", empty)
	}
	zero, level, hp := int32(0), int32(3), int32(24)
	species, classes, background := "Elf", "Wizard", "Scholar"
	at := time.Date(2026, 10, 20, 3, 0, 0, 0, time.UTC)
	view := toCharacterView(character.CharacterView{
		DdbMirror: &character.CharacterDDBMirrorView{
			CharacterId: "character", Level: &level, Xp: &zero, MaxHp: &hp,
			Species: &species, Classes: &classes, Background: &background, SyncedAt: &at,
		},
		Proficiencies: []character.DDBProficiencyView{{Kind: "skill", Name: "Arcana"}},
	})
	m := view.DdbMirror
	if m == nil || m.CharacterID != "character" || m.Level == nil || *m.Level != 3 || m.Xp == nil || *m.Xp != 0 || m.MaxHp == nil || *m.MaxHp != 24 || m.ArmorClass != nil || m.Species == nil || *m.Species != species || m.Classes == nil || *m.Classes != classes || m.Background == nil || *m.Background != background || m.SyncedAt == nil || !m.SyncedAt.Equal(at) {
		t.Fatalf("last-good mirror fields lost: %+v", m)
	}
	if len(view.Proficiencies) != 1 || view.Proficiencies[0].Kind != "skill" || view.Proficiencies[0].Name != "Arcana" {
		t.Fatalf("proficiencies lost: %+v", view.Proficiencies)
	}
}
