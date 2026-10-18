package character

import (
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func TestProductPostgresReadMapping(t *testing.T) {
	if _, err := NewProductPostgres(nil); err == nil {
		t.Fatal("nil database executor accepted")
	}
	var typedNil *db.Pool
	if _, err := NewProductPostgres(typedNil); err == nil {
		t.Fatal("typed nil database executor accepted")
	}

	createdAt := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	submittedAt := createdAt.Add(time.Minute)
	id, err := db.ParseUUID("10000000-0000-4000-8000-000000000001")
	if err != nil {
		t.Fatal(err)
	}
	ownerID, err := db.ParseUUID("30000000-0000-4000-8000-000000000003")
	if err != nil {
		t.Fatal(err)
	}
	backstoryID, err := db.ParseUUID("20000000-0000-4000-8000-000000000002")
	if err != nil {
		t.Fatal(err)
	}
	view, err := mapProductCharacter(
		id, "C-READ", "Mapper", ownerID, backstoryID, pgtype.UUID{}, pgtype.UUID{}, "active",
		pgtype.Text{String: "description", Valid: true}, pgtype.Text{}, 12,
		pgtype.Timestamptz{Time: createdAt, Valid: true}, pgtype.Timestamptz{Time: createdAt, Valid: true},
		pgtype.Timestamptz{Time: submittedAt, Valid: true}, "PENDING", nil, pgtype.Timestamptz{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if view.Id != "10000000-0000-4000-8000-000000000001" || view.OwnerId != "30000000-0000-4000-8000-000000000003" {
		t.Fatalf("UUID mapping = id %q owner %q", view.Id, view.OwnerId)
	}
	if view.Description == nil || *view.Description != "description" || view.DdbUrl != nil || view.BackstoryId == nil || *view.BackstoryId != "20000000-0000-4000-8000-000000000002" || view.GuildId != nil || view.RegionId != nil {
		t.Fatalf("nullable mapping = %+v", view)
	}
	if view.VerificationStatus != CharacterReviewStatusPending || view.VerificationSubmittedAt == nil || !view.VerificationSubmittedAt.Equal(submittedAt) {
		t.Fatalf("pending verification mapping = %+v", view)
	}
	if view.Proficiencies == nil {
		t.Fatal("proficiencies must be an initialized empty list")
	}
}

func TestDecodeStoredCharacterDDBMirror(t *testing.T) {
	characterID := "10000000-0000-4000-8000-000000000001"
	syncedAt := time.Date(2026, 10, 17, 12, 30, 0, 0, time.UTC)
	valid := []byte(`{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[{"kind":"language","name":"Common"},{"kind":"proficiency","name":"Constitution Saving Throws"}]}`)
	mirror, proficiencies, err := decodeStoredCharacterDDBMirror(characterID, valid, pgtype.Timestamptz{Time: syncedAt, Valid: true})
	if err != nil {
		t.Fatal(err)
	}
	if mirror == nil || mirror.CharacterId != characterID || mirror.Level == nil || *mirror.Level != 1 || mirror.Xp == nil || *mirror.Xp != 0 || mirror.Species == nil || *mirror.Species != "Goliath" || mirror.Classes == nil || *mirror.Classes != "Barbarian 1" || mirror.Background != nil || mirror.ArmorClass != nil || mirror.MaxHp != nil || mirror.SyncedAt == nil || !mirror.SyncedAt.Equal(syncedAt) {
		t.Fatalf("stored mirror projection = %+v", mirror)
	}
	want := []DDBProficiencyView{{Kind: "language", Name: "Common"}, {Kind: "proficiency", Name: "Constitution Saving Throws"}}
	if !reflect.DeepEqual(proficiencies, want) {
		t.Fatalf("stored proficiencies = %#v, want %#v", proficiencies, want)
	}
	if absent, empty, err := decodeStoredCharacterDDBMirror(characterID, nil, pgtype.Timestamptz{}); err != nil || absent != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("absent stored mirror = %#v, %#v, %v", absent, empty, err)
	}

	tests := []struct {
		name    string
		payload string
	}{
		{name: "null payload", payload: `null`},
		{name: "floating point XP", payload: `{"level":1,"xp":1.0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[]}`},
		{name: "negative optional scalar", payload: `{"level":1,"xp":0,"armorClass":-1,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[]}`},
		{name: "wrong proficiency type", payload: `{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[{"kind":1,"name":"Common"}]}`},
		{name: "duplicate proficiency", payload: `{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[{"kind":"language","name":"Common"},{"kind":"language","name":"Common"}]}`},
		{name: "unknown normalized field", payload: `{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[],"other":true}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, _, err := decodeStoredCharacterDDBMirror(characterID, []byte(test.payload), pgtype.Timestamptz{Time: syncedAt, Valid: true}); err == nil {
				t.Fatalf("malformed persisted payload %s was accepted", test.name)
			}
		})
	}
	if _, _, err := decodeStoredCharacterDDBMirror(characterID, valid, pgtype.Timestamptz{}); err == nil {
		t.Fatal("persisted payload without synced_at was accepted")
	}
}

func TestCharacterVerificationStatusMapping(t *testing.T) {
	tests := []struct {
		value any
		want  CharacterReviewStatus
	}{
		{value: "PENDING", want: CharacterReviewStatusPending},
		{value: "APPROVED", want: CharacterReviewStatusApproved},
		{value: "REJECTED", want: CharacterReviewStatusRejected},
		{value: "UNKNOWN", want: CharacterReviewStatusUnknown},
	}
	for _, test := range tests {
		got, err := characterVerificationStatus(test.value)
		if err != nil || got != test.want {
			t.Errorf("characterVerificationStatus(%#v) = %q, %v; want %q", test.value, got, err, test.want)
		}
	}
	for _, value := range []any{"other", "pending", nil, []byte("PENDING"), 7} {
		if got, err := characterVerificationStatus(value); err == nil || got != "" {
			t.Errorf("characterVerificationStatus(%#v) = %q, %v; want an error", value, got, err)
		}
	}
}
