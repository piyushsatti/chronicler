//go:build integration

package spatial

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}

var spatialSQLMacro = regexp.MustCompile(`sqlc\.(?:n?arg)\(([a-z_]+)\)`)

func productNamedSQL(t *testing.T, name, mode string) string {
	t.Helper()
	data, err := os.ReadFile("../../db/queries/spatial_product.sql")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	var query string
	for _, part := range strings.Split(string(data), "-- name: ")[1:] {
		header, body, ok := strings.Cut(part, "\n")
		if !ok {
			continue
		}
		fields := strings.Fields(header)
		if len(fields) > 0 && fields[0] == name {
			count++
			if strings.TrimSpace(header) != name+" "+mode {
				t.Fatalf("named query %s annotation=%q", name, header)
			}
			query = strings.TrimSpace(body)
		}
	}
	if count != 1 {
		t.Fatalf("named query %s occurrences=%d, want one", name, count)
	}
	return query
}

func productSQL(t *testing.T, name, mode string) string {
	t.Helper()
	return spatialSQLMacro.ReplaceAllStringFunc(productNamedSQL(t, name, mode), func(token string) string {
		key := strings.TrimSuffix(strings.TrimPrefix(token, "sqlc.arg("), ")")
		if strings.HasPrefix(token, "sqlc.narg(") {
			key = strings.TrimSuffix(strings.TrimPrefix(token, "sqlc.narg("), ")")
		}
		return "@" + key
	})
}

type productQueryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

type productQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type productExecer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func productQueryRow(t *testing.T, db productQueryRower, ctx context.Context, query string, values ...any) pgx.Row {
	if strings.Contains(query, "@") {
		if len(values) != 1 {
			t.Fatalf("named SQL requires one explicit pgx.StrictNamedArgs map; got %d values", len(values))
		}
		args, ok := values[0].(pgx.StrictNamedArgs)
		if !ok {
			t.Fatalf("named SQL arguments must be an explicit pgx.StrictNamedArgs map, got %T", values[0])
		}
		return db.QueryRow(ctx, query, args)
	}
	return db.QueryRow(ctx, query, values...)
}

func productQuery(t *testing.T, db productQuerier, ctx context.Context, query string, values ...any) (pgx.Rows, error) {
	if strings.Contains(query, "@") {
		if len(values) != 1 {
			t.Fatalf("named SQL requires one explicit pgx.StrictNamedArgs map; got %d values", len(values))
		}
		args, ok := values[0].(pgx.StrictNamedArgs)
		if !ok {
			t.Fatalf("named SQL arguments must be an explicit pgx.StrictNamedArgs map, got %T", values[0])
		}
		return db.Query(ctx, query, args)
	}
	return db.Query(ctx, query, values...)
}

func productExec(t *testing.T, db productExecer, ctx context.Context, query string, values ...any) (pgconn.CommandTag, error) {
	if strings.Contains(query, "@") {
		if len(values) != 1 {
			t.Fatalf("named SQL requires one explicit pgx.StrictNamedArgs map; got %d values", len(values))
		}
		args, ok := values[0].(pgx.StrictNamedArgs)
		if !ok {
			t.Fatalf("named SQL arguments must be an explicit pgx.StrictNamedArgs map, got %T", values[0])
		}
		return db.Exec(ctx, query, args)
	}
	return db.Exec(ctx, query, values...)
}

func TestProductSQLNamedSourcesCoverSettledStorageGroups(t *testing.T) {
	data, err := os.ReadFile("../../db/queries/spatial_product.sql")
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, part := range strings.Split(string(data), "-- name: ")[1:] {
		header, _, ok := strings.Cut(part, "\n")
		if ok {
			names = append(names, strings.Fields(header)[0])
		}
	}
	seen := map[string]bool{}
	for _, name := range names {
		if seen[name] {
			t.Errorf("duplicate named statement %q", name)
		}
		seen[name] = true
	}
	for _, required := range []string{
		"GetProductMap", "ListProductMaps",
		"ListProductPointcrawlNodesForMaps",
		"ListProductPointcrawlEdgesForMaps",
		"ListProductPointcrawlLinksForNodes", "GetProductRegionCounts",
		"ListProductArchonAssignments", "ReadProductGameDate",
		"ReadProductCalendar", "ListProductCalendarCells", "ListProductTimeAnchors",
		"LockProductMapByAtlasCode", "CreateProductMap", "UpsertProductPointcrawlNode", "LockProductPointcrawlNode",
		"SetProductPointcrawlEdge", "SetProductPointcrawlNodeState",
		"LinkProductPointcrawlEntry",
		"UnlinkProductPointcrawlEntry", "AssignProductArchon",
		"RevokeProductArchon", "RestoreProductRegion",
		"TransitionProductRegion", "CreateProductTimeAnchor", "UpdateProductTimeAnchor",
		"UpdateProductCalendar", "ReadProductContainmentEdges",
	} {
		found := false
		for _, name := range names {
			if name == required {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("settled named statement %q is missing", required)
		}
	}
}

func TestProductSQLReadsWritesAndPagingOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool

	var actorID int64
	var actorUUID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status)
VALUES ('spa03-actor','spa03-actor','SPA03 actor',ARRAY['admin'],'active') RETURNING id,public_id`).Scan(&actorID, &actorUUID); err != nil {
		t.Fatal(err)
	}
	var regionID int64
	var regionUUID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO regions(name,kind) VALUES ('SPA03 region','server') RETURNING id,public_id`).Scan(&regionID, &regionUUID); err != nil {
		t.Fatal(err)
	}

	var mapOneID uuid.UUID
	createMap := productSQL(t, "CreateProductMap", ":one")
	for index, code := range []string{"spa03-a", "spa03-b"} {
		var got uuid.UUID
		var name, atlasCode, mapKind, family string
		var returnedRegion, createdBy *uuid.UUID
		var assetPath *string
		var createdAt time.Time
		if err := productQueryRow(t, pool, ctx, createMap, pgx.StrictNamedArgs{
			"name": "SPA03 " + code, "atlas_code": code, "map_kind": "pointcrawl", "family": "campaign", "grid": "point",
			"region_id": regionUUID.String(), "asset_path": nil, "actor_id": actorUUID.String(),
		}).Scan(&got, &name, &atlasCode, &mapKind, &family, new(string), &returnedRegion, &assetPath, &createdAt, &createdBy); err != nil {
			t.Fatalf("create map %s: %v", code, err)
		}
		if got == uuid.Nil || name != "SPA03 "+code || atlasCode != code || mapKind != "pointcrawl" || family != "campaign" || returnedRegion == nil || *returnedRegion != regionUUID || assetPath != nil || createdAt.IsZero() || createdBy == nil || *createdBy != actorUUID {
			t.Fatalf("created map projection id=%s name=%s region=%v creator=%v", got, name, returnedRegion, createdBy)
		}
		if index == 0 {
			mapOneID = got
		}
	}
	mapByCodeTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedMapByCode uuid.UUID
	if err := productQueryRow(t, mapByCodeTx, ctx, productSQL(t, "LockProductMapByAtlasCode", ":one"), pgx.StrictNamedArgs{"atlas_code": "spa03-a"}).Scan(new(int64), &lockedMapByCode, new(string), new(string), new(string), new(string), new(string), new(int64), new(*string), new(time.Time), new(*int64)); err != nil || lockedMapByCode != mapOneID {
		_ = mapByCodeTx.Rollback(ctx)
		t.Fatalf("lock map by code=%s err=%v", lockedMapByCode, err)
	}
	if err := mapByCodeTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	assignSQL := productSQL(t, "AssignProductArchon", ":one")
	var grantRegion, grantMember, grantActor uuid.UUID
	var grantedAt time.Time
	assignArgs := pgx.StrictNamedArgs{"recorded_at": time.Now().UTC(), "actor_id": actorUUID.String(), "member_id": actorUUID.String(), "region_id": regionUUID.String()}
	if err := productQueryRow(t, pool, ctx, assignSQL, assignArgs).Scan(&grantRegion, &grantMember, &grantedAt, &grantActor); err != nil {
		t.Fatalf("first archon assignment: %v", err)
	}
	if grantRegion != regionUUID || grantMember != actorUUID || grantActor != actorUUID {
		t.Fatalf("assignment public identities region=%s member=%s actor=%s", grantRegion, grantMember, grantActor)
	}
	assignmentLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedAssignmentRegion, lockedAssignmentMember uuid.UUID
	if err := productQueryRow(t, assignmentLocker, ctx, productSQL(t, "LockProductArchonAssignment", ":one"), pgx.StrictNamedArgs{"region_id": regionUUID.String(), "member_id": actorUUID.String()}).Scan(new(int64), &lockedAssignmentMember, new(int64), &lockedAssignmentRegion, new(time.Time), new(*int64)); err != nil || lockedAssignmentRegion != regionUUID || lockedAssignmentMember != actorUUID {
		_ = assignmentLocker.Rollback(ctx)
		t.Fatalf("lock archon assignment region=%s member=%s err=%v", lockedAssignmentRegion, lockedAssignmentMember, err)
	}
	if err := assignmentLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var duplicateGrantedAt time.Time
	if err := productQueryRow(t, pool, ctx, assignSQL, assignArgs).Scan(new(uuid.UUID), new(uuid.UUID), &duplicateGrantedAt, new(uuid.UUID)); err != nil || !duplicateGrantedAt.Equal(grantedAt) {
		t.Fatalf("duplicate assignment grantedAt=%s want original %s err=%v", duplicateGrantedAt, grantedAt, err)
	}
	var secondMember uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-archon-2','spa03-archon-2','SPA03 archon 2',ARRAY['archon'],'active') RETURNING public_id`).Scan(&secondMember); err != nil {
		t.Fatal(err)
	}
	secondAssignArgs := pgx.StrictNamedArgs{"recorded_at": time.Now().UTC(), "actor_id": actorUUID.String(), "member_id": secondMember.String(), "region_id": regionUUID.String()}
	if err := productQueryRow(t, pool, ctx, assignSQL, secondAssignArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(time.Time), new(uuid.UUID)); err != nil {
		t.Fatalf("second distinct assignment: %v", err)
	}
	listedMembers := map[uuid.UUID]bool{}
	for offset := int32(0); offset < 2; offset++ {
		assignmentArgs := pgx.StrictNamedArgs{"region_id": regionUUID.String(), "member_id": nil, "row_limit": int32(1), "row_offset": offset}
		var listedGrantRegion, listedGrantMember uuid.UUID
		if err := productQueryRow(t, pool, ctx, productSQL(t, "ListProductArchonAssignments", ":many"), assignmentArgs).Scan(&listedGrantRegion, &listedGrantMember, new(time.Time), new(*uuid.UUID)); err != nil || listedGrantRegion != regionUUID {
			t.Fatalf("assignment page %d region=%s member=%s err=%v", offset, listedGrantRegion, listedGrantMember, err)
		}
		listedMembers[listedGrantMember] = true
	}
	if len(listedMembers) != 2 || !listedMembers[actorUUID] || !listedMembers[secondMember] {
		t.Fatalf("assignment pages members=%v", listedMembers)
	}
	var assignmentCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductArchonAssignments", ":one"), pgx.StrictNamedArgs{"region_id": regionUUID.String(), "member_id": nil}).Scan(&assignmentCount); err != nil || assignmentCount != 2 {
		t.Fatalf("archon assignment count=%d err=%v", assignmentCount, err)
	}
	revokeArgs := pgx.StrictNamedArgs{"member_id": actorUUID.String(), "region_id": regionUUID.String()}
	revokeResult, err := productExec(t, pool, ctx, productSQL(t, "RevokeProductArchon", ":execrows"), revokeArgs)
	if err != nil {
		t.Fatal(err)
	}
	revokedRows := revokeResult.RowsAffected()
	if revokedRows != 1 {
		t.Fatalf("revoke assignment rows=%d", revokedRows)
	}
	revokeResult, err = productExec(t, pool, ctx, productSQL(t, "RevokeProductArchon", ":execrows"), revokeArgs)
	if err != nil {
		t.Fatal(err)
	}
	revokedRows = revokeResult.RowsAffected()
	if revokedRows != 0 {
		t.Fatalf("repeat revoke rows=%d", revokedRows)
	}
	var mapCount int
	rows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductMaps", ":many"), pgx.StrictNamedArgs{"family": nil, "map_kind": nil, "row_limit": int32(1), "row_offset": int32(0)})
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		mapCount++
	}
	rows.Close()
	if mapCount != 1 {
		t.Fatalf("map page returned %d rows, want one", mapCount)
	}

	var absentCalendarDefinition *[]byte
	var absentCalendarUpdatedAt *time.Time
	var absentCalendarDay sql.NullInt32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductCalendar", ":one"), pgx.StrictNamedArgs{"today": time.Now().UTC()}).Scan(&absentCalendarDefinition, &absentCalendarUpdatedAt, &absentCalendarDay); err != nil || absentCalendarDefinition != nil || absentCalendarUpdatedAt != nil || absentCalendarDay.Valid {
		t.Fatalf("absent calendar read definition=%v updated=%v day=%v err=%v", absentCalendarDefinition, absentCalendarUpdatedAt, absentCalendarDay, err)
	}
	calendarSQL := productSQL(t, "UpdateProductCalendar", ":one")
	var returnedDefinition []byte
	var calendarUpdatedAt *time.Time
	if err := productQueryRow(t, pool, ctx, calendarSQL, pgx.StrictNamedArgs{"definition": `{"months":12}`, "recorded_at": time.Now().UTC()}).Scan(new(int16), &returnedDefinition, &calendarUpdatedAt); err != nil {
		t.Fatalf("calendar storage update: %v", err)
	}
	if calendarUpdatedAt == nil {
		t.Fatal("calendar initialization omitted its persisted update time")
	}
	if string(returnedDefinition) != `{"months": 12}` && string(returnedDefinition) != `{"months":12}` {
		t.Fatalf("calendar definition=%s", returnedDefinition)
	}
	var repeatedCalendarDefinition []byte
	var repeatedCalendarUpdatedAt *time.Time
	if err := productQueryRow(t, pool, ctx, calendarSQL, pgx.StrictNamedArgs{"definition": `{"months":12}`, "recorded_at": time.Now().UTC().Add(time.Hour)}).Scan(new(int16), &repeatedCalendarDefinition, &repeatedCalendarUpdatedAt); err != nil || !bytes.Equal(repeatedCalendarDefinition, returnedDefinition) || repeatedCalendarUpdatedAt == nil || !repeatedCalendarUpdatedAt.Equal(*calendarUpdatedAt) {
		t.Fatalf("unchanged calendar definition=%s updated=%v err=%v", repeatedCalendarDefinition, repeatedCalendarUpdatedAt, err)
	}
	calendarLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedCalendarID int16
	if err := productQueryRow(t, calendarLocker, ctx, productSQL(t, "LockProductCalendar", ":one")).Scan(&lockedCalendarID, new([]byte), new(*time.Time)); err != nil || lockedCalendarID != 1 {
		_ = calendarLocker.Rollback(ctx)
		t.Fatalf("lock game calendar id=%d err=%v", lockedCalendarID, err)
	}
	if err := calendarLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC().Truncate(24 * time.Hour)
	end := start.AddDate(0, 0, 3)
	past := start.AddDate(0, 0, -1)
	if _, err := productExec(t, pool, ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES ($1,7)`, past); err != nil {
		t.Fatalf("seed historical game date: %v", err)
	}
	projection := productSQL(t, "ReplaceProductGameTimeMapRange", ":one")
	rowsJSON := fmt.Sprintf(`[{"real_date":%q,"game_day":0},{"real_date":%q,"game_day":5}]`, start.Format("2006-01-02"), start.AddDate(0, 0, 2).Format("2006-01-02"))
	var changedRows int
	projectionArgs := pgx.StrictNamedArgs{"rows": rowsJSON, "today": start, "to_date": end}
	if err := productQueryRow(t, pool, ctx, projection, projectionArgs).Scan(&changedRows); err != nil || changedRows != 2 {
		t.Fatalf("initial time-map projection changed=%d err=%v", changedRows, err)
	}
	if err := productQueryRow(t, pool, ctx, projection, projectionArgs).Scan(&changedRows); err != nil || changedRows != 0 {
		t.Fatalf("repeated time-map projection changed=%d err=%v", changedRows, err)
	}
	var historicalDay int32
	if err := productQueryRow(t, pool, ctx, `SELECT game_day FROM game_time_map WHERE real_date=$1`, past).Scan(&historicalDay); err != nil || historicalDay != 7 {
		t.Fatalf("past game day=%d err=%v", historicalDay, err)
	}

	var singleDay sql.NullInt32
	var singleDefinition []byte
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductGameDate", ":one"), pgx.StrictNamedArgs{"real_date": start}).Scan(&singleDay, &singleDefinition); err != nil || !singleDay.Valid || singleDay.Int32 != 0 {
		t.Fatalf("single game-date read day=%v definition=%s err=%v", singleDay, singleDefinition, err)
	}
	var missingDay sql.NullInt32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductGameDate", ":one"), pgx.StrictNamedArgs{"real_date": start.AddDate(0, 0, 1)}).Scan(&missingDay, new([]byte)); err != nil || missingDay.Valid {
		t.Fatalf("missing game-date read day=%v err=%v", missingDay, err)
	}
	var realDateTotal int64
	var repeatedDate time.Time
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ListProductRealDates", ":many"), pgx.StrictNamedArgs{"game_day": int32(5), "row_limit": int32(10), "row_offset": int32(0)}).Scan(&realDateTotal, &repeatedDate); err != nil || realDateTotal != 1 || !repeatedDate.Equal(start.AddDate(0, 0, 2)) {
		t.Fatalf("real dates for game day 5 total=%d date=%s err=%v", realDateTotal, repeatedDate, err)
	}
	var emptyRealDateTotal int64
	var emptyRealDate sql.NullTime
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ListProductRealDates", ":many"), pgx.StrictNamedArgs{"game_day": int32(5), "row_limit": int32(10), "row_offset": int32(10)}).Scan(&emptyRealDateTotal, &emptyRealDate); err != nil || emptyRealDateTotal != 1 || emptyRealDate.Valid {
		t.Fatalf("empty real-date page total=%d date=%v err=%v", emptyRealDateTotal, emptyRealDate, err)
	}
	calendarCells := productSQL(t, "ListProductCalendarCells", ":many")
	cellRows, err := productQuery(t, pool, ctx, calendarCells, pgx.StrictNamedArgs{"real_from": start, "real_to": end})
	if err != nil {
		t.Fatal(err)
	}
	var cellCount int
	var middleNull bool
	for cellRows.Next() {
		var date time.Time
		var day sql.NullInt32
		if err := cellRows.Scan(&date, &day); err != nil {
			t.Fatal(err)
		}
		if date.Equal(start.AddDate(0, 0, 1)) {
			middleNull = !day.Valid
		}
		cellCount++
	}
	if err := cellRows.Err(); err != nil {
		t.Fatal(err)
	}
	cellRows.Close()
	if cellCount != 3 || !middleNull {
		t.Fatalf("calendar cells=%d middleNull=%t, want 3 including uncovered exclusive-range cell", cellCount, middleNull)
	}
	var calendarDefinition []byte
	var currentDay sql.NullInt32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductCalendar", ":one"), pgx.StrictNamedArgs{"today": start}).Scan(&calendarDefinition, new(*time.Time), &currentDay); err != nil || !currentDay.Valid || currentDay.Int32 != 0 {
		t.Fatalf("calendar singleton/current map definition=%s day=%v err=%v", calendarDefinition, currentDay, err)
	}

	anchorID := uuid.New()
	anchorAt := start.Add(12 * time.Hour)
	var createdAnchor uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CreateProductTimeAnchor", ":one"), pgx.StrictNamedArgs{"anchor_id": anchorID, "real_utc": anchorAt, "epoch_day": int32(100), "rate": float64(1), "note": nil}).Scan(&createdAnchor, new(time.Time), new(int32), new(float64), new(*string)); err != nil || createdAnchor != anchorID {
		t.Fatalf("create time anchor id=%s err=%v", createdAnchor, err)
	}
	anchorLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedAnchorID uuid.UUID
	if err := productQueryRow(t, anchorLocker, ctx, productSQL(t, "LockProductTimeAnchor", ":one"), pgx.StrictNamedArgs{"anchor_id": anchorID.String()}).Scan(new(int64), &lockedAnchorID, new(time.Time), new(int32), new(float64), new(*string)); err != nil || lockedAnchorID != anchorID {
		_ = anchorLocker.Rollback(ctx)
		t.Fatalf("lock time anchor id=%s err=%v", lockedAnchorID, err)
	}
	if err := anchorLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var latestAnchor uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductTimeAnchorAtOrBefore", ":one"), pgx.StrictNamedArgs{"real_utc": anchorAt.Add(time.Hour)}).Scan(&latestAnchor, new(time.Time), new(int32), new(float64), new(*string)); err != nil || latestAnchor != anchorID {
		t.Fatalf("latest anchor id=%s err=%v", latestAnchor, err)
	}
	secondAnchorID := uuid.New()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CreateProductTimeAnchor", ":one"), pgx.StrictNamedArgs{"anchor_id": secondAnchorID, "real_utc": anchorAt, "epoch_day": int32(101), "rate": float64(2), "note": "tie"}).Scan(new(uuid.UUID), new(time.Time), new(int32), new(float64), new(*string)); err != nil {
		t.Fatalf("create colliding time anchor: %v", err)
	}
	var tiedLatest uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ReadProductTimeAnchorAtOrBefore", ":one"), pgx.StrictNamedArgs{"real_utc": anchorAt}).Scan(&tiedLatest, new(time.Time), new(int32), new(float64), new(*string)); err != nil {
		t.Fatalf("read latest tied anchor: %v", err)
	}
	if want := maxUUID(anchorID, secondAnchorID); tiedLatest != want {
		t.Fatalf("latest tied anchor=%s, want public UUID descending %s", tiedLatest, want)
	}
	collisionRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductTimeAnchorCollisions", ":many"), pgx.StrictNamedArgs{"real_utc": anchorAt, "exclude_anchor_id": anchorID})
	if err != nil {
		t.Fatal(err)
	}
	var collisions []uuid.UUID
	for collisionRows.Next() {
		var collisionID uuid.UUID
		if err := collisionRows.Scan(&collisionID, new(time.Time)); err != nil {
			t.Fatal(err)
		}
		collisions = append(collisions, collisionID)
	}
	if err := collisionRows.Err(); err != nil {
		t.Fatal(err)
	}
	collisionRows.Close()
	if len(collisions) != 1 || collisions[0] != secondAnchorID {
		t.Fatalf("anchor collision exclusions=%v, want only %s", collisions, secondAnchorID)
	}
	anchorPages, err := productQuery(t, pool, ctx, productSQL(t, "ListProductTimeAnchors", ":many"), pgx.StrictNamedArgs{"row_limit": int32(1), "row_offset": int32(0)})
	if err != nil {
		t.Fatal(err)
	}
	var anchorTotal int64
	var firstAnchorPageID uuid.UUID
	if !anchorPages.Next() || anchorPages.Scan(&anchorTotal, &firstAnchorPageID, new(time.Time), new(sql.NullInt32), new(sql.NullFloat64), new(*string)) != nil || anchorTotal != 2 || firstAnchorPageID != minUUID(anchorID, secondAnchorID) {
		t.Fatalf("first time-anchor page total=%d id=%s, want total 2 and public UUID ascending tie-break %s", anchorTotal, firstAnchorPageID, minUUID(anchorID, secondAnchorID))
	}
	anchorPages.Close()
	emptyAnchorPages, err := productQuery(t, pool, ctx, productSQL(t, "ListProductTimeAnchors", ":many"), pgx.StrictNamedArgs{"row_limit": int32(1), "row_offset": int32(10)})
	if err != nil {
		t.Fatal(err)
	}
	var emptyAnchorTotal int64
	var emptyAnchorID uuid.NullUUID
	if !emptyAnchorPages.Next() || emptyAnchorPages.Scan(&emptyAnchorTotal, &emptyAnchorID, new(sql.NullTime), new(sql.NullInt32), new(sql.NullFloat64), new(*string)) != nil || emptyAnchorTotal != 2 || emptyAnchorID.Valid {
		t.Fatalf("empty time-anchor page total=%d id=%v, want total 2 and null page columns", emptyAnchorTotal, emptyAnchorID)
	}
	emptyAnchorPages.Close()
	updateArgs := pgx.StrictNamedArgs{"anchor_id": anchorID, "real_utc": anchorAt.Add(time.Hour), "epoch_day": int32(102), "rate": float64(1.5), "note": "updated"}
	var updatedID uuid.UUID
	var updatedAt time.Time
	var updatedDay int32
	var updatedRate float64
	var updatedNote *string
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpdateProductTimeAnchor", ":one"), updateArgs).Scan(&updatedID, &updatedAt, &updatedDay, &updatedRate, &updatedNote); err != nil || updatedID != anchorID || !updatedAt.Equal(anchorAt.Add(time.Hour)) || updatedDay != 102 || updatedRate != 1.5 || updatedNote == nil || *updatedNote != "updated" {
		t.Fatalf("updated anchor id=%s at=%s day=%d rate=%v note=%v err=%v", updatedID, updatedAt, updatedDay, updatedRate, updatedNote, err)
	}

}

func maxUUID(a, b uuid.UUID) uuid.UUID {
	if strings.Compare(a.String(), b.String()) > 0 {
		return a
	}
	return b
}

func minUUID(a, b uuid.UUID) uuid.UUID {
	if strings.Compare(a.String(), b.String()) < 0 {
		return a
	}
	return b
}

func TestProductSQLRegionLifecycleOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	var actorInternal int64
	var actorID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status)
VALUES ('spa03-region-actor','spa03-region-actor','SPA03 region actor',ARRAY['admin'],'active') RETURNING id,public_id`).Scan(&actorInternal, &actorID); err != nil {
		t.Fatal(err)
	}

	var regionDocumentID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO documents(kind,slug,title,status,visibility) VALUES ('community','spa03-region-document','SPA03 region document','published','public') RETURNING public_id`).Scan(&regionDocumentID); err != nil {
		t.Fatal(err)
	}
	var regionID uuid.UUID
	var regionName, regionKind string
	createRegion := productSQL(t, "CreateProductRegion", ":one")
	var createdRegionDocument *uuid.UUID
	if err := productQueryRow(t, pool, ctx, createRegion, pgx.StrictNamedArgs{"name": "SPA03 lifecycle", "kind": "uncharted", "charter_deadline": nil, "document_id": regionDocumentID.String()}).Scan(&regionID, &regionName, &regionKind, new(*time.Time), &createdRegionDocument, new(time.Time)); err != nil {
		t.Fatalf("create region: %v", err)
	}
	if regionID == uuid.Nil || regionName != "SPA03 lifecycle" || regionKind != "uncharted" || createdRegionDocument == nil || *createdRegionDocument != regionDocumentID {
		t.Fatalf("created region id=%s name=%q kind=%q document=%v", regionID, regionName, regionKind, createdRegionDocument)
	}
	regionLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedRegionID uuid.UUID
	if err := productQueryRow(t, regionLocker, ctx, productSQL(t, "LockProductRegion", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String()}).Scan(new(int64), &lockedRegionID, new(string), new(string), new(*time.Time), new(*int64), new(*time.Time), new(time.Time), new(*uuid.UUID)); err != nil || lockedRegionID != regionID {
		_ = regionLocker.Rollback(ctx)
		t.Fatalf("lock product region id=%s err=%v", lockedRegionID, err)
	}
	if err := regionLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	updateRegion := productSQL(t, "UpdateProductRegion", ":one")
	var updatedName string
	var updatedDocument *uuid.UUID
	updateArgs := pgx.StrictNamedArgs{"region_id": regionID.String(), "kind": "uncharted", "name": "SPA03 renamed", "charter_deadline": nil, "document_id": nil}
	if err := productQueryRow(t, pool, ctx, updateRegion, updateArgs).Scan(new(uuid.UUID), &updatedName, new(string), new(*time.Time), &updatedDocument, new(time.Time)); err != nil {
		t.Fatalf("update region: %v", err)
	}
	if updatedName != "SPA03 renamed" || updatedDocument != nil {
		t.Fatalf("updated region name=%q", updatedName)
	}
	if err := productQueryRow(t, pool, ctx, updateRegion, updateArgs).Scan(new(uuid.UUID), new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("no-op region update: %v", err)
	}
	transitionRegion := productSQL(t, "TransitionProductRegion", ":one")
	transitionArgs := pgx.StrictNamedArgs{"region_id": regionID.String(), "kind": "archon"}
	if err := productQueryRow(t, pool, ctx, transitionRegion, transitionArgs).Scan(new(uuid.UUID), new(string), &regionKind, new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || regionKind != "archon" {
		t.Fatalf("transition region kind=%q err=%v", regionKind, err)
	}
	transitionArgs["kind"] = "server"
	if err := productQueryRow(t, pool, ctx, transitionRegion, transitionArgs).Scan(new(uuid.UUID), new(string), &regionKind, new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || regionKind != "server" {
		t.Fatalf("second legal transition kind=%q err=%v", regionKind, err)
	}

	var deleteRegionID uuid.UUID
	if err := productQueryRow(t, pool, ctx, createRegion, pgx.StrictNamedArgs{"name": "SPA03 deletable", "kind": "server", "charter_deadline": nil, "document_id": nil}).Scan(&deleteRegionID, new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("create deletable region: %v", err)
	}
	tombstoneAt := time.Now().UTC().Add(-time.Minute)
	if _, err := productExec(t, pool, ctx, `UPDATE regions SET deleted_at=$2,deleted_by=(SELECT id FROM members WHERE public_id=$3) WHERE public_id=$1`, deleteRegionID, tombstoneAt, actorID); err != nil {
		t.Fatalf("seed existing region tombstone for restore query: %v", err)
	}
	var restoredID uuid.UUID
	restoreArgs := pgx.StrictNamedArgs{"region_id": deleteRegionID.String()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "RestoreProductRegion", ":one"), restoreArgs).Scan(&restoredID, new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || restoredID != deleteRegionID {
		t.Fatalf("restore region id=%s err=%v", restoredID, err)
	}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "RestoreProductRegion", ":one"), restoreArgs).Scan(new(uuid.UUID), new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("repeat region restore: %v", err)
	}

	var deletedAt *time.Time
	var deletedBy *int64
	if err := pool.QueryRow(ctx, `SELECT deleted_at,deleted_by FROM regions WHERE public_id=$1`, deleteRegionID).Scan(&deletedAt, &deletedBy); err != nil || deletedAt != nil || deletedBy != nil {
		t.Fatalf("restore tombstone fields at=%v by=%v err=%v", deletedAt, deletedBy, err)
	}
}

func TestProductSQLTransactionAggregateLocksOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	for _, queryName := range []string{"LockProductTimeAggregate", "LockProductContainmentGraph"} {
		first, err := f.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := productExec(t, first, ctx, productSQL(t, queryName, ":exec")); err != nil {
			_ = first.Rollback(ctx)
			t.Fatalf("acquire %s: %v", queryName, err)
		}
		second, err := f.Pool.Begin(ctx)
		if err != nil {
			_ = first.Rollback(ctx)
			t.Fatal(err)
		}
		lockName := "chronicler:time-aggregate"
		if queryName == "LockProductContainmentGraph" {
			lockName = "chronicler:map-containment"
		}
		var acquired bool
		if err := productQueryRow(t, second, ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))`, lockName).Scan(&acquired); err != nil || acquired {
			_ = second.Rollback(ctx)
			_ = first.Rollback(ctx)
			t.Fatalf("second transaction acquired %s while first holds it: %t err=%v", lockName, acquired, err)
		}
		if err := first.Rollback(ctx); err != nil {
			_ = second.Rollback(ctx)
			t.Fatal(err)
		}
		if err := productQueryRow(t, second, ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))`, lockName).Scan(&acquired); err != nil || !acquired {
			_ = second.Rollback(ctx)
			t.Fatalf("second transaction could not acquire released %s: %t err=%v", lockName, acquired, err)
		}
		if err := second.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
}

func TestProductSQLPointcrawlNodeAndContainmentStorageOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	var actorID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-node-actor','spa03-node-actor','SPA03 node actor',ARRAY['admin'],'active') RETURNING public_id`).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	createMap := productSQL(t, "CreateProductMap", ":one")
	makeMap := func(code string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		args := pgx.StrictNamedArgs{"name": code, "atlas_code": code, "map_kind": "pointcrawl", "family": "campaign", "grid": "point", "region_id": nil, "asset_path": nil, "actor_id": actorID.String()}
		if err := productQueryRow(t, pool, ctx, createMap, args).Scan(&id, new(string), new(string), new(string), new(string), new(string), new(*uuid.UUID), new(*string), new(time.Time), new(*uuid.UUID)); err != nil {
			t.Fatalf("create map %s: %v", code, err)
		}
		return id
	}
	parentMap, nodeSubmap := makeMap("spa03-containment-parent"), makeMap("spa03-containment-node-child")
	nodeID := uuid.New()
	writeNode := func(name string, update bool) uuid.UUID {
		t.Helper()
		args := pgx.StrictNamedArgs{"node_id": nil, "map_id": parentMap.String(), "name": name, "x": float64(1), "y": float64(2), "submap_id": nodeSubmap.String(), "recorded_at": time.Now().UTC()}
		if update {
			args["node_id"] = nodeID.String()
		}
		var returnedID, returnedMap uuid.UUID
		var returnedName string
		var x, y float64
		var returnedSubmap *uuid.UUID
		var returnedState string
		if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPointcrawlNode", ":one"), args).Scan(&returnedID, &returnedMap, &returnedName, &x, &y, &returnedSubmap, new(time.Time), &returnedState); err != nil {
			t.Fatalf("upsert pointcrawl node %q: %v", name, err)
		}
		if returnedMap != parentMap || returnedName != name || x != 1 || y != 2 || returnedSubmap == nil || *returnedSubmap != nodeSubmap || returnedState != "locked" {
			t.Fatalf("pointcrawl node id=%s map=%s name=%q submap=%v", returnedID, returnedMap, returnedName, returnedSubmap)
		}
		return returnedID
	}
	if got := writeNode("first", false); got == uuid.Nil {
		t.Fatal("node creation returned empty public identity")
	} else {
		nodeID = got
	}
	nodeLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedNodeID uuid.UUID
	if err := productQueryRow(t, nodeLocker, ctx, productSQL(t, "LockProductPointcrawlNode", ":one"), pgx.StrictNamedArgs{"node_id": nodeID.String()}).Scan(new(int64), &lockedNodeID, new(int64), new(string), new(float64), new(float64), new(*int64), new(time.Time), new(string), new(uuid.UUID), new(*uuid.UUID)); err != nil || lockedNodeID != nodeID {
		_ = nodeLocker.Rollback(ctx)
		t.Fatalf("lock pointcrawl node id=%s err=%v", lockedNodeID, err)
	}
	if err := nodeLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if got := writeNode("renamed", true); got != nodeID {
		t.Fatalf("pointcrawl node update changed identity %s to %s", nodeID, got)
	}
	noOpArgs := pgx.StrictNamedArgs{"node_id": nodeID.String(), "map_id": parentMap.String(), "name": "renamed", "x": float64(1), "y": float64(2), "submap_id": nodeSubmap.String(), "recorded_at": time.Now().UTC()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPointcrawlNode", ":one"), noOpArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(string), new(float64), new(float64), new(*uuid.UUID), new(time.Time), new(string)); err != nil {
		t.Fatalf("unchanged pointcrawl node write: %v", err)
	}
	edges, err := productQuery(t, pool, ctx, productSQL(t, "ReadProductContainmentEdges", ":many"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[[2]uuid.UUID]bool{{parentMap, nodeSubmap}: true}
	for edges.Next() {
		var parentID, childID uuid.UUID
		if err := edges.Scan(&parentID, &childID); err != nil {
			t.Fatal(err)
		}
		delete(want, [2]uuid.UUID{parentID, childID})
	}
	if err := edges.Err(); err != nil {
		t.Fatal(err)
	}
	edges.Close()
	if len(want) != 0 {
		t.Fatalf("containment graph omitted persisted edges: %v", want)
	}
}

func TestProductSQLRegionQuestCountsDoNotDiscloseBriefAudience(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	var actorID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-region-dm','spa03-region-dm','SPA03 region DM',ARRAY['dm'],'active') RETURNING public_id`).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	var regionID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO regions(name,kind) VALUES ('SPA03 activity region','server') RETURNING public_id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	if _, err := productExec(t, pool, ctx, `INSERT INTO maps(name,atlas_code,map_kind,family,region_id) SELECT 'SPA03 activity','spa03-activity','pointcrawl','campaign',id FROM regions WHERE public_id=$1`, regionID); err != nil {
		t.Fatal(err)
	}
	if _, err := productExec(t, pool, ctx, `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) SELECT id,'activity-node',0,0,now() FROM maps WHERE atlas_code='spa03-activity'`); err != nil {
		t.Fatal(err)
	}
	briefIDs := []uuid.UUID{uuid.New(), uuid.New(), uuid.New(), uuid.New()}
	questIDs := []uuid.UUID{uuid.New(), uuid.New(), uuid.New(), uuid.New()}
	visibility := []string{"public", "restricted", "public", "public"}
	for i := range briefIDs {
		deletedBrief := i == 2
		if _, err := productExec(t, pool, ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,deleted_at) VALUES ($1,'quest_brief',$2,$2,'published',$3,CASE WHEN $4 THEN now() END)`, briefIDs[i], fmt.Sprintf("spa03-brief-%d", i), visibility[i], deletedBrief); err != nil {
			t.Fatal(err)
		}
		deletedQuest := i == 3
		if _, err := productExec(t, pool, ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by,deleted_at)
SELECT $1,$2,ARRAY['standard'],m.id,now()+interval '1 day',d.id,m.id,CASE WHEN $3 THEN now() END
FROM members m JOIN documents d ON d.public_id=$4 WHERE m.public_id=$5`, questIDs[i], fmt.Sprintf("SPA03-Q%d", i), deletedQuest, briefIDs[i], actorID); err != nil {
			t.Fatal(err)
		}
		if _, err := productExec(t, pool, ctx, `INSERT INTO quest_regions(quest_id,region_id) SELECT q.id,r.id FROM quests q,regions r WHERE q.public_id=$1 AND r.public_id=$2`, questIDs[i], regionID); err != nil {
			t.Fatal(err)
		}
	}
	var countedRegion uuid.UUID
	var nodeCount, questCount int32
	var countOverride bool
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String(), "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": "", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}).Scan(&countedRegion, &nodeCount, &questCount, &countOverride); err != nil || countedRegion != regionID || nodeCount != 1 || questCount != 3 || countOverride {
		t.Fatalf("region counts region=%s nodes=%d quests=%d override=%t err=%v", countedRegion, nodeCount, questCount, countOverride, err)
	}
	activityArgs := pgx.StrictNamedArgs{"atlas_code": "spa03-activity", "as_of": time.Now().UTC()}
	activityRows, err := productQuery(t, pool, ctx, productSQL(t, "ReadProductRegionActivity", ":many"), activityArgs)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[uuid.UUID]bool{}
	for activityRows.Next() {
		var gotRegion, questID uuid.UUID
		var regionName, shortCode string
		var filling, scheduled, live int32
		var scheduledAt time.Time
		var slotsMax, filledCount int32
		var displayStatus string
		if err := activityRows.Scan(&gotRegion, &regionName, &filling, &scheduled, &live, &questID, &shortCode, &scheduledAt, &slotsMax, &filledCount, &displayStatus); err != nil {
			t.Fatal(err)
		}
		if gotRegion != regionID || regionName != "SPA03 activity region" {
			t.Fatalf("activity region=%s name=%q", gotRegion, regionName)
		}
		seen[questID] = true
	}
	if err := activityRows.Err(); err != nil {
		t.Fatal(err)
	}
	activityRows.Close()
	if len(seen) != 3 || !seen[questIDs[0]] || !seen[questIDs[1]] || !seen[questIDs[2]] || seen[questIDs[3]] {
		t.Fatalf("region activity quest IDs=%v; expected public, private-brief and tombstoned-brief quests, excluding tombstoned quest", seen)
	}
	if _, err := productExec(t, pool, ctx, `UPDATE regions SET deleted_at=now() WHERE public_id=$1`, regionID); err != nil {
		t.Fatalf("seed tombstoned region for read exclusion: %v", err)
	}
	var tombstonedRegion uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String(), "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": "", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}).Scan(&tombstonedRegion, new(int32), new(int32), new(bool)); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GetProductRegionCounts should omit tombstoned region %s, got region=%s err=%v", regionID, tombstonedRegion, err)
	}
	missingRegionID := uuid.New()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": missingRegionID.String(), "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": "", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}).Scan(new(uuid.UUID), new(int32), new(int32), new(bool)); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GetProductRegionCounts should return no row for missing region %s, err=%v", missingRegionID, err)
	}
}

func TestProductSQLPointcrawlVisibilityAndEdgeTopologyOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	var actorInternal int64
	var actorID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status)
VALUES ('spa03-pc-actor','spa03-pc-actor','SPA03 pointcrawl actor',ARRAY['admin'],'active') RETURNING id,public_id`).Scan(&actorInternal, &actorID); err != nil {
		t.Fatal(err)
	}
	var mapID uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CreateProductMap", ":one"), pgx.StrictNamedArgs{"name": "SPA03 pointcrawl", "atlas_code": "spa03-pointcrawl", "map_kind": "pointcrawl", "family": "campaign", "grid": "point", "region_id": nil, "asset_path": nil, "actor_id": actorID.String()}).Scan(&mapID, new(string), new(string), new(string), new(string), new(string), new(*uuid.UUID), new(*string), new(time.Time), new(*uuid.UUID)); err != nil {
		t.Fatalf("create pointcrawl map: %v", err)
	}
	var updatedName, updatedGrid string
	var updatedAsset *string
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpdateProductMap", ":one"), pgx.StrictNamedArgs{"map_id": mapID.String(), "name": "SPA03 renamed", "family": "campaign", "grid": "hex", "asset_path": "/maps/spa03.png"}).Scan(new(uuid.UUID), &updatedName, new(string), new(string), new(string), &updatedGrid, new(*uuid.UUID), &updatedAsset, new(time.Time), new(*uuid.UUID)); err != nil || updatedName != "SPA03 renamed" || updatedGrid != "hex" || updatedAsset == nil || *updatedAsset != "/maps/spa03.png" {
		t.Fatalf("update map name=%q grid=%q asset=%v err=%v", updatedName, updatedGrid, updatedAsset, err)
	}
	if _, err := productExec(t, pool, ctx, `UPDATE maps SET grid='square' WHERE public_id=$1`, mapID); err == nil {
		t.Fatal("maps.grid accepted a value outside point and hex")
	}
	var mapInternal int64
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1`, mapID).Scan(&mapInternal); err != nil {
		t.Fatal(err)
	}
	locationVisible := uuid.MustParse("00000000-0000-4000-8000-000000000101")
	locationHidden := uuid.MustParse("00000000-0000-4000-8000-000000000102")
	subjectDoc := uuid.MustParse("00000000-0000-4000-8000-000000000103")
	for _, item := range []struct {
		id, slug, title, category, status string
	}{
		{locationVisible.String(), "spa03-location-visible", "Visible location", "Locations", "published"},
		{locationHidden.String(), "spa03-location-hidden", "Hidden location", "Locations", "draft"},
		{subjectDoc.String(), "spa03-subject", "Subject lore", "Lore", "published"},
	} {
		if _, err := productExec(t, pool, ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility)
VALUES ($1,'codex_entry',$2,$3,$4,$5,'public')`, item.id, item.slug, item.title, item.category, item.status); err != nil {
			t.Fatal(err)
		}
	}
	nodes := []uuid.UUID{
		uuid.MustParse("00000000-0000-4000-8000-000000000001"),
		uuid.MustParse("00000000-0000-4000-8000-000000000002"),
		uuid.MustParse("00000000-0000-4000-8000-000000000003"),
		uuid.MustParse("00000000-0000-4000-8000-000000000004"),
	}
	for i, nodeID := range nodes {
		if _, err := productExec(t, pool, ctx, `INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,created_at)
VALUES ($1,$2,$3,$4,$5,$6)`, nodeID, mapInternal, fmt.Sprintf("node-%d", i+1), float64(i), float64(i+1), time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
	}
	var visibleDocInternal, hiddenDocInternal, subjectInternal int64
	for publicID, target := range map[uuid.UUID]*int64{locationVisible: &visibleDocInternal, locationHidden: &hiddenDocInternal, subjectDoc: &subjectInternal} {
		if err := productQueryRow(t, pool, ctx, `SELECT id FROM documents WHERE public_id=$1`, publicID).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	insertLink := func(node uuid.UUID, docID int64, relation string) {
		t.Helper()
		if _, err := productExec(t, pool, ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by)
SELECT $1,n.id,$2,$3,$4,$5 FROM pointcrawl_nodes n WHERE n.public_id=$6`, mapInternal, docID, relation, time.Now().UTC(), actorInternal, node); err != nil {
			t.Fatal(err)
		}
	}
	insertLink(nodes[0], visibleDocInternal, "location")
	insertLink(nodes[1], subjectInternal, "subject")
	insertLink(nodes[2], hiddenDocInternal, "location")
	insertLink(nodes[2], subjectInternal, "subject")
	insertLink(nodes[3], visibleDocInternal, "location")

	keys := fmt.Sprintf(`[{"parent_id":%q,"limit":20,"offset":0}]`, mapID.String())
	viewerArgs := pgx.StrictNamedArgs{"keys": keys, "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": nil, "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	queryNodes, err := productQuery(t, pool, ctx, productSQL(t, "ListProductPointcrawlNodesForMaps", ":many"), viewerArgs)
	if err != nil {
		t.Fatal(err)
	}
	visible := map[uuid.UUID]bool{}
	for queryNodes.Next() {
		var ordinal int
		var parentID, resultMapID uuid.UUID
		var parentExists bool
		var nodeID uuid.UUID
		var name string
		var x, y float64
		var createdAt time.Time
		var submap *uuid.UUID
		if err := queryNodes.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &nodeID, &name, &x, &y, &createdAt, &submap, new(string), new(bool)); err != nil {
			t.Fatal(err)
		}
		if ordinal != 1 || !parentExists || parentID != mapID || resultMapID != mapID {
			t.Fatalf("node batch parent correspondence ordinal=%d parent=%s map=%s exists=%t", ordinal, parentID, resultMapID, parentExists)
		}
		visible[nodeID] = true
	}
	if err := queryNodes.Err(); err != nil {
		t.Fatal(err)
	}
	queryNodes.Close()
	if len(visible) != 3 || !visible[nodes[0]] || !visible[nodes[1]] || !visible[nodes[3]] || visible[nodes[2]] {
		t.Fatalf("visible node identities=%v, want no-location, public-location, and mixed-location node only", visible)
	}
	missingPointMap := uuid.New()
	nodePresenceKeys := fmt.Sprintf(`[{"parent_id":%q,"limit":20,"offset":0},{"parent_id":%q,"limit":20,"offset":99},{"parent_id":%q,"limit":20,"offset":0}]`, mapID.String(), mapID.String(), missingPointMap.String())
	nodePresenceArgs := pgx.StrictNamedArgs{"keys": nodePresenceKeys, "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": nil, "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	nodePresenceRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductPointcrawlNodesForMaps", ":many"), nodePresenceArgs)
	if err != nil {
		t.Fatal(err)
	}
	var nodeOrdinals []int
	for nodePresenceRows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var resultMap *uuid.UUID
		var parentExists bool
		var nodeID *uuid.UUID
		if err := nodePresenceRows.Scan(&ordinal, &parentID, &resultMap, &parentExists, &nodeID, new(*string), new(*float64), new(*float64), new(*time.Time), new(*uuid.UUID), new(*string), new(bool)); err != nil {
			t.Fatal(err)
		}
		nodeOrdinals = append(nodeOrdinals, ordinal)
		switch ordinal {
		case 1:
			if parentID != mapID || resultMap == nil || *resultMap != mapID || !parentExists || nodeID == nil {
				t.Fatalf("node batch child correspondence parent=%s map=%v node=%v exists=%t", parentID, resultMap, nodeID, parentExists)
			}
		case 2:
			if parentID != mapID || resultMap == nil || *resultMap != mapID || !parentExists || nodeID != nil {
				t.Fatalf("node page-past-end marker parent=%s map=%v node=%v exists=%t", parentID, resultMap, nodeID, parentExists)
			}
		case 3:
			if parentID != missingPointMap || resultMap != nil || parentExists || nodeID != nil {
				t.Fatalf("missing pointcrawl-map marker parent=%s map=%v node=%v exists=%t", parentID, resultMap, nodeID, parentExists)
			}
		default:
			t.Fatalf("unexpected pointcrawl node batch ordinal %d", ordinal)
		}
	}
	if err := nodePresenceRows.Err(); err != nil {
		t.Fatal(err)
	}
	nodePresenceRows.Close()
	if fmt.Sprint(nodeOrdinals) != "[1 1 1 2 3]" {
		t.Fatalf("pointcrawl node batch ordinals=%v", nodeOrdinals)
	}

	setEdge := productSQL(t, "SetProductPointcrawlEdge", ":one")
	writeNodeEdge := func(edgeID *uuid.UUID, a, b uuid.UUID, kind string) (uuid.UUID, uuid.UUID) {
		t.Helper()
		var gotID, gotA uuid.UUID
		var returnedKind string
		var providedID any
		if edgeID != nil {
			providedID = edgeID.String()
		}
		err := productQueryRow(t, pool, ctx, setEdge, pgx.StrictNamedArgs{"edge_id": providedID, "node_a": a.String(), "node_b": b.String(), "map_id": mapID.String(), "directed": false, "kind": kind, "label": nil, "document_id": nil}).Scan(&gotID, new(uuid.UUID), &gotA, new(uuid.UUID), new(bool), &returnedKind, new(*string), new(*uuid.UUID))
		if err != nil || returnedKind != kind {
			t.Fatal(err)
		}
		return gotID, gotA
	}
	gotEdge, gotA := writeNodeEdge(nil, nodes[1], nodes[0], "path")
	if gotEdge == uuid.Nil || gotA != nodes[0] {
		t.Fatalf("undirected edge id=%s canonical node_a=%s, want a generated id and %s", gotEdge, gotA, nodes[0])
	}
	updatedEdge, _ := writeNodeEdge(&gotEdge, nodes[1], nodes[0], "road")
	if updatedEdge != gotEdge {
		t.Fatalf("pointcrawl edge update changed id from %s to %s", gotEdge, updatedEdge)
	}
	pointEdgeLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedPointEdge uuid.UUID
	if err := productQueryRow(t, pointEdgeLocker, ctx, productSQL(t, "LockProductPointcrawlEdge", ":one"), pgx.StrictNamedArgs{"edge_id": gotEdge.String()}).Scan(new(int64), &lockedPointEdge, new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(bool), new(string), new(*string), new(*uuid.UUID)); err != nil || lockedPointEdge != gotEdge {
		_ = pointEdgeLocker.Rollback(ctx)
		t.Fatalf("lock pointcrawl edge id=%s err=%v", lockedPointEdge, err)
	}
	if err := pointEdgeLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	hiddenEdgeID, _ := writeNodeEdge(nil, nodes[0], nodes[2], "path")
	if hiddenEdgeID == uuid.Nil {
		t.Fatal("hidden-endpoint edge write returned empty generated id")
	}
	edgeArgs := pgx.StrictNamedArgs{"keys": keys, "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": nil, "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	edgeRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductPointcrawlEdgesForMaps", ":many"), edgeArgs)
	if err != nil {
		t.Fatal(err)
	}
	var edgeCount int
	var seenPublicEdge bool
	for edgeRows.Next() {
		var ordinal int
		var parentID, resultMapID, edgeID, nodeA, nodeB uuid.UUID
		var parentExists bool
		var directed bool
		var kind string
		var label, doc *string
		if err := edgeRows.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &edgeID, &nodeA, &nodeB, &directed, &kind, &label, &doc, new(bool)); err != nil {
			t.Fatal(err)
		}
		edgeCount++
		seenPublicEdge = edgeID == gotEdge
		if edgeID == hiddenEdgeID {
			t.Fatal("edge with hidden endpoint leaked through map-edge read")
		}
	}
	if err := edgeRows.Err(); err != nil {
		t.Fatal(err)
	}
	edgeRows.Close()
	if edgeCount != 1 || !seenPublicEdge {
		t.Fatalf("visible pointcrawl edges count=%d publicEdge=%t", edgeCount, seenPublicEdge)
	}
	edgePresenceKeys := fmt.Sprintf(`[{"parent_id":%q,"limit":20,"offset":0},{"parent_id":%q,"limit":20,"offset":99},{"parent_id":%q,"limit":20,"offset":0}]`, mapID.String(), mapID.String(), missingPointMap.String())
	edgePresenceArgs := pgx.StrictNamedArgs{"keys": edgePresenceKeys, "viewer_id": nil, "viewer_roles": []string{}, "viewer_handle": nil, "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	edgePresenceRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductPointcrawlEdgesForMaps", ":many"), edgePresenceArgs)
	if err != nil {
		t.Fatal(err)
	}
	var pointEdgeOrdinals []int
	for edgePresenceRows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var resultMap, resultEdge *uuid.UUID
		var parentExists bool
		if err := edgePresenceRows.Scan(&ordinal, &parentID, &resultMap, &parentExists, &resultEdge, new(*uuid.UUID), new(*uuid.UUID), new(*bool), new(*string), new(*string), new(*uuid.UUID), new(bool)); err != nil {
			t.Fatal(err)
		}
		pointEdgeOrdinals = append(pointEdgeOrdinals, ordinal)
		switch ordinal {
		case 1:
			if parentID != mapID || resultMap == nil || *resultMap != mapID || !parentExists || resultEdge == nil || *resultEdge != gotEdge {
				t.Fatalf("pointcrawl-edge child correspondence parent=%s map=%v edge=%v exists=%t", parentID, resultMap, resultEdge, parentExists)
			}
		case 2:
			if parentID != mapID || resultMap == nil || *resultMap != mapID || !parentExists || resultEdge != nil {
				t.Fatalf("pointcrawl-edge page-past-end marker parent=%s map=%v edge=%v exists=%t", parentID, resultMap, resultEdge, parentExists)
			}
		case 3:
			if parentID != missingPointMap || resultMap != nil || parentExists || resultEdge != nil {
				t.Fatalf("missing pointcrawl-edge parent marker parent=%s map=%v edge=%v exists=%t", parentID, resultMap, resultEdge, parentExists)
			}
		default:
			t.Fatalf("unexpected pointcrawl edge batch ordinal %d", ordinal)
		}
	}
	if err := edgePresenceRows.Err(); err != nil {
		t.Fatal(err)
	}
	edgePresenceRows.Close()
	if fmt.Sprint(pointEdgeOrdinals) != "[1 2 3]" {
		t.Fatalf("pointcrawl edge batch ordinals=%v", pointEdgeOrdinals)
	}
	pointLinkArgs := pgx.StrictNamedArgs{"map_id": mapID.String(), "node_id": nodes[1].String(), "document_id": locationVisible.String(), "relation": "location", "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	var linkedMap, linkedNode, linkedDoc, linkedActor uuid.UUID
	var linkedRelation string
	var linkedAt time.Time
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductPointcrawlEntry", ":one"), pointLinkArgs).Scan(&linkedMap, &linkedNode, &linkedDoc, &linkedRelation, &linkedAt, &linkedActor); err != nil || linkedMap != mapID || linkedNode != nodes[1] || linkedDoc != locationVisible || linkedRelation != "location" || linkedActor != actorID {
		t.Fatalf("pointcrawl link map=%s node=%s doc=%s relation=%q actor=%s err=%v", linkedMap, linkedNode, linkedDoc, linkedRelation, linkedActor, err)
	}
	// A hex may hold many Locations: a second, different Location links to the same node,
	// while linking the same Location twice stays a conflict.
	secondLocationArgs := pgx.StrictNamedArgs{"map_id": mapID.String(), "node_id": nodes[1].String(), "document_id": locationHidden.String(), "relation": "location", "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductPointcrawlEntry", ":one"), secondLocationArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(string), new(time.Time), new(uuid.UUID)); err != nil {
		t.Fatalf("second location on one node: %v", err)
	}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductPointcrawlEntry", ":one"), secondLocationArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(string), new(time.Time), new(uuid.UUID)); err == nil {
		t.Fatal("linking the same Location twice was accepted")
	}
	unlinkSecond := productSQL(t, "UnlinkProductPointcrawlEntry", ":one")
	var removed int32
	if err := productQueryRow(t, pool, ctx, unlinkSecond, pgx.StrictNamedArgs{"map_id": mapID.String(), "node_id": nodes[1].String(), "document_id": locationHidden.String(), "relation": "location"}).Scan(&removed); err != nil || removed != 1 {
		t.Fatalf("unlink second location removed=%d err=%v", removed, err)
	}
	missingNodeID := uuid.New()
	linkKeys := fmt.Sprintf(`[{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":99},{"parent_id":%q,"limit":10,"offset":0}]`, nodes[1].String(), nodes[1].String(), missingNodeID.String())
	pointLinkReadArgs := pgx.StrictNamedArgs{"keys": linkKeys, "viewer_id": actorID.String(), "viewer_roles": []string{"admin"}, "viewer_handle": "spa03-pc-actor", "viewer_admin": true, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	pointLinkRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductPointcrawlLinksForNodes", ":many"), pointLinkReadArgs)
	if err != nil {
		t.Fatal(err)
	}
	var sawLinkedLocation bool
	var pointLinkOrdinals []int
	for pointLinkRows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var resultMapID, resultNodeID, resultDocID, creatorID *uuid.UUID
		var parentExists bool
		var relation *string
		var createdAt *time.Time
		if err := pointLinkRows.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &resultNodeID, &resultDocID, &relation, &createdAt, &creatorID, new(bool)); err != nil {
			t.Fatal(err)
		}
		pointLinkOrdinals = append(pointLinkOrdinals, ordinal)
		switch ordinal {
		case 1:
			if !parentExists || parentID != nodes[1] || resultMapID == nil || *resultMapID != mapID || resultNodeID == nil || *resultNodeID != nodes[1] || createdAt == nil {
				t.Fatalf("pointcrawl link child correspondence parent=%s map=%v node=%v exists=%t", parentID, resultMapID, resultNodeID, parentExists)
			}
		case 2:
			if !parentExists || parentID != nodes[1] || resultMapID == nil || *resultMapID != mapID || resultNodeID == nil || *resultNodeID != nodes[1] || resultDocID != nil || relation == nil || *relation != "" {
				t.Fatalf("pointcrawl link page-past-end marker parent=%s map=%v node=%v doc=%v relation=%v exists=%t", parentID, resultMapID, resultNodeID, resultDocID, relation, parentExists)
			}
		case 3:
			if parentExists || parentID != missingNodeID || resultMapID != nil || resultNodeID != nil || resultDocID != nil || relation == nil || *relation != "" {
				t.Fatalf("missing pointcrawl-link parent marker parent=%s map=%v node=%v doc=%v relation=%v exists=%t", parentID, resultMapID, resultNodeID, resultDocID, relation, parentExists)
			}
		default:
			t.Fatalf("unexpected pointcrawl link batch ordinal %d", ordinal)
		}
		if resultDocID != nil && *resultDocID == locationVisible && relation != nil && *relation == "location" && creatorID != nil && *creatorID == actorID {
			sawLinkedLocation = true
		}
	}
	if err := pointLinkRows.Err(); err != nil {
		t.Fatal(err)
	}
	pointLinkRows.Close()
	if !sawLinkedLocation || fmt.Sprint(pointLinkOrdinals) != "[1 1 2 3]" {
		t.Fatalf("pointcrawl link read sawLocation=%t ordinals=%v", sawLinkedLocation, pointLinkOrdinals)
	}
	delete(pointLinkArgs, "recorded_at")
	delete(pointLinkArgs, "actor_id")
	var pointUnlinked int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UnlinkProductPointcrawlEntry", ":one"), pointLinkArgs).Scan(&pointUnlinked); err != nil || pointUnlinked != 1 {
		t.Fatalf("pointcrawl unlink count=%d err=%v", pointUnlinked, err)
	}
}
