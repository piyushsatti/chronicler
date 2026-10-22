//go:build integration

package character

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

type characterReadQueryCounter struct {
	dbgen.DBTX
	queries int
}

func (c *characterReadQueryCounter) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	c.queries++
	return c.DBTX.Query(ctx, sql, args...)
}

func (c *characterReadQueryCounter) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	return c.DBTX.Exec(ctx, sql, args...)
}

func (c *characterReadQueryCounter) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	return c.DBTX.QueryRow(ctx, sql, args...)
}

func TestCharacterProductPostgresReadAdapters(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	var ownerID, reviewerID string
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha-adapter-owner', 'cha_adapter_owner', 'Adapter Owner') RETURNING public_id::text`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha-adapter-reviewer', 'cha_adapter_reviewer', 'Adapter Reviewer') RETURNING public_id::text`).Scan(&reviewerID); err != nil {
		t.Fatal(err)
	}
	var backstoryID string
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO backstories (name, lore) VALUES ('Adapter Backstory', 'Stored association') RETURNING public_id::text`).Scan(&backstoryID); err != nil {
		t.Fatal(err)
	}
	var pendingID, decidedID, unknownID string
	submittedAt := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Minute)
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status, backstory_id, player_xp, verification_submitted_at) SELECT 'C-ADAPTER-1', 'Read Alpha', id, 'active', (SELECT id FROM backstories WHERE public_id = $3::uuid), 7, $2 FROM members WHERE public_id = $1::uuid RETURNING public_id::text`, ownerID, submittedAt, backstoryID).Scan(&pendingID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status, player_xp) SELECT 'C-ADAPTER-2', 'Read Beta', id, 'active', 4 FROM members WHERE public_id = $1::uuid RETURNING public_id::text`, ownerID).Scan(&decidedID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status) SELECT 'C-ADAPTER-UNKNOWN', 'Read Unknown', id, 'active' FROM members WHERE public_id = $1::uuid RETURNING public_id::text`, ownerID).Scan(&unknownID); err != nil {
		t.Fatal(err)
	}
	var decidedInternalID int64
	if err := fixture.Pool.QueryRow(ctx, `SELECT id FROM characters WHERE public_id = $1::uuid`, decidedID).Scan(&decidedInternalID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, note) VALUES ('character', $1, 'approved', (SELECT id FROM members WHERE public_id = $2::uuid), 'verified')`, decidedInternalID, reviewerID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO character_progression_ledger (character_id, delta, reason, note, recorded_by) SELECT character.id, 3, 'pcxp', 'earned', reviewer.id FROM characters character, members reviewer WHERE character.public_id = $1::uuid AND reviewer.public_id = $2::uuid`, pendingID, reviewerID); err != nil {
		t.Fatal(err)
	}
	syncedAt := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Hour)
	mirrorPayload := `{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":"Soldier","proficiencies":[{"kind":"language","name":"Common"},{"kind":"proficiency","name":"Constitution Saving Throws"}]}`
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO character_ddb_mirrors (character_id, payload, synced_at) SELECT id, $2::jsonb, $3 FROM characters WHERE public_id = $1::uuid`, pendingID, mirrorPayload, syncedAt); err != nil {
		t.Fatal(err)
	}
	actor, err := auth.NewAuthority(ownerID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}

	byID, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &pendingID})
	if err != nil || byID == nil || byID.VerificationStatus != CharacterReviewStatusPending || byID.VerificationSubmittedAt == nil || byID.BackstoryId == nil || *byID.BackstoryId != backstoryID {
		t.Fatalf("ReadCharacter by id = %+v, err=%v", byID, err)
	}
	assertCharacterDDBMirror(t, *byID, syncedAt)
	shortCode := "C-ADAPTER-1"
	byShortCode, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{ShortCode: &shortCode})
	if err != nil || byShortCode == nil || byShortCode.Id != pendingID || byShortCode.BackstoryId == nil || *byShortCode.BackstoryId != backstoryID {
		t.Fatalf("ReadCharacter by short code = %+v, err=%v", byShortCode, err)
	}
	assertCharacterDDBMirror(t, *byShortCode, syncedAt)
	byID, err = adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &decidedID})
	if err != nil || byID == nil || byID.BackstoryId != nil || byID.DdbMirror != nil || byID.Proficiencies == nil || len(byID.Proficiencies) != 0 {
		t.Fatalf("ReadCharacter nullable backstory = %+v, err=%v", byID, err)
	}
	unknown, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &unknownID})
	if err != nil || unknown == nil || unknown.VerificationStatus != CharacterReviewStatusUnknown {
		t.Fatalf("ReadCharacter never submitted status = %+v, err=%v", unknown, err)
	}

	status := "active"
	prefix := "Read"
	characters, err := adapter.ReadCharacters(ctx, actor, CharactersSpec{Filters: &CharacterFiltersFields{Status: &status, NamePrefix: &prefix}, Limit: 10})
	if err != nil || characters.Total != 3 || len(characters.Items) != 3 {
		t.Fatalf("ReadCharacters = %+v, err=%v", characters, err)
	}
	assertBackstoryProjection(t, characters.Items, pendingID, backstoryID)
	assertBackstoryProjection(t, characters.Items, decidedID, "")
	assertCharacterDDBMirrorInList(t, characters.Items, pendingID, syncedAt)
	owned, err := adapter.ReadMyCharacters(ctx, actor, MyCharactersSpec{Limit: 10})
	if err != nil || owned.Total != 3 || len(owned.Items) != 3 {
		t.Fatalf("ReadMyCharacters = %+v, err=%v", owned, err)
	}
	assertBackstoryProjection(t, owned.Items, pendingID, backstoryID)
	assertBackstoryProjection(t, owned.Items, decidedID, "")
	assertCharacterDDBMirrorInList(t, owned.Items, pendingID, syncedAt)
	directory, err := adapter.ReadAdminCharacterDirectory(ctx, actor, AdminCharacterDirectorySpec{Filters: &AdminCharacterDirectoryFiltersFields{Status: &status}, Limit: 10})
	if err != nil || directory.Total != 3 || len(directory.Items) != 3 || directory.Items[0].OwnerId != ownerID {
		t.Fatalf("ReadAdminCharacterDirectory = %+v, err=%v", directory, err)
	}
	queue, err := adapter.ReadPendingCharacterVerifications(ctx, actor, PendingCharacterVerificationsSpec{Limit: 10})
	if err != nil || queue.Total != 1 || len(queue.Items) != 1 || queue.Items[0].Id != pendingID || queue.Items[0].VerificationStatus != string(CharacterReviewStatusPending) || queue.Items[0].OwnerHandle == "" {
		t.Fatalf("ReadPendingCharacterVerifications = %+v, err=%v", queue, err)
	}

	progression, err := adapter.ReadCharacterProgression(ctx, actor, CharacterProgressionSpec{CharacterId: pendingID, Limit: 10})
	if err != nil || progression.Total != 1 || len(progression.Items) != 1 || progression.Items[0].Amount == nil || *progression.Items[0].Amount != 3 || progression.Items[0].RecordedBy == nil || *progression.Items[0].RecordedBy != reviewerID {
		t.Fatalf("ReadCharacterProgression = %+v, err=%v", progression, err)
	}
	history, err := adapter.ReadCharacterVerificationHistory(ctx, actor, CharacterVerificationHistorySpec{CharacterId: decidedID, Limit: 10})
	if err != nil || history.Total != 1 || len(history.Items) != 1 || history.Items[0].TargetId != decidedID || history.Items[0].Verdict != "approved" || history.Items[0].VerifiedBy != reviewerID {
		t.Fatalf("ReadCharacterVerificationHistory = %+v, err=%v", history, err)
	}

	batchIDs := []string{pendingID, decidedID}
	for i := 2; i < 50; i++ {
		var id string
		short := fmt.Sprintf("C-ADAPTER-%02d", i)
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status) SELECT $2, $2, id, 'active' FROM members WHERE public_id = $1::uuid RETURNING public_id::text`, ownerID, short).Scan(&id); err != nil {
			t.Fatal(err)
		}
		batchIDs = append(batchIDs, id)
	}
	missingID := "10000000-0000-4000-8000-000000000099"
	counter := &characterReadQueryCounter{DBTX: fixture.Pool}
	batchAdapter, err := NewProductPostgres(counter)
	if err != nil {
		t.Fatal(err)
	}
	for _, width := range []int{1, 10, 50} {
		keys := make([]IDKey, width)
		for i := range keys {
			keys[i] = IDKey{ID: batchIDs[i]}
		}
		counter.queries = 0
		results, err := batchAdapter.ReadBatchCharacters(ctx, actor, keys)
		if err != nil || len(results) != width || counter.queries != 1 {
			t.Fatalf("ReadBatchCharacters width=%d len=%d queries=%d err=%v", width, len(results), counter.queries, err)
		}
		for i, result := range results {
			if result.Value == nil || result.Value.Id != batchIDs[i] {
				t.Fatalf("ReadBatchCharacters width=%d result[%d]=%+v", width, i, result)
			}
		}
		assertCharacterDDBMirror(t, *results[0].Value, syncedAt)
	}
	counter.queries = 0
	batch, err := batchAdapter.ReadBatchCharacters(ctx, actor, []IDKey{{ID: pendingID}, {ID: missingID}, {ID: pendingID}, {ID: "not-a-uuid"}})
	if err != nil || len(batch) != 4 || counter.queries != 1 {
		t.Fatalf("ReadBatchCharacters len=%d queries=%d err=%v", len(batch), counter.queries, err)
	}
	if batch[0].Value == nil || batch[0].Value.Id != pendingID || batch[0].Value.BackstoryId == nil || *batch[0].Value.BackstoryId != backstoryID || batch[1].Value != nil || batch[2].Value == nil || batch[2].Value.Id != pendingID || batch[3].Err == nil {
		t.Fatalf("ReadBatchCharacters positional results = %+v", batch)
	}
	contrast, err := batchAdapter.ReadBatchCharacters(ctx, actor, []IDKey{{ID: pendingID}, {ID: decidedID}})
	if err != nil || len(contrast) != 2 || contrast[0].Value == nil || contrast[0].Value.BackstoryId == nil || *contrast[0].Value.BackstoryId != backstoryID || contrast[1].Value == nil || contrast[1].Value.BackstoryId != nil {
		t.Fatalf("ReadBatchCharacters stored/null backstories = %+v, err=%v", contrast, err)
	}

	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, note) SELECT 'character', id, 'rejected', (SELECT id FROM members WHERE public_id = $2::uuid), 'needs revision' FROM characters WHERE public_id = $1::uuid`, pendingID, reviewerID); err != nil {
		t.Fatal(err)
	}
	rejectedView, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &pendingID})
	if err != nil || rejectedView == nil || rejectedView.VerificationStatus != CharacterReviewStatusRejected {
		t.Fatalf("rejected verification status = %+v, err=%v", rejectedView, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE characters SET verification_submitted_at = clock_timestamp() WHERE public_id = $1::uuid`, pendingID); err != nil {
		t.Fatal(err)
	}
	pendingView, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &pendingID})
	if err != nil || pendingView == nil || pendingView.VerificationStatus != CharacterReviewStatusPending {
		t.Fatalf("resubmitted verification status = %+v, err=%v", pendingView, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, note) SELECT 'character', id, 'approved', (SELECT id FROM members WHERE public_id = $2::uuid), 'verified after resubmission' FROM characters WHERE public_id = $1::uuid`, pendingID, reviewerID); err != nil {
		t.Fatal(err)
	}
	approvedView, err := adapter.ReadCharacter(ctx, actor, CharacterSpec{Id: &pendingID})
	if err != nil || approvedView == nil || approvedView.VerificationStatus != CharacterReviewStatusApproved {
		t.Fatalf("approved verification status = %+v, err=%v", approvedView, err)
	}
	assertCharacterDDBMirror(t, *approvedView, syncedAt)
}

func assertCharacterDDBMirror(t *testing.T, view CharacterView, syncedAt time.Time) {
	t.Helper()
	mirror := view.DdbMirror
	if mirror == nil || mirror.CharacterId != view.Id || mirror.Level == nil || *mirror.Level != 1 || mirror.Xp == nil || *mirror.Xp != 0 || mirror.Species == nil || *mirror.Species != "Goliath" || mirror.Classes == nil || *mirror.Classes != "Barbarian 1" || mirror.Background == nil || *mirror.Background != "Soldier" || mirror.ArmorClass != nil || mirror.MaxHp != nil || mirror.SyncedAt == nil || !mirror.SyncedAt.Equal(syncedAt) {
		t.Fatalf("Character %s DDB mirror = %+v", view.Id, mirror)
	}
	want := []DDBProficiencyView{{Kind: "language", Name: "Common"}, {Kind: "proficiency", Name: "Constitution Saving Throws"}}
	if !reflect.DeepEqual(view.Proficiencies, want) {
		t.Fatalf("Character %s proficiencies = %#v, want %#v", view.Id, view.Proficiencies, want)
	}
}

func assertCharacterDDBMirrorInList(t *testing.T, views []CharacterView, characterID string, syncedAt time.Time) {
	t.Helper()
	for _, view := range views {
		if view.Id == characterID {
			assertCharacterDDBMirror(t, view, syncedAt)
			return
		}
	}
	t.Fatalf("Character %s missing from list", characterID)
}

func assertBackstoryProjection(t *testing.T, views []CharacterView, characterID, want string) {
	t.Helper()
	for _, view := range views {
		if view.Id != characterID {
			continue
		}
		if want == "" && view.BackstoryId == nil {
			return
		}
		if view.BackstoryId != nil && *view.BackstoryId == want {
			return
		}
		t.Fatalf("Character %s backstory = %v, want %q", characterID, view.BackstoryId, want)
	}
	t.Fatalf("Character %s missing from projection", characterID)
}
