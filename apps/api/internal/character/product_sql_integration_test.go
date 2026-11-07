//go:build integration

package character

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

var characterSQLName = regexp.MustCompile(`(?m)^-- name: ([A-Za-z0-9_]+) :[a-z]+\s*$`)
var characterSQLArg = regexp.MustCompile(`sqlc\.(?:narg|arg)\(([A-Za-z0-9_]+)\)`)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintf(os.Stderr, "close owned character product fixture: %v\n", err)
		code = 1
	}
	os.Exit(code)
}

func characterProductQuery(t *testing.T, name string, args map[string]any) (string, []any) {
	t.Helper()
	_, file, _, ok := runtimeCaller()
	if !ok {
		t.Fatal("locate Character SQL integration test")
	}
	path := filepath.Clean(filepath.Join(filepath.Dir(file), "../../db/queries/character_product.sql"))
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	matches := characterSQLName.FindAllSubmatchIndex(source, -1)
	for i, match := range matches {
		queryName := string(source[match[2]:match[3]])
		if queryName != name {
			continue
		}
		start := match[1]
		end := len(source)
		if i+1 < len(matches) {
			end = matches[i+1][0]
		}
		query := strings.TrimSuffix(strings.TrimSpace(string(source[start:end])), ";")
		used := map[string]bool{}
		positions := map[string]int{}
		query = characterSQLArg.ReplaceAllStringFunc(query, func(token string) string {
			parts := characterSQLArg.FindStringSubmatch(token)
			key := parts[1]
			if _, ok := args[key]; !ok {
				t.Fatalf("%s requires named argument %q", name, key)
			}
			used[key] = true
			if positions[key] == 0 {
				positions[key] = len(positions) + 1
			}
			return fmt.Sprintf("$%d", positions[key])
		})
		if len(used) != len(args) {
			for key := range args {
				if !used[key] {
					t.Fatalf("%s received unused named argument %q", name, key)
				}
			}
		}
		ordered := make([]any, len(positions))
		for key, position := range positions {
			ordered[position-1] = args[key]
		}
		return query, ordered
	}
	t.Fatalf("named SQL query %q is absent from %s", name, path)
	return "", nil
}

func runtimeCaller() (uintptr, string, int, bool) {
	return runtime.Caller(1)
}

func TestCharacterProductNamedSQLReadsAndPCXPEffect(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	var ownerID string
	err := fixture.Pool.QueryRow(ctx, `
		INSERT INTO members (discord_id, handle, display_name)
		VALUES ('cha03-owner', 'cha03_owner', 'CHA03 Owner')
		RETURNING public_id::text
	`).Scan(&ownerID)
	if err != nil {
		t.Fatal(err)
	}
	var characterID string
	err = fixture.Pool.QueryRow(ctx, `
		INSERT INTO characters (short_code, name, owner_id, status, player_xp)
		SELECT 'C-CHA03-1', 'Test Character', id, 'active', 3
		FROM members WHERE public_id = $1::uuid
		RETURNING public_id::text
	`, ownerID).Scan(&characterID)
	if err != nil {
		t.Fatal(err)
	}

	query, args := characterProductQuery(t, "CharacterProductByID", map[string]any{"character_id": characterID})
	var projectedID, projectedName, projectedVerificationStatus string
	err = fixture.Pool.QueryRow(ctx, "SELECT id, name, verification_status FROM ("+query+") AS character_projection", args...).Scan(&projectedID, &projectedName, &projectedVerificationStatus)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(projectedID, characterID) {
		t.Fatalf("projected id = %v, want %s", projectedID, characterID)
	}
	if projectedName != "Test Character" {
		t.Fatalf("projected name = %v", projectedName)
	}
	if projectedVerificationStatus != "UNKNOWN" {
		t.Fatalf("unassessed verification status = %s, want UNKNOWN", projectedVerificationStatus)
	}
	query, args = characterProductQuery(t, "CharacterProductByShortCode", map[string]any{"short_code": "C-CHA03-1"})
	var shortCodeID, shortCodeName string
	if err := fixture.Pool.QueryRow(ctx, "SELECT id, name FROM ("+query+") AS short_code_projection", args...).Scan(&shortCodeID, &shortCodeName); err != nil {
		t.Fatal(err)
	}
	if shortCodeID != characterID || shortCodeName != "Test Character" {
		t.Fatalf("short-code read returned id=%s name=%s", shortCodeID, shortCodeName)
	}
	query, args = characterProductQuery(t, "CharacterProductList", map[string]any{
		"owner_id":         ownerID,
		"character_status": "active",
		"name_prefix":      "Test",
		"region_id":        nil,
		"guild_id":         nil,
		"row_limit":        int32(10),
		"row_offset":       int32(0),
	})
	var listedCharacterID, listedCharacterName string
	if err := fixture.Pool.QueryRow(ctx, "SELECT id, name FROM ("+query+") AS list_projection", args...).Scan(&listedCharacterID, &listedCharacterName); err != nil {
		t.Fatal(err)
	}
	if listedCharacterID != characterID || listedCharacterName != "Test Character" {
		t.Fatalf("filtered list returned id=%s name=%s", listedCharacterID, listedCharacterName)
	}
	query, args = characterProductQuery(t, "CharacterProductCount", map[string]any{
		"owner_id":         ownerID,
		"character_status": "active",
		"name_prefix":      "Test",
		"region_id":        nil,
		"guild_id":         nil,
	})
	var characterTotal int32
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&characterTotal); err != nil {
		t.Fatal(err)
	}
	if characterTotal != 1 {
		t.Fatalf("filtered character count = %d, want 1", characterTotal)
	}
	query, args = characterProductQuery(t, "CharacterProductMyCharacters", map[string]any{
		"owner_id":   ownerID,
		"row_limit":  int32(10),
		"row_offset": int32(0),
	})
	var myCharacterID, myCharacterName, myVerificationStatus string
	if err := fixture.Pool.QueryRow(ctx, "SELECT id, name, verification_status FROM ("+query+") AS my_character_projection", args...).Scan(&myCharacterID, &myCharacterName, &myVerificationStatus); err != nil {
		t.Fatal(err)
	}
	if myCharacterID != characterID || myCharacterName != "Test Character" || myVerificationStatus != "UNKNOWN" {
		t.Fatalf("my-character read returned id=%s name=%s verification=%s", myCharacterID, myCharacterName, myVerificationStatus)
	}
	query, args = characterProductQuery(t, "CharacterProductCountMyCharacters", map[string]any{"owner_id": ownerID})
	var myCharacterTotal int32
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&myCharacterTotal); err != nil {
		t.Fatal(err)
	}
	if myCharacterTotal != 1 {
		t.Fatalf("my-character count = %d, want 1", myCharacterTotal)
	}
	query, args = characterProductQuery(t, "CharacterProductAdminDirectory", map[string]any{
		"name_prefix":      "Test",
		"region_id":        nil,
		"character_status": nil,
		"row_limit":        int32(10),
		"row_offset":       int32(0),
	})
	var adminCharacterID, adminName, adminOwnerID, adminOwnerHandle, adminOwnerDisplayName, adminShortCode, adminStatus, adminVerificationStatus string
	var adminOwnerAvatar, adminRegionID, adminRegionName, adminGuildID, adminDdbURL sql.NullString
	var adminSubmittedAt sql.NullTime
	var adminUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&adminCharacterID, &adminName, &adminOwnerID, &adminOwnerHandle, &adminOwnerDisplayName,
		&adminOwnerAvatar, &adminShortCode, &adminStatus, &adminRegionID, &adminRegionName,
		&adminGuildID, &adminVerificationStatus, &adminSubmittedAt, &adminDdbURL, &adminUpdatedAt,
	); err != nil {
		t.Fatal(err)
	}
	if adminCharacterID != characterID || adminOwnerID != ownerID || adminVerificationStatus != "UNKNOWN" || adminRegionName.Valid {
		t.Fatalf("admin directory returned id=%s owner=%s verification=%s region=%v", adminCharacterID, adminOwnerID, adminVerificationStatus, adminRegionName)
	}
	query, args = characterProductQuery(t, "CharacterProductCountAdminDirectory", map[string]any{
		"name_prefix":      "Test",
		"region_id":        nil,
		"character_status": nil,
	})
	var adminTotal int32
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&adminTotal); err != nil {
		t.Fatal(err)
	}
	if adminTotal != 1 {
		t.Fatalf("admin directory count = %d, want 1", adminTotal)
	}
	var verificationID string
	if err := fixture.Pool.QueryRow(ctx, `
		INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, note)
		SELECT 'character', character.id, 'rejected', owner.id, 'fixture decision'
		FROM characters character, members owner
		WHERE character.public_id = $1::uuid AND owner.public_id = $2::uuid
		RETURNING public_id::text
	`, characterID, ownerID).Scan(&verificationID); err != nil {
		t.Fatal(err)
	}
	query, args = characterProductQuery(t, "CharacterProductListVerificationHistory", map[string]any{
		"character_id": characterID,
		"row_limit":    int32(10),
		"row_offset":   int32(0),
	})
	var historyID, historySubjectType, historySubjectID, historyDecision, historyDecider string
	var historyNote sql.NullString
	var historyCreatedAt time.Time
	var historyEvidenceID sql.NullString
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&historyID, &historySubjectType, &historySubjectID, &historyDecision, &historyDecider,
		&historyNote, &historyCreatedAt, &historyEvidenceID,
	); err != nil {
		t.Fatal(err)
	}
	if historyID != verificationID || historySubjectType != "character" || historySubjectID != characterID || historyDecision != "rejected" || historyDecider != ownerID {
		t.Fatalf("verification history returned id=%s subject=%s/%s decision=%s decider=%s", historyID, historySubjectType, historySubjectID, historyDecision, historyDecider)
	}
	query, args = characterProductQuery(t, "CharacterProductByID", map[string]any{"character_id": characterID})
	var rejectedStatus string
	if err := fixture.Pool.QueryRow(ctx, "SELECT verification_status FROM ("+query+") AS latest_character", args...).Scan(&rejectedStatus); err != nil {
		t.Fatal(err)
	}
	if rejectedStatus != "REJECTED" {
		t.Fatalf("latest character verification status = %s, want REJECTED", rejectedStatus)
	}
	var guildID string
	err = fixture.Pool.QueryRow(ctx, `
		INSERT INTO documents (kind, slug, title, status)
		VALUES ('codex_entry', 'cha03-guild', 'CHA03 Guild', 'published')
		RETURNING public_id::text
	`).Scan(&guildID)
	if err != nil {
		t.Fatal(err)
	}
	query, args = characterProductQuery(t, "CharacterProductSetGuild", map[string]any{
		"character_id": characterID,
		"guild_id":     guildID,
		"at":           time.Now().UTC(),
	})
	var linkedCharacterID, linkedShortCode, linkedName, linkedOwnerID, linkedStatus, linkedGuildID string
	var linkedRegionID, linkedDescription, linkedDdbURL, linkedVerificationSubmittedAt sql.NullString
	var linkedPCXP int32
	var linkedCreatedAt, linkedUpdatedAt time.Time
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&linkedCharacterID, &linkedShortCode, &linkedName, &linkedOwnerID, &linkedStatus,
		&linkedRegionID, &linkedGuildID, &linkedDescription, &linkedDdbURL, &linkedPCXP,
		&linkedCreatedAt, &linkedUpdatedAt, &linkedVerificationSubmittedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if linkedCharacterID != characterID || linkedGuildID != guildID {
		t.Fatalf("guild link returned character=%s guild=%s", linkedCharacterID, linkedGuildID)
	}
	query, args = characterProductQuery(t, "CharacterProductClearGuild", map[string]any{
		"character_id": characterID,
		"at":           time.Now().UTC(),
	})
	var clearedCharacterID, clearedShortCode, clearedName, clearedOwnerID, clearedStatus string
	var clearedRegionID, clearedGuildID, clearedDescription, clearedDdbURL, clearedVerificationSubmittedAt sql.NullString
	var clearedPCXP int32
	var clearedCreatedAt, clearedUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&clearedCharacterID, &clearedShortCode, &clearedName, &clearedOwnerID, &clearedStatus,
		&clearedRegionID, &clearedGuildID, &clearedDescription, &clearedDdbURL, &clearedPCXP,
		&clearedCreatedAt, &clearedUpdatedAt, &clearedVerificationSubmittedAt,
	); err != nil {
		t.Fatal(err)
	}
	if clearedCharacterID != characterID || clearedGuildID.Valid {
		t.Fatalf("guild unlink returned character=%s guild=%v", clearedCharacterID, clearedGuildID)
	}

	query, args = characterProductQuery(t, "CharacterProductAdjustPCXP", map[string]any{
		"character_id": characterID,
		"amount":       int32(4),
		"reason":       "test award",
		"note":         "earned",
		"actor_id":     ownerID,
	})
	var entryID, entryCharacterID, kind, note, actorID string
	var amount int32
	var progressionQuestID *string
	var recordedAt time.Time
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(&entryID, &entryCharacterID, &amount, &kind, &note, &progressionQuestID, &recordedAt, &actorID)
	if err != nil {
		t.Fatal(err)
	}
	if amount != 4 || kind != "pcxp" || note != "earned" || entryCharacterID != characterID || actorID != ownerID {
		t.Fatalf("adjustment returned entry=%s character=%s amount=%d kind=%s note=%s actor=%s", entryID, entryCharacterID, amount, kind, note, actorID)
	}
	var cached int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT player_xp FROM characters WHERE public_id = $1::uuid`, characterID).Scan(&cached); err != nil {
		t.Fatal(err)
	}
	if cached != 7 {
		t.Fatalf("cached player_xp = %d, want 7", cached)
	}

	query, args = characterProductQuery(t, "CharacterProductListProgression", map[string]any{
		"character_id": characterID,
		"row_limit":    int32(10),
		"row_offset":   int32(0),
	})
	rows, err := fixture.Pool.Query(ctx, query, args...)
	if err != nil {
		t.Fatal(err)
	}
	if !rows.Next() {
		rows.Close()
		t.Fatal("actual CharacterProductListProgression source omitted the inserted ledger entry")
	}
	var listedID, listedCharacter string
	var listedAmount int32
	var listedKind string
	var listedNote *string
	var listedQuest *string
	var listedAt time.Time
	var listedBy *string
	if err := rows.Scan(&listedID, &listedCharacter, &listedAmount, &listedKind, &listedNote, &listedQuest, &listedAt, &listedBy); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	if listedID != entryID || listedCharacter != characterID || listedAmount != 4 || listedNote == nil || *listedNote != "earned" || listedBy == nil || *listedBy != ownerID {
		t.Fatalf("progression history does not preserve the inserted ledger values")
	}

	query, args = characterProductQuery(t, "CharacterProductAdjustPCXP", map[string]any{
		"character_id": characterID,
		"amount":       int32(-8),
		"reason":       "invalid underflow",
		"note":         nil,
		"actor_id":     ownerID,
	})
	if _, err := fixture.Pool.Exec(ctx, query, args...); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `SELECT player_xp FROM characters WHERE public_id = $1::uuid`, characterID).Scan(&cached); err != nil {
		t.Fatal(err)
	}
	if cached != 7 {
		t.Fatalf("underflow attempt changed player_xp to %d", cached)
	}
}

func TestCharacterProductCatalogDowntimeAndLifecycleSQL(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	var ownerID, characterID string
	err := fixture.Pool.QueryRow(ctx, `
		INSERT INTO members (discord_id, handle, display_name)
		VALUES ('cha03-lifecycle-owner', 'cha03_lifecycle_owner', 'CHA03 Lifecycle Owner')
		RETURNING public_id::text
	`).Scan(&ownerID)
	if err != nil {
		t.Fatal(err)
	}
	err = fixture.Pool.QueryRow(ctx, `
		INSERT INTO characters (short_code, name, owner_id, status)
		SELECT 'C-CHA03-2', 'Lifecycle Character', id, 'pending_approval'
		FROM members WHERE public_id = $1::uuid
		RETURNING public_id::text
	`, ownerID).Scan(&characterID)
	if err != nil {
		t.Fatal(err)
	}

	query, args := characterProductQuery(t, "CharacterProductUpsertCreationCatalogEntry", map[string]any{
		"kind":        "species",
		"name":        "CHA03 Species",
		"available":   true,
		"description": nil,
		"region_id":   nil,
		"retired":     false,
		"option_id":   nil,
	})
	var catalogID, catalogKind, catalogName string
	var catalogAvailable, catalogRetired bool
	var catalogDescription, catalogRegionID sql.NullString
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&catalogID, &catalogKind, &catalogName, &catalogAvailable,
		&catalogDescription, &catalogRegionID, &catalogRetired,
	)
	if err != nil {
		t.Fatal(err)
	}
	if catalogKind != "species" || catalogName != "CHA03 Species" || !catalogAvailable || catalogRetired {
		t.Fatalf("catalog insert returned kind=%s name=%s available=%t retired=%t", catalogKind, catalogName, catalogAvailable, catalogRetired)
	}
	query, args = characterProductQuery(t, "CharacterProductUpsertCreationCatalogEntry", map[string]any{
		"kind":        "species",
		"name":        "CHA03 Species Updated",
		"available":   false,
		"description": "retired from selection",
		"region_id":   nil,
		"retired":     true,
		"option_id":   catalogID,
	})
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&catalogID, &catalogKind, &catalogName, &catalogAvailable,
		&catalogDescription, &catalogRegionID, &catalogRetired,
	)
	if err != nil {
		t.Fatal(err)
	}
	if catalogName != "CHA03 Species Updated" || catalogAvailable || !catalogRetired || !catalogDescription.Valid || catalogDescription.String != "retired from selection" {
		t.Fatalf("catalog update returned name=%s available=%t retired=%t description=%v", catalogName, catalogAvailable, catalogRetired, catalogDescription)
	}

	query, args = characterProductQuery(t, "CharacterProductInsertDowntimeProject", map[string]any{
		"character_id": characterID,
		"name":         "CHA03 Project",
		"target":       int32(4),
		"goal":         "Complete",
		"notes":        nil,
		"progress":     int32(1),
		"status":       "active",
		"at":           time.Now().UTC(),
	})
	var projectID, projectCharacterID, projectName, projectStatus string
	var projectTarget sql.NullInt32
	var projectGoal, projectNotes sql.NullString
	var projectProgress int32
	var projectUpdatedAt time.Time
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&projectID, &projectCharacterID, &projectName, &projectTarget, &projectGoal,
		&projectNotes, &projectProgress, &projectStatus, &projectUpdatedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if projectCharacterID != characterID || projectName != "CHA03 Project" || !projectTarget.Valid || projectTarget.Int32 != 4 {
		t.Fatalf("downtime insert returned character=%s name=%s target=%v", projectCharacterID, projectName, projectTarget)
	}
	query, args = characterProductQuery(t, "CharacterProductUpdateDowntimeProject", map[string]any{
		"character_id": characterID,
		"project_id":   projectID,
		"name":         "CHA03 Project Updated",
		"target":       nil,
		"goal":         nil,
		"notes":        "manual progress",
		"progress":     int32(3),
		"status":       "active",
		"at":           time.Now().UTC(),
	})
	err = fixture.Pool.QueryRow(ctx, query, args...).Scan(
		&projectID, &projectCharacterID, &projectName, &projectTarget, &projectGoal,
		&projectNotes, &projectProgress, &projectStatus, &projectUpdatedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if projectName != "CHA03 Project Updated" || projectTarget.Valid || projectGoal.Valid || !projectNotes.Valid || projectNotes.String != "manual progress" || projectProgress != 3 {
		t.Fatalf("downtime update returned name=%s target=%v goal=%v notes=%v progress=%d", projectName, projectTarget, projectGoal, projectNotes, projectProgress)
	}

	var expectedUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, `SELECT updated_at FROM characters WHERE public_id = $1::uuid`, characterID).Scan(&expectedUpdatedAt); err != nil {
		t.Fatal(err)
	}
	query, args = characterProductQuery(t, "CharacterProductSubmitForVerification", map[string]any{
		"character_id":        characterID,
		"expected_updated_at": expectedUpdatedAt,
		"at":                  time.Now().UTC(),
	})
	var submittedID string
	var submittedAt, submittedUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&submittedID, &submittedAt, &submittedUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if submittedID != characterID || !submittedAt.Equal(submittedUpdatedAt) {
		t.Fatalf("verification submit returned id=%s submitted=%s updated=%s", submittedID, submittedAt, submittedUpdatedAt)
	}

	query, args = characterProductQuery(t, "CharacterProductDelete", map[string]any{
		"character_id": characterID,
		"actor_id":     ownerID,
		"at":           time.Now().UTC(),
	})
	var deletedID string
	var deletedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&deletedID, &deletedAt); err != nil {
		t.Fatal(err)
	}
	query, args = characterProductQuery(t, "CharacterProductRestore", map[string]any{
		"character_id": characterID,
		"at":           time.Now().UTC(),
	})
	var restoredID string
	var restoredAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&restoredID, &restoredAt); err != nil {
		t.Fatal(err)
	}
	if deletedID != restoredID || restoredID != characterID || !restoredAt.After(deletedAt) {
		t.Fatalf("delete/restore returned deleted=%s restored=%s deletedAt=%s restoredAt=%s", deletedID, restoredID, deletedAt, restoredAt)
	}
	query, args = characterProductQuery(t, "CharacterProductRetire", map[string]any{
		"character_id":        characterID,
		"expected_updated_at": restoredAt,
		"at":                  time.Now().UTC(),
	})
	var retiredID, retiredStatus string
	var retiredUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&retiredID, &retiredStatus, &retiredUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if retiredID != characterID || retiredStatus != "retired" || !retiredUpdatedAt.After(restoredAt) {
		t.Fatalf("retire returned id=%s status=%s updatedAt=%s", retiredID, retiredStatus, retiredUpdatedAt)
	}
}

func TestCharacterProductRetireDropsOpenVerification(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	var ownerID, reviewerID string
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha03-retire-owner', 'cha03_retire_owner', 'Retire Owner') RETURNING public_id::text`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha03-retire-reviewer', 'cha03_retire_reviewer', 'Retire Reviewer') RETURNING public_id::text`).Scan(&reviewerID); err != nil {
		t.Fatal(err)
	}
	insert := func(code, name, status string, submitted *time.Time) (string, time.Time) {
		t.Helper()
		var id string
		var updated time.Time
		if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status, verification_submitted_at) SELECT $2, $3, id, $4, $5 FROM members WHERE public_id = $1::uuid RETURNING public_id::text, updated_at`, ownerID, code, name, status, submitted).Scan(&id, &updated); err != nil {
			t.Fatal(err)
		}
		return id, updated
	}
	retire := func(characterID string, expected time.Time) {
		t.Helper()
		query, args := characterProductQuery(t, "CharacterProductRetire", map[string]any{
			"character_id": characterID, "expected_updated_at": expected, "at": time.Now().UTC(),
		})
		var id, status string
		if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&id, &status, new(time.Time)); err != nil {
			t.Fatal(err)
		}
		if id != characterID || status != "retired" {
			t.Fatalf("retire %s returned id=%s status=%s", characterID, id, status)
		}
	}
	submittedAt := func(characterID string) sql.NullTime {
		t.Helper()
		var at sql.NullTime
		if err := fixture.Pool.QueryRow(ctx, `SELECT verification_submitted_at FROM characters WHERE public_id = $1::uuid`, characterID).Scan(&at); err != nil {
			t.Fatal(err)
		}
		return at
	}
	queued := func() map[string]struct{} {
		t.Helper()
		query, args := characterProductQuery(t, "CharacterProductPendingVerificationDirectory", map[string]any{"row_limit": int32(20), "row_offset": int32(0)})
		rows, err := fixture.Pool.Query(ctx, "SELECT id FROM ("+query+") AS pending_rows", args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		ids := map[string]struct{}{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			ids[id] = struct{}{}
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return ids
	}

	base := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Hour)
	openAt := base
	openID, openUpdated := insert("C-RETIRE-OPEN", "Open Request", "pending_approval", &openAt)
	plainID, plainUpdated := insert("C-RETIRE-NONE", "No Request", "active", nil)
	approvedAt := base.Add(time.Minute)
	approvedID, approvedUpdated := insert("C-RETIRE-APPROVED", "Approved Request", "active", &approvedAt)
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, created_at) VALUES ('character', (SELECT id FROM characters WHERE public_id = $1::uuid), 'approved', (SELECT id FROM members WHERE public_id = $2::uuid), $3)`, approvedID, reviewerID, approvedAt.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, ok := queued()[openID]; !ok {
		t.Fatal("open approval request missing from review queue")
	}
	if _, ok := queued()[approvedID]; ok {
		t.Fatal("approved request is in the review queue")
	}

	retire(openID, openUpdated)
	retire(plainID, plainUpdated)
	retire(approvedID, approvedUpdated)

	if _, ok := queued()[openID]; ok {
		t.Fatal("retired character stayed in the review queue")
	}
	if got := submittedAt(openID); got.Valid {
		t.Fatalf("open submission = %s, want cleared", got.Time)
	}
	if got := submittedAt(plainID); got.Valid {
		t.Fatalf("character with no request gained submission %s", got.Time)
	}
	if got := submittedAt(approvedID); !got.Valid || !got.Time.Equal(approvedAt) {
		t.Fatalf("approved submission = %+v, want %s", got, approvedAt)
	}
	var decisions int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT count(*)::int FROM verifications verification JOIN characters character ON character.id = verification.subject_id WHERE character.public_id = $1::uuid`, approvedID).Scan(&decisions); err != nil {
		t.Fatal(err)
	}
	if decisions != 1 {
		t.Fatalf("approved verification rows = %d, want 1", decisions)
	}
}

func TestCharacterProductPendingVerificationUsesCurrentSubmission(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	var ownerID, reviewerID string
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha03-pending-owner', 'cha03_pending_owner', 'Pending Owner') RETURNING public_id::text`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO members (discord_id, handle, display_name) VALUES ('cha03-pending-reviewer', 'cha03_pending_reviewer', 'Pending Reviewer') RETURNING public_id::text`).Scan(&reviewerID); err != nil {
		t.Fatal(err)
	}
	var characterID string
	var initialUpdatedAt time.Time
	if err := fixture.Pool.QueryRow(ctx, `INSERT INTO characters (short_code, name, owner_id, status) SELECT 'C-CHA03-PENDING', 'Pending Token', id, 'pending_approval' FROM members WHERE public_id = $1::uuid RETURNING public_id::text, updated_at`, ownerID).Scan(&characterID, &initialUpdatedAt); err != nil {
		t.Fatal(err)
	}
	base := time.Now().UTC().Truncate(time.Microsecond).Add(-time.Minute)
	submit := func(at, expected time.Time) {
		t.Helper()
		query, args := characterProductQuery(t, "CharacterProductSubmitForVerification", map[string]any{
			"at": at, "character_id": characterID, "expected_updated_at": expected,
		})
		var gotID string
		if err := fixture.Pool.QueryRow(ctx, query, args...).Scan(&gotID, new(time.Time), new(time.Time)); err != nil {
			t.Fatal(err)
		}
		if gotID != characterID {
			t.Fatalf("submission updated %s, want %s", gotID, characterID)
		}
	}
	readQueue := func(want int32) {
		t.Helper()
		query, args := characterProductQuery(t, "CharacterProductPendingVerificationDirectory", map[string]any{"row_limit": int32(10), "row_offset": int32(0)})
		rows, err := fixture.Pool.Query(ctx, "SELECT id, verification_status FROM ("+query+") AS pending_rows", args...)
		if err != nil {
			t.Fatal(err)
		}
		var ids []string
		for rows.Next() {
			var id, status string
			if err := rows.Scan(&id, &status); err != nil {
				rows.Close()
				t.Fatal(err)
			}
			if status != "PENDING" {
				rows.Close()
				t.Fatalf("queue status = %s, want PENDING", status)
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		rows.Close()
		if int32(len(ids)) != want {
			t.Fatalf("queue page contains %d rows, want %d (ids=%v)", len(ids), want, ids)
		}
		countQuery, countArgs := characterProductQuery(t, "CharacterProductCountPendingVerifications", map[string]any{})
		var count int32
		if err := fixture.Pool.QueryRow(ctx, countQuery, countArgs...).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("queue count = %d, want %d", count, want)
		}
	}
	firstSubmission := base.Add(time.Second)
	submit(firstSubmission, initialUpdatedAt)
	readQueue(1)
	var internalID int64
	if err := fixture.Pool.QueryRow(ctx, `SELECT id FROM characters WHERE public_id = $1::uuid`, characterID).Scan(&internalID); err != nil {
		t.Fatal(err)
	}
	oldDecision := firstSubmission.Add(time.Second)
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, created_at) VALUES ('character', $1, 'rejected', (SELECT id FROM members WHERE public_id = $2::uuid), $3)`, internalID, reviewerID, oldDecision); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE characters SET updated_at = $2 WHERE public_id = $1::uuid`, characterID, oldDecision); err != nil {
		t.Fatal(err)
	}
	readQueue(0)
	resubmission := oldDecision.Add(time.Second)
	submit(resubmission, oldDecision)
	readQueue(1)
	query, args := characterProductQuery(t, "CharacterProductByID", map[string]any{"character_id": characterID})
	var status string
	if err := fixture.Pool.QueryRow(ctx, "SELECT verification_status FROM ("+query+") AS current_status", args...).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "PENDING" {
		t.Fatalf("resubmission status = %s, want PENDING despite older rejection", status)
	}
	newDecision := resubmission.Add(time.Second)
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO verifications (subject_type, subject_id, verdict, decided_by, created_at) VALUES ('character', $1, 'approved', (SELECT id FROM members WHERE public_id = $2::uuid), $3)`, internalID, reviewerID, newDecision); err != nil {
		t.Fatal(err)
	}
	readQueue(0)
}

// CHA03 owns this file and the exact edit limits in its implementation handoff.
// Responsibility: Complete named set SQL projections, filters,count,page,locks,writes,histories; sqlc sources.
// Dependencies: P04, CHA02.
// Acceptance: TASK-CHA03, AUTH-character, BATCH-character. No runtime behavior is implemented.
// Exact declarations: apps/api/docs/design/graphql-product/go-seams.json.
// Task handoff: .local/plans/graphql-implementation/phase2/handoffs/CHA03.json.
