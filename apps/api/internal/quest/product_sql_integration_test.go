//go:build integration

package quest

import (
	"context"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		_, _ = os.Stderr.WriteString("close product fixture: " + err.Error() + "\n")
		if code == 0 {
			code = 1
		}
	}
	os.Exit(code)
}

func TestProductQuestDisplayStatusAtExecutesOwnedSQL(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	query := productNamedSQL(t, "ProductQuestDisplayStatusAt")
	ctx := context.Background()
	var got string
	err := fixture.Pool.QueryRow(ctx, query, pgx.StrictNamedArgs{
		"status": "open", "filled_count": int32(1),
		"scheduled_at":   time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC),
		"duration_hours": float64(4), "as_of": time.Date(2026, 10, 17, 13, 0, 0, 0, time.UTC),
	}).Scan(&got)
	if err != nil {
		t.Fatalf("execute owned display-status SQL: %v", err)
	}
	if got != "live" {
		t.Fatalf("display status = %q, want live", got)
	}
}

func TestProductQuestDmSummariesRequiresQuestDMAuthorshipAndDocumentReadability(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	const dmID = "10000000-0000-4000-8000-000000000001"
	const otherDMID = "10000000-0000-4000-8000-000000000002"
	const questID = "10000000-0000-4000-8000-000000000010"
	_, err := fixture.Pool.Exec(ctx, `
		INSERT INTO members(public_id,discord_id,handle,display_name,roles)
		VALUES ($1,'dm-one','dm-one','DM One',ARRAY['dm']),
		       ($2,'dm-two','dm-two','DM Two',ARRAY['dm']);`, db.MustUUID(dmID), db.MustUUID(otherDMID))
	if err != nil {
		t.Fatalf("insert DM members: %v", err)
	}
	_, err = fixture.Pool.Exec(ctx, `
		INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id)
		SELECT $1,'quest_brief','brief-one','Brief','published','public','',m.id FROM members m WHERE m.public_id=$2;`,
		db.MustUUID("10000000-0000-4000-8000-000000000011"), db.MustUUID(dmID))
	if err != nil {
		t.Fatalf("insert Quest brief: %v", err)
	}
	_, err = fixture.Pool.Exec(ctx, `
		INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by)
		SELECT $2,'Q-TEST',ARRAY['standard'],dm.id,'2030-01-01T00:00:00Z'::timestamptz,d.id,dm.id
		FROM members dm CROSS JOIN documents d
		WHERE dm.public_id=$3 AND d.public_id=$1;`,
		db.MustUUID("10000000-0000-4000-8000-000000000011"), db.MustUUID(questID), db.MustUUID(dmID))
	if err != nil {
		t.Fatalf("insert Quest and brief: %v", err)
	}
	_, err = fixture.Pool.Exec(ctx, `
		UPDATE quests SET tags=ARRAY['north'], genres=ARRAY['mystery'], slots_max=2
		WHERE public_id=$1;`, db.MustUUID(questID))
	if err != nil {
		t.Fatalf("set Quest filter metadata: %v", err)
	}
	assertQuestReadFiltersAndPages(t, fixture, questID, dmID)
	assertQuestSignupCapacityAndRoster(t, fixture, questID, dmID)
	_, err = fixture.Pool.Exec(ctx, `
		INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id)
		SELECT v.public_id, 'summary', v.slug, v.title, 'published', v.visibility, v.body, author.id
		FROM (VALUES
		    ($8::uuid, 'backslash-summary'::text, '100\ literal'::text, 'public'::text, 'backslash'::text, $2::uuid),
		    ($7::uuid, 'underscore-summary'::text, '100_ literal'::text, 'public'::text, 'underscore'::text, $2::uuid),
		    ($6::uuid, 'percent-summary'::text, '100% literal'::text, 'public'::text, 'percent'::text, $2::uuid),
		    ($1::uuid, 'dm-summary-one'::text, 'Visible summary'::text, 'public'::text, 'visible'::text, $2::uuid),
		    ($3::uuid, 'other-dm-summary'::text, 'Wrong author'::text, 'public'::text, 'wrong'::text, $4::uuid),
		    ($5::uuid, 'private-dm-summary'::text, 'Unreadable summary'::text, 'restricted'::text, 'private'::text, $2::uuid)
		) AS v(public_id, slug, title, visibility, body, author_public_id)
		JOIN members author ON author.public_id = v.author_public_id;`,
		db.MustUUID("10000000-0000-4000-8000-000000000012"), db.MustUUID(dmID),
		db.MustUUID("10000000-0000-4000-8000-000000000013"), db.MustUUID(otherDMID),
		db.MustUUID("10000000-0000-4000-8000-000000000014"),
		db.MustUUID("10000000-0000-4000-8000-000000000015"),
		db.MustUUID("10000000-0000-4000-8000-000000000016"),
		db.MustUUID("10000000-0000-4000-8000-000000000017"))
	if err != nil {
		t.Fatalf("insert summary documents: %v", err)
	}
	_, err = fixture.Pool.Exec(ctx, `
		INSERT INTO document_links(source_id,quest_target_id,relation)
		SELECT d.id,q.id,'summary' FROM documents d CROSS JOIN quests q
		WHERE d.public_id=ANY($1::uuid[]) AND q.public_id=$2;`,
		[]pgtype.UUID{db.MustUUID("10000000-0000-4000-8000-000000000012"), db.MustUUID("10000000-0000-4000-8000-000000000013"), db.MustUUID("10000000-0000-4000-8000-000000000014"), db.MustUUID("10000000-0000-4000-8000-000000000015"), db.MustUUID("10000000-0000-4000-8000-000000000016"), db.MustUUID("10000000-0000-4000-8000-000000000017")}, db.MustUUID(questID))
	if err != nil {
		t.Fatalf("insert linked summaries: %v", err)
	}
	_, err = fixture.Pool.Exec(ctx, `
		UPDATE documents SET created_at=$1, updated_at=$1
		WHERE public_id = ANY($2::uuid[]);`,
		time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC),
		[]pgtype.UUID{db.MustUUID("10000000-0000-4000-8000-000000000012"), db.MustUUID("10000000-0000-4000-8000-000000000015"), db.MustUUID("10000000-0000-4000-8000-000000000016"), db.MustUUID("10000000-0000-4000-8000-000000000017")})
	if err != nil {
		t.Fatalf("set equal summary timestamps: %v", err)
	}

	query := productNamedSQL(t, "ProductQuestDmSummariesPage")
	args := pgx.StrictNamedArgs{
		"viewer_admin": false, "viewer_id": nil, "viewer_roles": []string{"player"},
		"viewer_handle": "", "viewer_live_dm": false, "reader_ids": []pgtype.UUID{},
		"dm_id": db.MustUUID(dmID), "quest_id": db.MustUUID(questID), "search": nil,
		"row_limit": int32(10), "row_offset": int32(0),
	}
	total, titles, emptyPage := readProductDMSummaryPage(t, fixture, query, args)
	wantTitles := []string{"100\\ literal", "100_ literal", "100% literal", "Visible summary"}
	if total != int64(len(wantTitles)) || emptyPage || len(titles) != len(wantTitles) {
		t.Fatalf("DM summary total/page = %d/%v (empty page %v), want four readable summaries authored by the Quest DM", total, titles, emptyPage)
	}
	for i, want := range wantTitles {
		if titles[i] != want {
			t.Fatalf("DM summary order = %v, want %v (equal timestamps use descending public UUID)", titles, wantTitles)
		}
	}
	for search, want := range map[string]string{"%": "100% literal", "_": "100_ literal", "\\": "100\\ literal"} {
		searchArgs := pgx.StrictNamedArgs{
			"viewer_admin": false, "viewer_id": nil, "viewer_roles": []string{"player"},
			"viewer_handle": "", "viewer_live_dm": false, "reader_ids": []pgtype.UUID{},
			"dm_id": db.MustUUID(dmID), "quest_id": db.MustUUID(questID), "search": search,
			"row_limit": int32(10), "row_offset": int32(0),
		}
		searchTotal, matches, searchEmpty := readProductDMSummaryPage(t, fixture, query, searchArgs)
		if searchTotal != 1 || searchEmpty || len(matches) != 1 || matches[0] != want {
			t.Errorf("literal search %q returned total/page %d/%v (empty page %v), want only %q", search, searchTotal, matches, searchEmpty, want)
		}
	}

	pageArgs := pgx.StrictNamedArgs{
		"viewer_admin": false, "viewer_id": nil, "viewer_roles": []string{"player"},
		"viewer_handle": "", "viewer_live_dm": false, "reader_ids": []pgtype.UUID{},
		"dm_id": db.MustUUID(dmID), "quest_id": db.MustUUID(questID), "search": nil,
		"row_limit": int32(1), "row_offset": int32(0),
	}
	firstTotal, firstPage, firstEmpty := readProductDMSummaryPage(t, fixture, query, pageArgs)
	if firstTotal != 4 || firstEmpty || len(firstPage) != 1 || firstPage[0] != "100\\ literal" {
		t.Fatalf("first DM-summary page = total %d, page %v, empty %v; want total four and the greatest public UUID", firstTotal, firstPage, firstEmpty)
	}
	pageArgs["row_offset"] = int32(1)
	secondTotal, secondPage, secondEmpty := readProductDMSummaryPage(t, fixture, query, pageArgs)
	if secondTotal != 4 || secondEmpty || len(secondPage) != 1 || secondPage[0] != "100_ literal" {
		t.Fatalf("second DM-summary page = total %d, page %v, empty %v; want total four and the next public UUID", secondTotal, secondPage, secondEmpty)
	}
	pageArgs["row_offset"] = int32(9)
	emptyTotal, emptyTitles, countPreserved := readProductDMSummaryPage(t, fixture, query, pageArgs)
	if emptyTotal != 4 || !countPreserved || len(emptyTitles) != 0 {
		t.Fatalf("past-end DM-summary page = total %d, page %v, empty %v; want count four and an empty page", emptyTotal, emptyTitles, countPreserved)
	}

	ownerArgs := pgx.StrictNamedArgs{
		"viewer_admin": false, "viewer_id": db.MustUUID(dmID), "viewer_roles": []string{"dm"},
		"viewer_handle": "dm-one", "viewer_live_dm": false, "reader_ids": []pgtype.UUID{},
		"dm_id": db.MustUUID(dmID), "quest_id": db.MustUUID(questID), "search": nil,
		"row_limit": int32(10), "row_offset": int32(0),
	}
	ownerTotal, ownerPage, ownerEmpty := readProductDMSummaryPage(t, fixture, query, ownerArgs)
	ownerTitles := make(map[string]bool, len(ownerPage))
	for _, title := range ownerPage {
		ownerTitles[title] = true
	}
	if ownerTotal != 5 || ownerEmpty || len(ownerTitles) != 5 || !ownerTitles["Visible summary"] || !ownerTitles["Unreadable summary"] ||
		!ownerTitles["100% literal"] || !ownerTitles["100_ literal"] || !ownerTitles["100\\ literal"] {
		t.Fatalf("Document author sees DM summaries %v, want readable and own restricted summaries", ownerTitles)
	}
}

func readProductDMSummaryPage(t *testing.T, fixture *dbtest.ProductFixture, query string, args pgx.StrictNamedArgs) (int64, []string, bool) {
	t.Helper()
	rows, err := fixture.Pool.Query(context.Background(), query, args)
	if err != nil {
		t.Fatalf("execute owned DM-summary SQL: %v", err)
	}
	defer rows.Close()
	var total int64
	var titles []string
	emptyPage := false
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			t.Fatalf("read DM-summary row: %v", err)
		}
		total = values[0].(int64)
		if values[1] == nil {
			emptyPage = true
			continue
		}
		titles = append(titles, values[5].(string))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate DM-summary rows: %v", err)
	}
	return total, titles, emptyPage
}

func productNamedSQL(t *testing.T, name string) string {
	t.Helper()
	source, err := os.ReadFile("../../db/queries/quest_product.sql")
	if err != nil {
		t.Fatalf("read owned Quest SQL source: %v", err)
	}
	marker := "-- name: " + name + " "
	start := strings.Index(string(source), marker)
	if start < 0 {
		t.Fatalf("named query %s missing from owned SQL source", name)
	}
	start = strings.IndexByte(string(source[start:]), '\n') + start + 1
	end := strings.Index(string(source[start:]), "\n-- name:")
	if end < 0 {
		end = len(source) - start
	}
	query := strings.TrimSpace(string(source[start : start+end]))
	return regexp.MustCompile(`sqlc\.(?:narg|arg)\((\w+)\)`).ReplaceAllString(query, "@$1")
}

func assertQuestReadFiltersAndPages(t *testing.T, fixture *dbtest.ProductFixture, questID, dmID string) {
	t.Helper()
	ctx := context.Background()
	asOf := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	readRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestReadByID"), pgx.StrictNamedArgs{
		"quest_id": db.MustUUID(questID), "as_of": asOf,
	})
	if err != nil {
		t.Fatalf("execute Quest read projection: %v", err)
	}
	if !readRows.Next() {
		readRows.Close()
		t.Fatalf("Quest read projection omitted %s", questID)
	}
	readValues, publicID := productRowWithUUID(t, readRows, 1)
	if err := readRows.Err(); err != nil {
		readRows.Close()
		t.Fatalf("iterate Quest projection: %v", err)
	}
	readRows.Close()
	if publicID != db.MustUUID(questID) || readValues[2] != "Q-TEST" || readValues[4] != "open" || readValues[5] != "open" {
		t.Fatalf("Quest read = id %s, code %v, status %v/%v; want %s, Q-TEST, open/open", db.UUIDString(publicID), readValues[2], readValues[4], readValues[5], questID)
	}

	listArgs := pgx.StrictNamedArgs{
		"as_of": asOf, "status": "open", "display_status": nil, "dm_id": db.MustUUID(dmID),
		"arc_id": nil, "kind": "standard", "region_id": nil,
		"tag_filter_set": true, "tag_variants": []string{"north"},
		"genre_filter_set": true, "genre_variants": []string{"mystery"},
		"short_codes": []string{}, "ids": []pgtype.UUID{}, "scheduled_from": nil, "scheduled_to": nil,
		"search": "Q-TEST", "row_limit": int32(10), "row_offset": int32(0),
	}
	listRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestListPage"), listArgs)
	if err != nil {
		t.Fatalf("execute filtered Quest page: %v", err)
	}
	var total int64
	var listedCode string
	for listRows.Next() {
		values, err := listRows.Values()
		if err != nil {
			listRows.Close()
			t.Fatalf("read filtered Quest page row: %v", err)
		}
		total = values[0].(int64)
		if values[3] != nil {
			listedCode = values[3].(string)
		}
	}
	if err := listRows.Err(); err != nil {
		listRows.Close()
		t.Fatalf("iterate filtered Quest page: %v", err)
	}
	listRows.Close()
	if total != 1 || listedCode != "Q-TEST" {
		t.Fatalf("filtered Quest page total/code = %d/%q, want 1/Q-TEST", total, listedCode)
	}

	genreRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestGenreOptions"), pgx.StrictNamedArgs{})
	if err != nil {
		t.Fatalf("execute Quest genre options: %v", err)
	}
	var genres []string
	for genreRows.Next() {
		var genre string
		if err := genreRows.Scan(&genre); err != nil {
			genreRows.Close()
			t.Fatalf("read Quest genre option: %v", err)
		}
		genres = append(genres, genre)
	}
	if err := genreRows.Err(); err != nil {
		genreRows.Close()
		t.Fatalf("iterate Quest genre options: %v", err)
	}
	genreRows.Close()
	if len(genres) != 1 || genres[0] != "mystery" {
		t.Fatalf("Quest genre options = %v, want [mystery]", genres)
	}

	stateRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestStateCounts"), pgx.StrictNamedArgs{
		"arc_id": nil, "dm_id": nil, "kind": nil, "region_id": nil,
		"tag_filter_set": false, "tag_variants": []string{},
		"genre_filter_set": false, "genre_variants": []string{},
	})
	if err != nil {
		t.Fatalf("execute Quest state counts: %v", err)
	}
	var states []string
	var openCount int64
	for stateRows.Next() {
		var state string
		var count int64
		if err := stateRows.Scan(&state, &count); err != nil {
			stateRows.Close()
			t.Fatalf("read Quest state count: %v", err)
		}
		states = append(states, state)
		if state == "open" {
			openCount = count
		}
	}
	if err := stateRows.Err(); err != nil {
		stateRows.Close()
		t.Fatalf("iterate Quest state counts: %v", err)
	}
	stateRows.Close()
	if len(states) != 5 || states[0] != "open" || openCount != 1 {
		t.Fatalf("Quest state counts = %v, open count %d; want five ordered states and one open Quest", states, openCount)
	}
}

func productRowWithUUID(t *testing.T, rows pgx.Rows, column int) ([]any, pgtype.UUID) {
	t.Helper()
	values := make([]any, len(rows.FieldDescriptions()))
	destinations := make([]any, len(values))
	var publicID pgtype.UUID
	for i := range values {
		if i == column {
			destinations[i] = &publicID
		} else {
			destinations[i] = &values[i]
		}
	}
	if err := rows.Scan(destinations...); err != nil {
		t.Fatalf("scan Quest projection with typed UUID: %v", err)
	}
	return values, publicID
}

func assertQuestSignupCapacityAndRoster(t *testing.T, fixture *dbtest.ProductFixture, questID, dmID string) {
	t.Helper()
	ctx := context.Background()
	var questDBID, memberDBID, characterDBID int64
	if err := fixture.Pool.QueryRow(ctx, `SELECT q.id, m.id FROM quests q JOIN members m ON m.public_id=$2 WHERE q.public_id=$1`, db.MustUUID(questID), db.MustUUID(dmID)).Scan(&questDBID, &memberDBID); err != nil {
		t.Fatalf("resolve Quest signup identities: %v", err)
	}
	if err := fixture.Pool.QueryRow(ctx, `
		INSERT INTO characters(public_id,short_code,name,owner_id,status)
		VALUES ('10000000-0000-4000-8000-000000000020','QTEST-CHAR','Test Character',$1,'active')
		RETURNING id;`, memberDBID).Scan(&characterDBID); err != nil {
		t.Fatalf("insert Quest signup character: %v", err)
	}
	at := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	_, err := fixture.Pool.Exec(ctx, productNamedSQL(t, "ProductQuestInsertParticipant"), pgx.StrictNamedArgs{
		"quest_id": questDBID, "member_id": memberDBID, "character_id": characterDBID,
		"status": "signed_up", "manual": false, "at": at,
	})
	if err != nil {
		t.Fatalf("execute Quest participant admission: %v", err)
	}
	participantRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestReadParticipants"), pgx.StrictNamedArgs{
		"quest_id": db.MustUUID(questID), "status": nil,
	})
	if err != nil {
		t.Fatalf("execute Quest participant read: %v", err)
	}
	if !participantRows.Next() {
		participantRows.Close()
		t.Fatal("Quest participant read omitted the admitted character")
	}
	participant, err := participantRows.Values()
	participantRows.Close()
	if err != nil {
		t.Fatalf("read Quest participant: %v", err)
	}
	if participant[3] != "Test Character" || participant[7] != "signed_up" || participant[8] != false {
		t.Fatalf("Quest participant = %v, want Test Character signed_up and non-manual", participant)
	}
	var participantCount int64
	if err := fixture.Pool.QueryRow(ctx, productNamedSQL(t, "ProductQuestCountParticipants"), pgx.StrictNamedArgs{
		"quest_id": db.MustUUID(questID), "status": "signed_up",
	}).Scan(&participantCount); err != nil {
		t.Fatalf("execute Quest participant count: %v", err)
	}
	if participantCount != 1 {
		t.Fatalf("signed-up participant count = %d, want 1", participantCount)
	}
	mySignupRows, err := fixture.Pool.Query(ctx, productNamedSQL(t, "ProductQuestMySignupsPage"), pgx.StrictNamedArgs{
		"member_id": db.MustUUID(dmID), "as_of": time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC),
		"scheduled_from": nil, "row_limit": int32(10), "row_offset": int32(0),
	})
	if err != nil {
		t.Fatalf("execute current Quest signups page: %v", err)
	}
	if !mySignupRows.Next() {
		mySignupRows.Close()
		t.Fatal("current Quest signups page omitted the admitted character")
	}
	signup, err := mySignupRows.Values()
	mySignupRows.Close()
	if err != nil {
		t.Fatalf("read current Quest signup: %v", err)
	}
	if signup[0] != int64(1) || signup[1] != questID || signup[3] != "10000000-0000-4000-8000-000000000020" {
		t.Fatalf("current Quest signup = %v, want one signup for Quest %s and the seeded character", signup, questID)
	}
	var capacityStatus string
	var filledCount int32
	if err := fixture.Pool.QueryRow(ctx, productNamedSQL(t, "ProductQuestLockCapacity"), pgx.StrictNamedArgs{
		"quest_id": questDBID,
	}).Scan(new(int64), new(string), &capacityStatus, new(int32), &filledCount); err != nil {
		t.Fatalf("execute Quest capacity lock: %v", err)
	}
	if capacityStatus != "open" || filledCount != 0 {
		t.Fatalf("Quest capacity before admission = %s/%d, want open/0", capacityStatus, filledCount)
	}
	var afterStatus string
	var afterCount int32
	if err := fixture.Pool.QueryRow(ctx, productNamedSQL(t, "ProductQuestIncrementCapacity"), pgx.StrictNamedArgs{
		"quest_id": questDBID, "delta": int32(1),
	}).Scan(new(int64), new(string), &afterStatus, new(int32), &afterCount, new(time.Time)); err != nil {
		t.Fatalf("execute Quest capacity admission: %v", err)
	}
	if afterStatus != "open" || afterCount != 1 {
		t.Fatalf("Quest capacity after admission = %s/%d, want open/1", afterStatus, afterCount)
	}
	var persistedCount, signedUpCount int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT q.filled_count,
		(SELECT count(*)::integer FROM quest_participants p WHERE p.quest_id=q.id AND p.status='signed_up')
		FROM quests q WHERE q.public_id=$1`, db.MustUUID(questID)).Scan(&persistedCount, &signedUpCount); err != nil {
		t.Fatalf("read persisted Quest roster and capacity: %v", err)
	}
	if persistedCount != 1 || signedUpCount != persistedCount {
		t.Fatalf("persisted Quest capacity=%d signed_up roster=%d", persistedCount, signedUpCount)
	}
}
