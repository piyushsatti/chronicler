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
		"GetProductMap", "ListProductMaps", "GetProductHex", "ListProductHexesForMaps",
		"ListProductHexEdgesForMaps", "ListProductPointcrawlNodesForMaps",
		"ListProductPointcrawlEdgesForMaps", "ListProductHexLinksForHexes",
		"ListProductPointcrawlLinksForNodes", "GetProductRegionCounts",
		"ListProductArchonAssignments", "ListProductHexHistory", "ReadProductGameDate",
		"ReadProductCalendar", "ListProductCalendarCells", "ListProductTimeAnchors",
		"LockProductMapByAtlasCode", "LockProductHex", "CreateProductMap",
		"UpdateProductHex", "SetProductHexEdge", "SetProductPointcrawlEdge",
		"LinkProductHexEntry", "UnlinkProductHexEntry", "LinkProductPointcrawlEntry",
		"UnlinkProductPointcrawlEntry", "UpsertProductPoi", "AssignProductArchon",
		"RevokeProductArchon", "RestoreProductRegion",
		"TransitionProductRegion", "CreateProductTimeAnchor", "UpdateProductTimeAnchor",
		"UpdateProductCalendar", "AppendProductCalendarChange", "ReadProductContainmentEdges",
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

func TestProductSQLReadsWritesHistoryAndPagingOnPostgres(t *testing.T) {
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

	var mapOneID, mapTwoID uuid.UUID
	createMap := productSQL(t, "CreateProductMap", ":one")
	for index, code := range []string{"spa03-a", "spa03-b"} {
		var got uuid.UUID
		var name, atlasCode, mapKind, family string
		var returnedRegion *uuid.UUID
		var cols, rows sql.NullInt32
		var assetPath *string
		var createdAt time.Time
		var createdBy *uuid.UUID
		historyID := uuid.New()
		recordedAt := time.Now().UTC().Add(-time.Hour).Truncate(time.Microsecond)
		err := productQueryRow(t, pool, ctx, createMap, pgx.StrictNamedArgs{
			"name": "SPA03 " + code, "atlas_code": code, "map_kind": "hexgrid", "family": "campaign",
			"region_id": regionUUID.String(), "cols": int32(3), "rows": int32(2), "asset_path": nil,
			"actor_id": actorUUID.String(), "history_id": historyID.String(), "recorded_at": recordedAt,
		}).Scan(&got, &name, &atlasCode, &mapKind, &family, &returnedRegion, &cols, &rows, &assetPath, &createdAt, &createdBy)
		if err != nil {
			t.Fatalf("CreateProductMap %s: %v", code, err)
		}
		if got == uuid.Nil {
			t.Fatal("CreateProductMap returned an empty public identity")
		}
		var historyMapID, historyRegionID, historyCreatorID sql.NullString
		var historyName, historyAtlasCode, historyMapKind, historyFamily string
		var historyCreatedAt, historyRecordedAt time.Time
		var historyCols, historyRows sql.NullInt32
		var historyAssetPath sql.NullString
		var historyFieldCount int
		if err := productQueryRow(t, pool, ctx, `SELECT new_value->>'id',(new_value->>'createdAt')::timestamptz,
new_value->>'name',new_value->>'atlasCode',new_value->>'mapKind',new_value->>'family',
new_value->>'regionId',(new_value->>'cols')::int,(new_value->>'rows')::int,new_value->>'assetPath',
new_value->>'createdBy',recorded_at,(SELECT count(*) FROM jsonb_object_keys(new_value))
FROM map_changes WHERE public_id=$1 AND affected_type='map'`, historyID).Scan(
			&historyMapID, &historyCreatedAt, &historyName, &historyAtlasCode, &historyMapKind, &historyFamily,
			&historyRegionID, &historyCols, &historyRows, &historyAssetPath,
			&historyCreatorID, &historyRecordedAt, &historyFieldCount); err != nil {
			t.Fatalf("read full map creation history %s: %v", code, err)
		}
		if !historyMapID.Valid || historyMapID.String != got.String() || !historyCreatedAt.Equal(createdAt) ||
			historyName != name || historyAtlasCode != atlasCode || historyMapKind != mapKind || historyFamily != family ||
			!historyRegionID.Valid || historyRegionID.String != regionUUID.String() || !historyCols.Valid || historyCols.Int32 != 3 ||
			!historyRows.Valid || historyRows.Int32 != 2 || historyAssetPath.Valid ||
			!historyCreatorID.Valid || historyCreatorID.String != actorUUID.String() || !historyRecordedAt.Equal(recordedAt) ||
			historyRecordedAt.Equal(historyCreatedAt) || historyFieldCount != 11 {
			t.Fatalf("map creation history does not preserve full returned map facts: id=%v created=%s record=%s fields=%d", historyMapID, historyCreatedAt, historyRecordedAt, historyFieldCount)
		}
		if index == 0 {
			mapOneID = got
		} else {
			mapTwoID = got
		}
	}
	var historyCount int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM map_changes WHERE map_id IN (SELECT id FROM maps WHERE atlas_code LIKE 'spa03-%')`).Scan(&historyCount); err != nil || historyCount != 2 {
		t.Fatalf("map create history count=%d err=%v", historyCount, err)
	}
	mapByCodeTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedMapByCode uuid.UUID
	if err := productQueryRow(t, mapByCodeTx, ctx, productSQL(t, "LockProductMapByAtlasCode", ":one"), pgx.StrictNamedArgs{"atlas_code": "spa03-a"}).Scan(new(int64), &lockedMapByCode, new(string), new(string), new(string), new(string), new(int64), new(sql.NullInt32), new(sql.NullInt32), new(*string), new(time.Time), new(*int64)); err != nil || lockedMapByCode != mapOneID {
		_ = mapByCodeTx.Rollback(ctx)
		t.Fatalf("lock map by atlas code id=%s err=%v", lockedMapByCode, err)
	}
	if err := mapByCodeTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	assignSQL := productSQL(t, "AssignProductArchon", ":one")
	grantHistoryID := uuid.New()
	var grantRegion, grantMember, grantActor uuid.UUID
	var grantedAt time.Time
	assignArgs := pgx.StrictNamedArgs{"recorded_at": time.Now().UTC(), "actor_id": actorUUID.String(), "member_id": actorUUID.String(), "region_id": regionUUID.String(), "history_id": grantHistoryID.String()}
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
	assignArgs["history_id"] = uuid.NewString()
	var duplicateGrantedAt time.Time
	if err := productQueryRow(t, pool, ctx, assignSQL, assignArgs).Scan(new(uuid.UUID), new(uuid.UUID), &duplicateGrantedAt, new(uuid.UUID)); err != nil || !duplicateGrantedAt.Equal(grantedAt) {
		t.Fatalf("duplicate assignment grantedAt=%s want original %s err=%v", duplicateGrantedAt, grantedAt, err)
	}
	var secondMember uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-archon-2','spa03-archon-2','SPA03 archon 2',ARRAY['archon'],'active') RETURNING public_id`).Scan(&secondMember); err != nil {
		t.Fatal(err)
	}
	secondAssignArgs := pgx.StrictNamedArgs{"recorded_at": time.Now().UTC(), "actor_id": actorUUID.String(), "member_id": secondMember.String(), "region_id": regionUUID.String(), "history_id": uuid.NewString()}
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
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM assignment_changes WHERE assignment_kind='archon' AND region_id=$1 AND member_id=$2`, regionID, actorID).Scan(&historyCount); err != nil || historyCount != 1 {
		t.Fatalf("duplicate assignment history count=%d err=%v", historyCount, err)
	}
	revokeArgs := pgx.StrictNamedArgs{"member_id": actorUUID.String(), "region_id": regionUUID.String(), "history_id": uuid.NewString(), "actor_id": actorUUID.String(), "recorded_at": time.Now().UTC()}
	revokeResult, err := productExec(t, pool, ctx, productSQL(t, "RevokeProductArchon", ":execrows"), revokeArgs)
	if err != nil {
		t.Fatal(err)
	}
	revokedRows := revokeResult.RowsAffected()
	if revokedRows != 1 {
		t.Fatalf("revoke assignment rows=%d", revokedRows)
	}
	var revokedGrantor uuid.UUID
	var originalGrantAtPreserved, revokeHasNullNew bool
	if err := productQueryRow(t, pool, ctx, `SELECT (old_value->>'grantedBy')::uuid,(old_value->>'grantedAt')::timestamptz=$2::timestamptz,new_value IS NULL FROM assignment_changes WHERE public_id=$1`, revokeArgs["history_id"], grantedAt).Scan(&revokedGrantor, &originalGrantAtPreserved, &revokeHasNullNew); err != nil || revokedGrantor != actorUUID || !originalGrantAtPreserved || !revokeHasNullNew {
		t.Fatalf("revoke history grantor=%s timePreserved=%t newIsNull=%t err=%v", revokedGrantor, originalGrantAtPreserved, revokeHasNullNew, err)
	}
	revokeArgs["history_id"] = uuid.NewString()
	revokeResult, err = productExec(t, pool, ctx, productSQL(t, "RevokeProductArchon", ":execrows"), revokeArgs)
	if err != nil {
		t.Fatal(err)
	}
	revokedRows = revokeResult.RowsAffected()
	if revokedRows != 0 {
		t.Fatalf("repeat revoke rows=%d", revokedRows)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM assignment_changes WHERE assignment_kind='archon' AND region_id=$1 AND member_id=$2`, regionID, actorID).Scan(&historyCount); err != nil || historyCount != 2 {
		t.Fatalf("grant/revoke history count=%d err=%v", historyCount, err)
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

	var mapOneInternal int64
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE atlas_code='spa03-a'`).Scan(&mapOneInternal); err != nil {
		t.Fatal(err)
	}
	var hexID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row,terrain) VALUES ($1,0,0,'forest') RETURNING public_id`, mapOneInternal).Scan(&hexID); err != nil {
		t.Fatal(err)
	}
	var foundHex uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductHex", ":one"), pgx.StrictNamedArgs{"map_id": mapOneID.String(), "col": int32(0), "row": int32(0)}).Scan(&foundHex, new(uuid.UUID), new(int32), new(int32), new(*string), new(*string), new(*string), new(*time.Time), new(*uuid.UUID)); err != nil {
		t.Fatalf("GetProductHex: %v", err)
	}
	if foundHex != hexID {
		t.Fatalf("hex identity=%s, want %s", foundHex, hexID)
	}
	var secondHex, foreignHex uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row,terrain) VALUES ($1,1,0,'plain') RETURNING public_id`, mapOneInternal).Scan(&secondHex); err != nil {
		t.Fatal(err)
	}
	var mapTwoInternal int64
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1`, mapTwoID).Scan(&mapTwoInternal); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row,terrain) VALUES ($1,0,0,'plain') RETURNING public_id`, mapTwoInternal).Scan(&foreignHex); err != nil {
		t.Fatal(err)
	}
	hexUpdateHistory := uuid.New()
	hexUpdateArgs := pgx.StrictNamedArgs{"hex_id": hexID.String(), "terrain_set": true, "terrain": "bog", "elevation_set": true, "elevation": "low", "climate_set": true, "climate": "humid", "submap_set": false, "submap_id": nil, "history_id": hexUpdateHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorUUID.String(), "note": "terrain survey"}
	var updatedHex uuid.UUID
	var updatedTerrain, updatedElevation, updatedClimate *string
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpdateProductHex", ":one"), hexUpdateArgs).Scan(&updatedHex, new(uuid.UUID), new(int32), new(int32), &updatedTerrain, &updatedElevation, &updatedClimate, new(*time.Time), new(*uuid.UUID)); err != nil || updatedHex != hexID || updatedTerrain == nil || *updatedTerrain != "bog" || updatedElevation == nil || *updatedElevation != "low" || updatedClimate == nil || *updatedClimate != "humid" {
		t.Fatalf("hex update id=%s terrain=%v elevation=%v climate=%v err=%v", updatedHex, updatedTerrain, updatedElevation, updatedClimate, err)
	}
	noopHexArgs := pgx.StrictNamedArgs{}
	for key, value := range hexUpdateArgs {
		noopHexArgs[key] = value
	}
	noopHexArgs["history_id"] = uuid.NewString()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpdateProductHex", ":one"), noopHexArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(int32), new(int32), new(*string), new(*string), new(*string), new(*time.Time), new(*uuid.UUID)); err != nil {
		t.Fatalf("unchanged hex update: %v", err)
	}
	var hexHistoryPayload []byte
	if err := productQueryRow(t, pool, ctx, `SELECT payload FROM hex_changes WHERE public_id=$1`, hexUpdateHistory).Scan(&hexHistoryPayload); err != nil || !strings.Contains(string(hexHistoryPayload), "terrain survey") || !strings.Contains(string(hexHistoryPayload), "bog") {
		t.Fatalf("hex update history payload=%s err=%v", hexHistoryPayload, err)
	}
	var updatesForHex int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM hex_changes WHERE hex_id=(SELECT id FROM hexes WHERE public_id=$1) AND kind='terrain_change'`, hexID).Scan(&updatesForHex); err != nil || updatesForHex != 1 {
		t.Fatalf("hex terrain history count=%d err=%v", updatesForHex, err)
	}
	poiHistory := uuid.New()
	poiArgs := pgx.StrictNamedArgs{"poi_id": nil, "hex_id": hexID.String(), "poi_type": "landmark", "discovery_tier": "hidden", "is_charter_objective": false, "document_id": nil, "history_id": poiHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorUUID.String()}
	var poiID, poiHex uuid.UUID
	var poiType, poiTier string
	var charterObjective bool
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPoi", ":one"), poiArgs).Scan(&poiID, &poiHex, &poiType, &poiTier, &charterObjective, new(*uuid.UUID)); err != nil || poiID == uuid.Nil || poiHex != hexID || poiType != "landmark" || poiTier != "hidden" || charterObjective {
		t.Fatalf("POI create id=%s hex=%s type=%s tier=%s charter=%t err=%v", poiID, poiHex, poiType, poiTier, charterObjective, err)
	}
	poiLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedPoiID uuid.UUID
	if err := productQueryRow(t, poiLocker, ctx, productSQL(t, "LockProductPoi", ":one"), pgx.StrictNamedArgs{"poi_id": poiID.String()}).Scan(new(int64), &lockedPoiID, new(uuid.UUID), new(string), new(string), new(bool), new(*uuid.UUID)); err != nil || lockedPoiID != poiID {
		_ = poiLocker.Rollback(ctx)
		t.Fatalf("lock POI id=%s err=%v", lockedPoiID, err)
	}
	if err := poiLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	poiArgs["poi_id"], poiArgs["poi_type"], poiArgs["discovery_tier"], poiArgs["history_id"] = poiID.String(), "settlement", "secret", uuid.NewString()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPoi", ":one"), poiArgs).Scan(new(uuid.UUID), new(uuid.UUID), &poiType, &poiTier, &charterObjective, new(*uuid.UUID)); err != nil || poiType != "settlement" || poiTier != "secret" {
		t.Fatalf("POI update type=%s tier=%s err=%v", poiType, poiTier, err)
	}
	var poiChanges int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM hex_changes WHERE hex_id=(SELECT id FROM hexes WHERE public_id=$1) AND kind='feature_added'`, hexID).Scan(&poiChanges); err != nil || poiChanges != 2 {
		t.Fatalf("POI add/update history count=%d err=%v", poiChanges, err)
	}
	var countRegion uuid.UUID
	var countHexes, countQuests int32
	regionCountsArgs := pgx.StrictNamedArgs{"region_id": regionUUID.String()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), regionCountsArgs).Scan(&countRegion, &countHexes, &countQuests); err != nil || countRegion != regionUUID || countHexes != 3 || countQuests != 0 {
		t.Fatalf("region counts region=%s hexes=%d quests=%d err=%v", countRegion, countHexes, countQuests, err)
	}
	mapLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, mapLocker, ctx, productSQL(t, "LockProductMap", ":one"), pgx.StrictNamedArgs{"map_id": mapOneID.String()}).Scan(new(int64), new(uuid.UUID), new(string), new(string), new(string), new(string), new(*uuid.UUID), new(sql.NullInt32), new(sql.NullInt32), new(*string), new(time.Time), new(*uuid.UUID)); err != nil {
		_ = mapLocker.Rollback(ctx)
		t.Fatalf("lock product map: %v", err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1 FOR UPDATE NOWAIT`, mapOneID).Scan(new(int64)); err == nil {
		_ = mapLocker.Rollback(ctx)
		t.Fatal("second transaction acquired locked product map")
	}
	if err := mapLocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1 FOR UPDATE NOWAIT`, mapOneID).Scan(new(int64)); err != nil {
		t.Fatalf("map row remained locked after rollback: %v", err)
	}
	setHexEdge := productSQL(t, "SetProductHexEdge", ":one")
	edgeHistory := uuid.New()
	edgeArgs := pgx.StrictNamedArgs{"edge_type": "road", "a_side": "north", "document_id": nil, "hex_a": hexID.String(), "hex_b": secondHex.String(), "map_id": mapOneID.String(), "history_id": edgeHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorUUID.String()}
	var savedEdge, savedMap, storedHexA, storedHexB uuid.UUID
	var storedEdgeType string
	if err := productQueryRow(t, pool, ctx, setHexEdge, edgeArgs).Scan(&savedEdge, &savedMap, &storedHexA, &storedHexB, &storedEdgeType, new(*string), new(*uuid.UUID)); err != nil {
		t.Fatalf("write same-map hex edge: %v", err)
	}
	edgeID := savedEdge
	edgeLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedHexEdge uuid.UUID
	if err := productQueryRow(t, edgeLocker, ctx, productSQL(t, "LockProductHexEdge", ":one"), pgx.StrictNamedArgs{"edge_id": edgeID.String()}).Scan(new(int64), &lockedHexEdge, new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(string), new(*string), new(*uuid.UUID)); err != nil || lockedHexEdge != edgeID {
		_ = edgeLocker.Rollback(ctx)
		t.Fatalf("lock hex edge id=%s err=%v", lockedHexEdge, err)
	}
	if err := edgeLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if savedMap != mapOneID || storedEdgeType != "road" || savedEdge == uuid.Nil || storedHexA == storedHexB {
		t.Fatalf("saved edge map=%s id=%s endpoints=%s,%s type=%q", savedMap, savedEdge, storedHexA, storedHexB, storedEdgeType)
	}
	crossMapArgs := pgx.StrictNamedArgs{}
	for key, value := range edgeArgs {
		crossMapArgs[key] = value
	}
	crossMapArgs["hex_b"] = foreignHex.String()
	if err := productQueryRow(t, pool, ctx, setHexEdge, crossMapArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(string), new(*string), new(*uuid.UUID)); err == nil {
		t.Fatal("hex edge accepted endpoint from another map")
	}
	if err := productQueryRow(t, pool, ctx, setHexEdge, edgeArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(string), new(*string), new(*uuid.UUID)); err != nil {
		t.Fatalf("idempotent edge write: %v", err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM map_changes WHERE affected_type='hex_edge' AND affected_public_id=$1`, edgeID).Scan(&historyCount); err != nil || historyCount != 1 {
		t.Fatalf("hex edge no-op history count=%d err=%v", historyCount, err)
	}
	edgeArgs["edge_type"], edgeArgs["history_id"], edgeArgs["recorded_at"] = "river", uuid.NewString(), time.Now().UTC()
	if err := productQueryRow(t, pool, ctx, setHexEdge, edgeArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), new(uuid.UUID), &storedEdgeType, new(*string), new(*uuid.UUID)); err != nil || storedEdgeType != "river" {
		t.Fatalf("replace hex edge type=%q err=%v", storedEdgeType, err)
	}
	var edgeHistoryCount int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM map_changes WHERE affected_type='hex_edge' AND affected_public_id=$1`, edgeID).Scan(&edgeHistoryCount); err != nil || edgeHistoryCount != 2 {
		t.Fatalf("hex edge replacement history=%d err=%v", edgeHistoryCount, err)
	}
	var selectedMap uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductMap", ":one"), pgx.StrictNamedArgs{"atlas_code": "spa03-a"}).Scan(&selectedMap, new(string), new(string), new(string), new(string), new(*uuid.UUID), new(sql.NullInt32), new(sql.NullInt32), new(*string), new(time.Time), new(*uuid.UUID)); err != nil || selectedMap != mapOneID {
		t.Fatalf("GetProductMap id=%s err=%v", selectedMap, err)
	}
	var selectedHex uuid.UUID
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductHexByID", ":one"), pgx.StrictNamedArgs{"hex_id": hexID.String()}).Scan(&selectedHex, new(uuid.UUID), new(int32), new(int32), new(*string), new(*string), new(*string), new(*time.Time), new(*uuid.UUID)); err != nil || selectedHex != hexID {
		t.Fatalf("GetProductHexByID id=%s err=%v", selectedHex, err)
	}
	missingMapID := uuid.New()
	edgeKeys := fmt.Sprintf(`[{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":99}]`, mapOneID.String(), mapOneID.String(), missingMapID.String(), mapTwoID.String(), mapOneID.String())
	mapEdgeArgs := pgx.StrictNamedArgs{"keys": edgeKeys, "viewer_id": actorUUID.String(), "viewer_roles": []string{"admin"}, "viewer_handle": "spa03-actor", "viewer_admin": true, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	mapEdgeRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductHexEdgesForMaps", ":many"), mapEdgeArgs)
	if err != nil {
		t.Fatal(err)
	}
	var sawStoredEdge bool
	var edgeBatchRows int
	for mapEdgeRows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var resultMapID *uuid.UUID
		var parentExists bool
		var listedEdge, endpointA, endpointB *uuid.UUID
		var edgeType, aSide *string
		var edgeDocument *uuid.UUID
		if err := mapEdgeRows.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &listedEdge, &endpointA, &endpointB, &edgeType, &aSide, &edgeDocument); err != nil {
			t.Fatal(err)
		}
		edgeBatchRows++
		switch ordinal {
		case 1, 2:
			if parentID != mapOneID || resultMapID == nil || *resultMapID != mapOneID || !parentExists {
				t.Fatalf("hex-edge duplicate batch correspondence ordinal=%d parent=%s map=%s exists=%t", ordinal, parentID, resultMapID, parentExists)
			}
		case 3:
			if parentID != missingMapID || resultMapID != nil || parentExists || listedEdge != nil {
				t.Fatalf("missing-map hex-edge marker ordinal=%d parent=%s map=%s exists=%t edge=%v", ordinal, parentID, resultMapID, parentExists, listedEdge)
			}
		case 4:
			if parentID != mapTwoID || resultMapID == nil || *resultMapID != mapTwoID || !parentExists || listedEdge != nil {
				t.Fatalf("empty-map hex-edge marker ordinal=%d parent=%s map=%s exists=%t edge=%v", ordinal, parentID, resultMapID, parentExists, listedEdge)
			}
		case 5:
			if parentID != mapOneID || resultMapID == nil || *resultMapID != mapOneID || !parentExists || listedEdge != nil {
				t.Fatalf("past-end hex-edge marker ordinal=%d parent=%s map=%s exists=%t edge=%v", ordinal, parentID, resultMapID, parentExists, listedEdge)
			}
		default:
			t.Fatalf("unexpected hex-edge batch ordinal %d", ordinal)
		}
		if (ordinal == 1 || ordinal == 2) && listedEdge != nil && *listedEdge == edgeID && endpointA != nil && endpointB != nil && edgeType != nil && *edgeType == "river" {
			sawStoredEdge = true
		}
	}
	if err := mapEdgeRows.Err(); err != nil {
		t.Fatal(err)
	}
	mapEdgeRows.Close()
	if !sawStoredEdge || edgeBatchRows != 5 {
		t.Fatalf("hex-edge map read sawPersisted=%t batchRows=%d, want edge plus duplicate, missing, empty and past-end markers", sawStoredEdge, edgeBatchRows)
	}
	regionRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductRegions", ":many"), pgx.StrictNamedArgs{"kind": "server", "viewer_id": actorUUID.String(), "viewer_roles": []string{"admin"}, "viewer_handle": "spa03-actor", "viewer_admin": true, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}, "row_limit": int32(10), "row_offset": int32(0)})
	if err != nil {
		t.Fatal(err)
	}
	var sawRegion bool
	for regionRows.Next() {
		var listedRegion uuid.UUID
		var name, kind string
		if err := regionRows.Scan(&listedRegion, &name, &kind, new(*time.Time), new(time.Time), new(*uuid.UUID)); err != nil {
			t.Fatal(err)
		}
		if listedRegion == regionUUID && kind == "server" {
			sawRegion = true
		}
	}
	if err := regionRows.Err(); err != nil {
		t.Fatal(err)
	}
	regionRows.Close()
	if !sawRegion {
		t.Fatal("region list omitted the live server region")
	}
	rowLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockID int64
	if err := productQueryRow(t, rowLocker, ctx, productSQL(t, "LockProductHex", ":one"), pgx.StrictNamedArgs{"hex_id": hexID.String()}).Scan(&lockID, new(uuid.UUID), new(int64), new(int32), new(int32), new(*string), new(*string), new(*string), new(sql.NullTime), new(*int64), new(uuid.UUID)); err != nil {
		_ = rowLocker.Rollback(ctx)
		t.Fatalf("lock persisted hex row: %v", err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM hexes WHERE public_id=$1 FOR UPDATE NOWAIT`, hexID).Scan(new(int64)); err == nil {
		_ = rowLocker.Rollback(ctx)
		t.Fatal("second transaction acquired the locked hex row")
	}
	if err := rowLocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM hexes WHERE public_id=$1 FOR UPDATE NOWAIT`, hexID).Scan(new(int64)); err != nil {
		t.Fatalf("hex row remained locked after rollback: %v", err)
	}
	keys := fmt.Sprintf(`[{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":0},{"parent_id":%q,"limit":10,"offset":99}]`, mapOneID.String(), mapOneID.String(), uuid.NewString(), mapOneID.String())
	rows, err = productQuery(t, pool, ctx, productSQL(t, "ListProductHexesForMaps", ":many"), pgx.StrictNamedArgs{"keys": keys})
	if err != nil {
		t.Fatal(err)
	}
	var ordinals []int
	var parentFound []bool
	var returnedHexes []uuid.NullUUID
	for rows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var returnedMap uuid.NullUUID
		var parentExists bool
		var returnedHex uuid.NullUUID
		if err := rows.Scan(&ordinal, &parentID, &returnedMap, &parentExists, &returnedHex, new(sql.NullInt32), new(sql.NullInt32), new(*string), new(*string), new(*string), new(*time.Time), new(uuid.NullUUID)); err != nil {
			t.Fatal(err)
		}
		ordinals = append(ordinals, ordinal)
		parentFound = append(parentFound, parentExists)
		returnedHexes = append(returnedHexes, returnedHex)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	rows.Close()
	if fmt.Sprint(ordinals) != "[1 1 2 2 3 4]" || fmt.Sprint(parentFound) != "[true true true true false true]" {
		t.Fatalf("batch correspondence ordinals=%v parents=%v", ordinals, parentFound)
	}
	if !returnedHexes[0].Valid || returnedHexes[0].UUID != hexID || !returnedHexes[1].Valid || returnedHexes[1].UUID != secondHex || !returnedHexes[2].Valid || returnedHexes[2].UUID != hexID || !returnedHexes[3].Valid || returnedHexes[3].UUID != secondHex || returnedHexes[4].Valid || returnedHexes[5].Valid {
		t.Fatalf("batch children=%v; expected duplicate results plus missing/page-empty sentinels", returnedHexes)
	}

	calendarID := uuid.New()
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
	if _, err := productExec(t, pool, ctx, productSQL(t, "AppendProductCalendarChange", ":exec"), pgx.StrictNamedArgs{"history_id": calendarID.String(), "old_value": nil, "new_value": `{"months":12}`, "actor_id": actorUUID.String(), "recorded_at": time.Now().UTC()}); err != nil {
		t.Fatalf("calendar storage history: %v", err)
	}
	var calendarHistory int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM calendar_changes WHERE public_id=$1`, calendarID).Scan(&calendarHistory); err != nil || calendarHistory != 1 {
		t.Fatalf("calendar history=%d err=%v", calendarHistory, err)
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

	readDates := productSQL(t, "ReadProductGameDates", ":many")
	dateRows, err := productQuery(t, pool, ctx, readDates, pgx.StrictNamedArgs{"real_dates": []time.Time{start, start.AddDate(0, 0, 1), start.AddDate(0, 0, 2)}})
	if err != nil {
		t.Fatal(err)
	}
	var gotDays []sql.NullInt32
	for dateRows.Next() {
		var ordinal int64
		var realDate time.Time
		var gameDay sql.NullInt32
		var definition []byte
		if err := dateRows.Scan(&ordinal, &realDate, &gameDay, &definition); err != nil {
			t.Fatal(err)
		}
		gotDays = append(gotDays, gameDay)
	}
	if err := dateRows.Err(); err != nil {
		t.Fatal(err)
	}
	dateRows.Close()
	if len(gotDays) != 3 || !gotDays[0].Valid || gotDays[0].Int32 != 0 || gotDays[1].Valid || !gotDays[2].Valid || gotDays[2].Int32 != 5 {
		t.Fatalf("date map values=%v, want [0 null 5]", gotDays)
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
	var repeatedDate time.Time
	if err := productQueryRow(t, pool, ctx, productSQL(t, "ListProductRealDates", ":many"), pgx.StrictNamedArgs{"game_day": int32(5), "row_limit": int32(10), "row_offset": int32(0)}).Scan(&repeatedDate); err != nil || !repeatedDate.Equal(start.AddDate(0, 0, 2)) {
		t.Fatalf("real dates for game day 5=%s err=%v", repeatedDate, err)
	}
	var realDateCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductRealDates", ":one"), pgx.StrictNamedArgs{"game_day": int32(5)}).Scan(&realDateCount); err != nil || realDateCount != 1 {
		t.Fatalf("real-date count for game day 5=%d err=%v", realDateCount, err)
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

	anchorID, anchorHistoryID := uuid.New(), uuid.New()
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
	anchorChange := productSQL(t, "AppendProductTimeAnchorChange", ":exec")
	initialAnchorValue := fmt.Sprintf(`{"realUtc":%q,"epochDay":100,"rate":1,"note":null}`, anchorAt.Format(time.RFC3339Nano))
	if _, err := productExec(t, pool, ctx, anchorChange, pgx.StrictNamedArgs{"history_id": anchorHistoryID, "old_value": nil, "new_value": initialAnchorValue, "actor_id": actorUUID.String(), "recorded_at": time.Now().UTC(), "anchor_id": anchorID}); err != nil {
		t.Fatalf("append anchor creation history: %v", err)
	}
	var anchorHistoryCount int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM time_anchor_changes WHERE public_id=$1 AND old_value IS NULL`, anchorHistoryID).Scan(&anchorHistoryCount); err != nil || anchorHistoryCount != 1 {
		t.Fatalf("anchor history count=%d err=%v", anchorHistoryCount, err)
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
	var anchorCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductTimeAnchors", ":one")).Scan(&anchorCount); err != nil || anchorCount != 2 {
		t.Fatalf("time-anchor count=%d err=%v", anchorCount, err)
	}
	anchorPages, err := productQuery(t, pool, ctx, productSQL(t, "ListProductTimeAnchors", ":many"), pgx.StrictNamedArgs{"row_limit": int32(1), "row_offset": int32(0)})
	if err != nil {
		t.Fatal(err)
	}
	var firstAnchorPageID uuid.UUID
	if !anchorPages.Next() || anchorPages.Scan(&firstAnchorPageID, new(time.Time), new(int32), new(float64), new(*string)) != nil || firstAnchorPageID != minUUID(anchorID, secondAnchorID) {
		t.Fatalf("first time-anchor page=%s, want public UUID ascending tie-break %s", firstAnchorPageID, minUUID(anchorID, secondAnchorID))
	}
	anchorPages.Close()
	updateArgs := pgx.StrictNamedArgs{"anchor_id": anchorID, "real_utc": anchorAt.Add(time.Hour), "epoch_day": int32(102), "rate": float64(1.5), "note": "updated"}
	var updatedID uuid.UUID
	var updatedAt time.Time
	var updatedDay int32
	var updatedRate float64
	var updatedNote *string
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpdateProductTimeAnchor", ":one"), updateArgs).Scan(&updatedID, &updatedAt, &updatedDay, &updatedRate, &updatedNote); err != nil || updatedID != anchorID || !updatedAt.Equal(anchorAt.Add(time.Hour)) || updatedDay != 102 || updatedRate != 1.5 || updatedNote == nil || *updatedNote != "updated" {
		t.Fatalf("updated anchor id=%s at=%s day=%d rate=%v note=%v err=%v", updatedID, updatedAt, updatedDay, updatedRate, updatedNote, err)
	}
	updateHistoryID := uuid.New()
	priorAnchorValue := initialAnchorValue
	updatedAnchorValue := fmt.Sprintf(`{"realUtc":%q,"epochDay":102,"rate":1.5,"note":"updated"}`, updatedAt.Format(time.RFC3339Nano))
	if _, err := productExec(t, pool, ctx, productSQL(t, "AppendProductTimeAnchorChange", ":exec"), pgx.StrictNamedArgs{"history_id": updateHistoryID, "old_value": priorAnchorValue, "new_value": updatedAnchorValue, "actor_id": actorUUID.String(), "recorded_at": time.Now().UTC(), "anchor_id": anchorID}); err != nil {
		t.Fatalf("append updated anchor history: %v", err)
	}
	var oldValue, newValue []byte
	if err := productQueryRow(t, pool, ctx, `SELECT old_value,new_value FROM time_anchor_changes WHERE public_id=$1`, updateHistoryID).Scan(&oldValue, &newValue); err != nil || !strings.Contains(string(oldValue), anchorAt.Format(time.RFC3339Nano)) || !strings.Contains(string(oldValue), `"epochDay": 100`) || !strings.Contains(string(newValue), updatedAt.Format(time.RFC3339Nano)) || !strings.Contains(string(newValue), `"epochDay": 102`) || !strings.Contains(string(newValue), `"note": "updated"`) {
		t.Fatalf("anchor history old=%s new=%s err=%v", oldValue, newValue, err)
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

func TestProductSQLMapViewAndHexLinkHistoryOnPostgres(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := dbtest.NewProductFixture(t)
	pool := f.Pool
	var actorID, viewerID, regionID, mapID, hexID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-viewer','spa03-viewer','SPA03 viewer',ARRAY['admin'],'active') RETURNING public_id`).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-map-reader','spa03-map-reader','SPA03 map reader',ARRAY['player'],'active') RETURNING public_id`).Scan(&viewerID); err != nil {
		t.Fatal(err)
	}
	var privateAuthor uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO members(discord_id,handle,display_name,roles,status) VALUES ('spa03-private-author','spa03-private-author','SPA03 private author',ARRAY['player'],'active') RETURNING public_id`).Scan(&privateAuthor); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `INSERT INTO regions(name,kind) VALUES ('SPA03 map-view region','server') RETURNING public_id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `INSERT INTO maps(name,atlas_code,map_kind,family,region_id,cols,rows) VALUES ('SPA03 map-view','spa03-map-view','hexgrid','campaign',(SELECT id FROM regions WHERE public_id=$1),6,1) RETURNING public_id`, regionID).Scan(&mapID); err != nil {
		t.Fatal(err)
	}
	var hexInternal int64
	if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row) SELECT id,0,0 FROM maps WHERE public_id=$1 RETURNING id,public_id`, mapID).Scan(&hexInternal, &hexID); err != nil {
		t.Fatal(err)
	}
	var loreID uuid.UUID
	fixtures := []struct {
		id       uuid.UUID
		category string
		status   string
		relation string
		deleted  bool
	}{
		{id: uuid.New(), category: "Locations", status: "published", relation: "location"},
		{id: uuid.New(), category: "Lore", status: "published", relation: "location"},
		{id: uuid.New(), category: "Locations", status: "draft", relation: "location"},
		{id: uuid.New(), category: "Locations", status: "published", relation: "subject"},
		{id: uuid.New(), category: "Locations", status: "published", relation: "location", deleted: true},
		{id: uuid.New(), category: "Lore", status: "published", relation: "subject"},
	}
	for i, item := range fixtures {
		if _, err := productExec(t, pool, ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,deleted_at) VALUES ($1,'codex_entry',$2,$3,$4,$5,'public',CASE WHEN $6 THEN now() END)`, item.id, fmt.Sprintf("spa03-mapview-%d", i), fmt.Sprintf("Map View %d", i), item.category, item.status, item.deleted); err != nil {
			t.Fatal(err)
		}
		if i == len(fixtures)-1 {
			loreID = item.id
		}
		if i != len(fixtures)-1 {
			linkHexInternal := hexInternal
			if item.relation == "location" && i != 0 {
				if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row) SELECT id,$2,0 FROM maps WHERE public_id=$1 RETURNING id`, mapID, int32(i)).Scan(&linkHexInternal); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := productExec(t, pool, ctx, `INSERT INTO hex_entry_links(hex_id,document_id,relation) SELECT $1,id,$2 FROM documents WHERE public_id=$3`, linkHexInternal, item.relation, item.id); err != nil {
				t.Fatal(err)
			}
		}
	}
	privateDoc := uuid.New()
	if _, err := productExec(t, pool, ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,author_id) VALUES ($1,'codex_entry','spa03-mapview-private','Private location','Locations','published','restricted',(SELECT id FROM members WHERE public_id=$2))`, privateDoc, privateAuthor); err != nil {
		t.Fatal(err)
	}
	var privateHexInternal int64
	if err := productQueryRow(t, pool, ctx, `INSERT INTO hexes(map_id,col,row) SELECT id,5,0 FROM maps WHERE public_id=$1 RETURNING id`, mapID).Scan(&privateHexInternal); err != nil {
		t.Fatal(err)
	}
	if _, err := productExec(t, pool, ctx, `INSERT INTO hex_entry_links(hex_id,document_id,relation) SELECT $1,id,'location' FROM documents WHERE public_id=$2`, privateHexInternal, privateDoc); err != nil {
		t.Fatal(err)
	}
	viewArgs := pgx.StrictNamedArgs{"atlas_code": "spa03-map-view", "viewer_id": viewerID.String(), "viewer_roles": []string{"player"}, "viewer_handle": "spa03-map-reader", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}, "row_limit": int32(1), "row_offset": int32(0)}
	places, err := productQuery(t, pool, ctx, productSQL(t, "ReadProductMapViewPlaces", ":many"), viewArgs)
	if err != nil {
		t.Fatal(err)
	}
	var placeIDs []uuid.UUID
	for places.Next() {
		var foundHex uuid.UUID
		var col, row int32
		var documentID uuid.UUID
		var slug, title, category string
		if err := places.Scan(&foundHex, &col, &row, &documentID, &slug, &title, &category); err != nil {
			t.Fatal(err)
		}
		if foundHex != hexID || category != "Locations" {
			t.Fatalf("map view place hex=%s category=%q", foundHex, category)
		}
		placeIDs = append(placeIDs, documentID)
	}
	if err := places.Err(); err != nil {
		t.Fatal(err)
	}
	places.Close()
	if len(placeIDs) != 1 || placeIDs[0] != fixtures[0].id {
		t.Fatalf("map view admitted document IDs=%v; expected only published Locations/location", placeIDs)
	}
	countArgs := pgx.StrictNamedArgs{"atlas_code": "spa03-map-view", "viewer_id": viewerID.String(), "viewer_roles": []string{"player"}, "viewer_handle": "spa03-map-reader", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	var placeCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductMapViewPlaces", ":one"), countArgs).Scan(&placeCount); err != nil || placeCount != 1 {
		t.Fatalf("map view count=%d err=%v", placeCount, err)
	}
	viewArgs["row_offset"] = int32(1)
	places, err = productQuery(t, pool, ctx, productSQL(t, "ReadProductMapViewPlaces", ":many"), viewArgs)
	if err != nil {
		t.Fatal(err)
	}
	if places.Next() {
		t.Fatal("map view page after the only admitted location returned a row")
	}
	places.Close()

	linkHistory, unlinkHistory := uuid.New(), uuid.New()
	linkArgs := pgx.StrictNamedArgs{"hex_id": hexID.String(), "document_id": loreID.String(), "relation": "subject", "history_id": linkHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	var linkedHex, linkedDocument uuid.UUID
	var linkedRelation string
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductHexEntry", ":one"), linkArgs).Scan(&linkedHex, &linkedDocument, &linkedRelation); err != nil || linkedHex != hexID || linkedDocument != loreID || linkedRelation != "subject" {
		t.Fatalf("linked hex=%s document=%s relation=%q err=%v", linkedHex, linkedDocument, linkedRelation, err)
	}
	var linkHistoryPayload []byte
	if err := productQueryRow(t, pool, ctx, `SELECT payload FROM hex_changes WHERE public_id=$1 AND hex_id=(SELECT id FROM hexes WHERE public_id=$2)`, linkHistory, hexID).Scan(&linkHistoryPayload); err != nil || !strings.Contains(string(linkHistoryPayload), loreID.String()) {
		t.Fatalf("link history payload=%s err=%v", linkHistoryPayload, err)
	}
	duplicateLinkArgs := pgx.StrictNamedArgs{"hex_id": hexID.String(), "document_id": loreID.String(), "relation": "subject", "history_id": uuid.NewString(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductHexEntry", ":one"), duplicateLinkArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(string)); err == nil {
		t.Fatal("duplicate hex-entry link unexpectedly succeeded")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			t.Fatalf("duplicate hex-entry link error=%v, want unique violation 23505", err)
		}
	}
	linkBatch := fmt.Sprintf(`[{"parent_id":%q,"limit":10,"offset":0}]`, hexID.String())
	linkReadArgs := pgx.StrictNamedArgs{"keys": linkBatch, "viewer_id": viewerID.String(), "viewer_roles": []string{"player"}, "viewer_handle": "spa03-map-reader", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	linkRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductHexLinksForHexes", ":many"), linkReadArgs)
	if err != nil {
		t.Fatal(err)
	}
	wantLinks := map[[2]string]bool{{fixtures[0].id.String(), "location"}: true, {fixtures[3].id.String(), "subject"}: true, {loreID.String(), "subject"}: true}
	for linkRows.Next() {
		var ordinal int
		var parentID, foundHex, foundDoc uuid.UUID
		var exists bool
		var relation string
		if err := linkRows.Scan(&ordinal, &parentID, &foundHex, &exists, &foundDoc, &relation); err != nil {
			t.Fatal(err)
		}
		if !exists || ordinal != 1 || parentID != hexID || foundHex != hexID {
			t.Fatalf("hex-link batch correspondence ordinal=%d parent=%s hex=%s exists=%t", ordinal, parentID, foundHex, exists)
		}
		key := [2]string{foundDoc.String(), relation}
		if !wantLinks[key] {
			t.Fatalf("unexpected visible hex link document=%s relation=%q", foundDoc, relation)
		}
		delete(wantLinks, key)
	}
	if err := linkRows.Err(); err != nil {
		t.Fatal(err)
	}
	linkRows.Close()
	if len(wantLinks) != 0 {
		t.Fatalf("visible hex links omitted expected document/relation pairs: %v", wantLinks)
	}
	missingHexID := uuid.New()
	linkPresenceKeys := fmt.Sprintf(`[{"parent_id":%q,"limit":1,"offset":0},{"parent_id":%q,"limit":10,"offset":99},{"parent_id":%q,"limit":10,"offset":0}]`, hexID.String(), hexID.String(), missingHexID.String())
	linkPresenceArgs := pgx.StrictNamedArgs{"keys": linkPresenceKeys, "viewer_id": viewerID.String(), "viewer_roles": []string{}, "viewer_handle": "spa03-map-reader", "viewer_admin": false, "viewer_live_dm": false, "reader_ids": []uuid.UUID{}}
	linkPresenceRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductHexLinksForHexes", ":many"), linkPresenceArgs)
	if err != nil {
		t.Fatal(err)
	}
	var presenceOrdinals []int
	for linkPresenceRows.Next() {
		var ordinal int
		var parentID uuid.UUID
		var resultHex, resultDocument *uuid.UUID
		var parentExists bool
		var relation *string
		if err := linkPresenceRows.Scan(&ordinal, &parentID, &resultHex, &parentExists, &resultDocument, &relation); err != nil {
			t.Fatal(err)
		}
		presenceOrdinals = append(presenceOrdinals, ordinal)
		switch ordinal {
		case 1:
			if parentID != hexID || resultHex == nil || *resultHex != hexID || !parentExists || resultDocument == nil || relation == nil {
				t.Fatalf("hex-link first page correspondence parent=%s hex=%v doc=%v relation=%v exists=%t", parentID, resultHex, resultDocument, relation, parentExists)
			}
		case 2:
			if parentID != hexID || resultHex == nil || *resultHex != hexID || !parentExists || resultDocument != nil || relation != nil {
				t.Fatalf("hex-link page-past-end marker parent=%s hex=%v doc=%v relation=%v exists=%t", parentID, resultHex, resultDocument, relation, parentExists)
			}
		case 3:
			if parentID != missingHexID || resultHex != nil || parentExists || resultDocument != nil || relation != nil {
				t.Fatalf("hex-link missing marker parent=%s hex=%v doc=%v relation=%v exists=%t", parentID, resultHex, resultDocument, relation, parentExists)
			}
		default:
			t.Fatalf("unexpected hex-link batch ordinal %d", ordinal)
		}
	}
	if err := linkPresenceRows.Err(); err != nil {
		t.Fatal(err)
	}
	linkPresenceRows.Close()
	if fmt.Sprint(presenceOrdinals) != "[1 2 3]" {
		t.Fatalf("hex-link batch ordinals=%v, want child, valid-empty and missing parent slots", presenceOrdinals)
	}
	unlinkArgs := pgx.StrictNamedArgs{"hex_id": hexID.String(), "document_id": loreID.String(), "relation": "subject", "history_id": unlinkHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	var removed int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UnlinkProductHexEntry", ":one"), unlinkArgs).Scan(&removed); err != nil || removed != 1 {
		t.Fatalf("unlink rows=%d err=%v", removed, err)
	}
	unlinkArgs["history_id"] = uuid.NewString()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UnlinkProductHexEntry", ":one"), unlinkArgs).Scan(&removed); err != nil || removed != 0 {
		t.Fatalf("repeat unlink rows=%d err=%v", removed, err)
	}
	var unlinkHistoryKind string
	if err := productQueryRow(t, pool, ctx, `SELECT kind FROM hex_changes WHERE public_id=$1 AND hex_id=(SELECT id FROM hexes WHERE public_id=$2)`, unlinkHistory, hexID).Scan(&unlinkHistoryKind); err != nil || unlinkHistoryKind != "entry_unlinked" {
		t.Fatalf("unlink history kind=%q err=%v", unlinkHistoryKind, err)
	}
	var hexHistoryCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductHexHistory", ":one"), pgx.StrictNamedArgs{"hex_id": hexID.String()}).Scan(&hexHistoryCount); err != nil || hexHistoryCount != 2 {
		t.Fatalf("hex history count=%d err=%v", hexHistoryCount, err)
	}
	for offset, wantID := range []uuid.UUID{unlinkHistory, linkHistory} {
		historyArgs := pgx.StrictNamedArgs{"hex_id": hexID.String(), "row_limit": int32(1), "row_offset": int32(offset)}
		historyRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductHexHistory", ":many"), historyArgs)
		if err != nil {
			t.Fatal(err)
		}
		if !historyRows.Next() {
			t.Fatalf("hex history page %d is empty", offset)
		}
		var historyID, historyHex uuid.UUID
		if err := historyRows.Scan(&historyID, &historyHex, new(string), new([]byte), new(time.Time)); err != nil || historyID != wantID || historyHex != hexID {
			t.Fatalf("hex history page %d id=%s hex=%s err=%v", offset, historyID, historyHex, err)
		}
		historyRows.Close()
	}
	var recentChangeCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CountProductRecentHexChanges", ":one"), pgx.StrictNamedArgs{"map_id": mapID.String()}).Scan(&recentChangeCount); err != nil || recentChangeCount != 2 {
		t.Fatalf("recent hex-change count=%d err=%v", recentChangeCount, err)
	}
	recentArgs := pgx.StrictNamedArgs{"map_id": mapID.String(), "row_limit": int32(1), "row_offset": int32(0)}
	recentRows, err := productQuery(t, pool, ctx, productSQL(t, "ListProductRecentHexChanges", ":many"), recentArgs)
	if err != nil {
		t.Fatal(err)
	}
	if !recentRows.Next() {
		t.Fatal("recent hex-change first page is empty")
	}
	var recentID, recentHex, recentMap uuid.UUID
	if err := recentRows.Scan(&recentID, &recentHex, &recentMap, new(string), new([]byte), new(time.Time)); err != nil || recentID != unlinkHistory || recentHex != hexID || recentMap != mapID {
		t.Fatalf("recent hex-change page id=%s hex=%s map=%s err=%v", recentID, recentHex, recentMap, err)
	}
	recentRows.Close()
}

func TestProductSQLRegionLifecycleAndHistoryOnPostgres(t *testing.T) {
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

	createdRegionID := uuid.New()
	var regionDocumentID uuid.UUID
	if err := productQueryRow(t, pool, ctx, `INSERT INTO documents(kind,slug,title,status,visibility) VALUES ('community','spa03-region-document','SPA03 region document','published','public') RETURNING public_id`).Scan(&regionDocumentID); err != nil {
		t.Fatal(err)
	}
	var regionID uuid.UUID
	var regionName, regionKind string
	createRegion := productSQL(t, "CreateProductRegion", ":one")
	var createdRegionDocument *uuid.UUID
	if err := productQueryRow(t, pool, ctx, createRegion, pgx.StrictNamedArgs{"name": "SPA03 lifecycle", "kind": "uncharted", "charter_deadline": nil, "document_id": regionDocumentID.String(), "history_id": createdRegionID.String(), "actor_id": actorID.String(), "recorded_at": time.Now().UTC()}).Scan(&regionID, &regionName, &regionKind, new(*time.Time), &createdRegionDocument, new(time.Time)); err != nil {
		t.Fatalf("create region: %v", err)
	}
	if regionID == uuid.Nil || regionName != "SPA03 lifecycle" || regionKind != "uncharted" || createdRegionDocument == nil || *createdRegionDocument != regionDocumentID {
		t.Fatalf("created region id=%s name=%q kind=%q document=%v", regionID, regionName, regionKind, createdRegionDocument)
	}
	var createdRegionSnapshot []byte
	if err := productQueryRow(t, pool, ctx, `SELECT new_value FROM region_changes WHERE public_id=$1`, createdRegionID).Scan(&createdRegionSnapshot); err != nil || !strings.Contains(string(createdRegionSnapshot), regionID.String()) || !strings.Contains(string(createdRegionSnapshot), regionDocumentID.String()) || !strings.Contains(string(createdRegionSnapshot), `"createdAt"`) || !strings.Contains(string(createdRegionSnapshot), `"deletedBy": null`) {
		t.Fatalf("region creation snapshot=%s err=%v", createdRegionSnapshot, err)
	}
	regionLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedRegionID uuid.UUID
	if err := productQueryRow(t, regionLocker, ctx, productSQL(t, "LockProductRegion", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String()}).Scan(new(int64), &lockedRegionID, new(string), new(string), new(*time.Time), new(*int64), new(*time.Time), new(time.Time)); err != nil || lockedRegionID != regionID {
		_ = regionLocker.Rollback(ctx)
		t.Fatalf("lock product region id=%s err=%v", lockedRegionID, err)
	}
	if err := regionLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	updateHistory := uuid.New()
	updateRegion := productSQL(t, "UpdateProductRegion", ":one")
	var updatedName string
	updateArgs := pgx.StrictNamedArgs{"region_id": regionID.String(), "kind": "uncharted", "name": "SPA03 renamed", "charter_deadline": nil, "document_id": nil, "history_id": updateHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	if err := productQueryRow(t, pool, ctx, updateRegion, updateArgs).Scan(new(uuid.UUID), &updatedName, new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("update region: %v", err)
	}
	if updatedName != "SPA03 renamed" {
		t.Fatalf("updated region name=%q", updatedName)
	}
	var updateOld, updateNew []byte
	if err := productQueryRow(t, pool, ctx, `SELECT old_value,new_value FROM region_changes WHERE public_id=$1`, updateHistory).Scan(&updateOld, &updateNew); err != nil || !strings.Contains(string(updateOld), regionDocumentID.String()) || !strings.Contains(string(updateOld), `"createdAt"`) || !strings.Contains(string(updateNew), `"documentId": null`) || !strings.Contains(string(updateNew), `"deletedAt": null`) {
		t.Fatalf("region update snapshots old=%s new=%s err=%v", updateOld, updateNew, err)
	}
	noopHistory := uuid.New()
	updateArgs["history_id"] = noopHistory.String()
	if err := productQueryRow(t, pool, ctx, updateRegion, updateArgs).Scan(new(uuid.UUID), new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("no-op region update: %v", err)
	}
	var historyCount int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM region_changes WHERE region_id=(SELECT id FROM regions WHERE public_id=$1)`, regionID).Scan(&historyCount); err != nil || historyCount != 2 {
		t.Fatalf("create/update/no-op region history count=%d err=%v", historyCount, err)
	}

	transitionID := uuid.New()
	transitionRegion := productSQL(t, "TransitionProductRegion", ":one")
	transitionArgs := pgx.StrictNamedArgs{"region_id": regionID.String(), "kind": "archon", "history_id": transitionID.String(), "note": "promoted", "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	if err := productQueryRow(t, pool, ctx, transitionRegion, transitionArgs).Scan(new(uuid.UUID), new(string), &regionKind, new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || regionKind != "archon" {
		t.Fatalf("transition region kind=%q err=%v", regionKind, err)
	}
	var oldValue, newValue []byte
	if err := productQueryRow(t, pool, ctx, `SELECT old_value,new_value FROM region_changes WHERE public_id=$1`, transitionID).Scan(&oldValue, &newValue); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(oldValue), `"kind": "uncharted"`) || !strings.Contains(string(newValue), `"kind": "archon"`) || !strings.Contains(string(newValue), `"note": "promoted"`) {
		t.Fatalf("transition history old=%s new=%s", oldValue, newValue)
	}
	serverHistoryID := uuid.New()
	transitionArgs["kind"], transitionArgs["history_id"], transitionArgs["note"], transitionArgs["recorded_at"] = "server", serverHistoryID.String(), "returned to server", time.Now().UTC()
	if err := productQueryRow(t, pool, ctx, transitionRegion, transitionArgs).Scan(new(uuid.UUID), new(string), &regionKind, new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || regionKind != "server" {
		t.Fatalf("second legal transition kind=%q err=%v", regionKind, err)
	}

	deleteCreateHistory := uuid.New()
	var deleteRegionID uuid.UUID
	if err := productQueryRow(t, pool, ctx, createRegion, pgx.StrictNamedArgs{"name": "SPA03 deletable", "kind": "server", "charter_deadline": nil, "document_id": nil, "history_id": deleteCreateHistory.String(), "actor_id": actorID.String(), "recorded_at": time.Now().UTC()}).Scan(&deleteRegionID, new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("create deletable region: %v", err)
	}
	tombstoneAt := time.Now().UTC().Add(-time.Minute)
	if _, err := productExec(t, pool, ctx, `UPDATE regions SET deleted_at=$2,deleted_by=(SELECT id FROM members WHERE public_id=$3) WHERE public_id=$1`, deleteRegionID, tombstoneAt, actorID); err != nil {
		t.Fatalf("seed existing region tombstone for restore query: %v", err)
	}
	restoreHistory := uuid.New()
	var restoredID uuid.UUID
	restoreArgs := pgx.StrictNamedArgs{"region_id": deleteRegionID.String(), "history_id": restoreHistory.String(), "actor_id": actorID.String(), "recorded_at": time.Now().UTC()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "RestoreProductRegion", ":one"), restoreArgs).Scan(&restoredID, new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil || restoredID != deleteRegionID {
		t.Fatalf("restore region id=%s err=%v", restoredID, err)
	}
	var priorTombstone sql.NullString
	var restoreOld, restoreNew []byte
	if err := productQueryRow(t, pool, ctx, `SELECT old_value->>'deletedAt',old_value,new_value FROM region_changes WHERE public_id=$1`, restoreHistory).Scan(&priorTombstone, &restoreOld, &restoreNew); err != nil || !priorTombstone.Valid || !strings.Contains(string(restoreOld), deleteRegionID.String()) || !strings.Contains(string(restoreNew), `"deletedAt": null`) || !strings.Contains(string(restoreNew), `"deletedBy": null`) {
		t.Fatalf("restore history should retain full prior tombstone facts: timestamp=%v old=%s new=%s err=%v", priorTombstone, restoreOld, restoreNew, err)
	}
	restoreNoopID := uuid.New()
	restoreArgs["history_id"] = restoreNoopID.String()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "RestoreProductRegion", ":one"), restoreArgs).Scan(new(uuid.UUID), new(string), new(string), new(*time.Time), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("repeat region restore: %v", err)
	}
	var lifecycleKinds []string
	var lifecycleIDs []uuid.UUID
	if err := productQueryRow(t, pool, ctx, `SELECT array_agg(kind ORDER BY created_at),array_agg(public_id ORDER BY created_at) FROM region_changes WHERE region_id=(SELECT id FROM regions WHERE public_id=$1)`, deleteRegionID).Scan(&lifecycleKinds, &lifecycleIDs); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(lifecycleKinds) != "[created restored]" || fmt.Sprint(lifecycleIDs) != fmt.Sprint([]uuid.UUID{deleteCreateHistory, restoreHistory}) {
		t.Fatalf("region lifecycle history kinds=%v ids=%v", lifecycleKinds, lifecycleIDs)
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
		args := pgx.StrictNamedArgs{"name": code, "atlas_code": code, "map_kind": "pointcrawl", "family": "campaign", "region_id": nil, "cols": nil, "rows": nil, "asset_path": nil, "actor_id": actorID.String(), "history_id": uuid.NewString(), "recorded_at": time.Now().UTC()}
		if err := productQueryRow(t, pool, ctx, createMap, args).Scan(&id, new(string), new(string), new(string), new(string), new(*uuid.UUID), new(sql.NullInt32), new(sql.NullInt32), new(*string), new(time.Time), new(*uuid.UUID)); err != nil {
			t.Fatalf("create map %s: %v", code, err)
		}
		return id
	}
	parentMap, nodeSubmap, hexSubmap := makeMap("spa03-containment-parent"), makeMap("spa03-containment-node-child"), makeMap("spa03-containment-hex-child")
	var parentInternal, hexChildInternal int64
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1`, parentMap).Scan(&parentInternal); err != nil {
		t.Fatal(err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT id FROM maps WHERE public_id=$1`, hexSubmap).Scan(&hexChildInternal); err != nil {
		t.Fatal(err)
	}
	if _, err := productExec(t, pool, ctx, `INSERT INTO hexes(map_id,col,row,submap_id) VALUES ($1,0,0,$2)`, parentInternal, hexChildInternal); err != nil {
		t.Fatal(err)
	}
	nodeID, createHistoryID, updateHistoryID := uuid.New(), uuid.New(), uuid.New()
	writeNode := func(name string, historyID uuid.UUID) uuid.UUID {
		t.Helper()
		args := pgx.StrictNamedArgs{"node_id": nil, "map_id": parentMap.String(), "name": name, "x": float64(1), "y": float64(2), "submap_id": nodeSubmap.String(), "recorded_at": time.Now().UTC(), "history_id": historyID.String(), "actor_id": actorID.String()}
		if historyID == updateHistoryID {
			args["node_id"] = nodeID.String()
		}
		var returnedID, returnedMap uuid.UUID
		var returnedName string
		var x, y float64
		var returnedSubmap *uuid.UUID
		if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPointcrawlNode", ":one"), args).Scan(&returnedID, &returnedMap, &returnedName, &x, &y, &returnedSubmap, new(time.Time)); err != nil {
			t.Fatalf("upsert pointcrawl node %q: %v", name, err)
		}
		if returnedMap != parentMap || returnedName != name || returnedSubmap == nil || *returnedSubmap != nodeSubmap {
			t.Fatalf("pointcrawl node id=%s map=%s name=%q submap=%v", returnedID, returnedMap, returnedName, returnedSubmap)
		}
		return returnedID
	}
	if got := writeNode("first", createHistoryID); got == uuid.Nil {
		t.Fatal("node creation returned empty public identity")
	} else {
		nodeID = got
	}
	nodeLocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var lockedNodeID uuid.UUID
	if err := productQueryRow(t, nodeLocker, ctx, productSQL(t, "LockProductPointcrawlNode", ":one"), pgx.StrictNamedArgs{"node_id": nodeID.String()}).Scan(new(int64), &lockedNodeID, new(int64), new(string), new(float64), new(float64), new(*int64), new(time.Time), new(uuid.UUID)); err != nil || lockedNodeID != nodeID {
		_ = nodeLocker.Rollback(ctx)
		t.Fatalf("lock pointcrawl node id=%s err=%v", lockedNodeID, err)
	}
	if err := nodeLocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if got := writeNode("renamed", updateHistoryID); got != nodeID {
		t.Fatalf("pointcrawl node update changed identity %s to %s", nodeID, got)
	}
	noOpArgs := pgx.StrictNamedArgs{"node_id": nodeID.String(), "map_id": parentMap.String(), "name": "renamed", "x": float64(1), "y": float64(2), "submap_id": nodeSubmap.String(), "recorded_at": time.Now().UTC(), "history_id": uuid.NewString(), "actor_id": actorID.String()}
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UpsertProductPointcrawlNode", ":one"), noOpArgs).Scan(new(uuid.UUID), new(uuid.UUID), new(string), new(float64), new(float64), new(*uuid.UUID), new(time.Time)); err != nil {
		t.Fatalf("unchanged pointcrawl node write: %v", err)
	}
	var historyCount int
	if err := productQueryRow(t, pool, ctx, `SELECT count(*) FROM pointcrawl_node_changes WHERE node_id=(SELECT id FROM pointcrawl_nodes WHERE public_id=$1)`, nodeID).Scan(&historyCount); err != nil || historyCount != 2 {
		t.Fatalf("pointcrawl node history count=%d err=%v", historyCount, err)
	}
	edges, err := productQuery(t, pool, ctx, productSQL(t, "ReadProductContainmentEdges", ":many"))
	if err != nil {
		t.Fatal(err)
	}
	want := map[[2]uuid.UUID]bool{{parentMap, nodeSubmap}: true, {parentMap, hexSubmap}: true}
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
	if _, err := productExec(t, pool, ctx, `INSERT INTO maps(name,atlas_code,map_kind,family,region_id,cols,rows) SELECT 'SPA03 activity','spa03-activity','hexgrid','campaign',id,1,1 FROM regions WHERE public_id=$1`, regionID); err != nil {
		t.Fatal(err)
	}
	if _, err := productExec(t, pool, ctx, `INSERT INTO hexes(map_id,col,row,terrain) SELECT id,0,0,'forest' FROM maps WHERE atlas_code='spa03-activity'`); err != nil {
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
	var hexCount, questCount int32
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String()}).Scan(&countedRegion, &hexCount, &questCount); err != nil || countedRegion != regionID || hexCount != 1 || questCount != 3 {
		t.Fatalf("region counts region=%s hex=%d quests=%d err=%v", countedRegion, hexCount, questCount, err)
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
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": regionID.String()}).Scan(&tombstonedRegion, new(int32), new(int32)); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("GetProductRegionCounts should omit tombstoned region %s, got region=%s err=%v", regionID, tombstonedRegion, err)
	}
	missingRegionID := uuid.New()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "GetProductRegionCounts", ":one"), pgx.StrictNamedArgs{"region_id": missingRegionID.String()}).Scan(new(uuid.UUID), new(int32), new(int32)); !errors.Is(err, pgx.ErrNoRows) {
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
	if err := productQueryRow(t, pool, ctx, productSQL(t, "CreateProductMap", ":one"), pgx.StrictNamedArgs{"name": "SPA03 pointcrawl", "atlas_code": "spa03-pointcrawl", "map_kind": "pointcrawl", "family": "campaign", "region_id": nil, "cols": nil, "rows": nil, "asset_path": nil, "actor_id": actorID.String(), "history_id": uuid.NewString(), "recorded_at": time.Now().UTC()}).Scan(&mapID, new(string), new(string), new(string), new(string), new(*uuid.UUID), new(sql.NullInt32), new(sql.NullInt32), new(*string), new(time.Time), new(*uuid.UUID)); err != nil {
		t.Fatalf("create pointcrawl map: %v", err)
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
		if err := queryNodes.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &nodeID, &name, &x, &y, &createdAt, &submap); err != nil {
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
		if err := nodePresenceRows.Scan(&ordinal, &parentID, &resultMap, &parentExists, &nodeID, new(*string), new(*float64), new(*float64), new(*time.Time), new(*uuid.UUID)); err != nil {
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
	hiddenEdgeHistory := uuid.New()
	firstEdgeHistory, replacementHistory := uuid.New(), uuid.New()
	writeNodeEdge := func(edgeID *uuid.UUID, historyID, a, b uuid.UUID, kind string) (uuid.UUID, uuid.UUID) {
		t.Helper()
		var gotID, gotA uuid.UUID
		var providedID any
		if edgeID != nil {
			providedID = edgeID.String()
		}
		err := productQueryRow(t, pool, ctx, setEdge, pgx.StrictNamedArgs{"edge_id": providedID, "node_a": a.String(), "node_b": b.String(), "map_id": mapID.String(), "directed": false, "kind": kind, "label": nil, "document_id": nil, "history_id": historyID.String(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}).Scan(&gotID, new(uuid.UUID), &gotA, new(uuid.UUID), new(bool), new(string), new(*string), new(*uuid.UUID))
		if err != nil {
			t.Fatal(err)
		}
		return gotID, gotA
	}
	gotEdge, gotA := writeNodeEdge(nil, firstEdgeHistory, nodes[1], nodes[0], "path")
	if gotEdge == uuid.Nil || gotA != nodes[0] {
		t.Fatalf("undirected edge id=%s canonical node_a=%s, want a generated id and %s", gotEdge, gotA, nodes[0])
	}
	updatedEdge, _ := writeNodeEdge(&gotEdge, replacementHistory, nodes[1], nodes[0], "road")
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
	var edgeHistoryIDs []uuid.UUID
	if err := productQueryRow(t, pool, ctx, `SELECT array_agg(public_id ORDER BY recorded_at) FROM map_changes WHERE affected_type='pointcrawl_edge' AND affected_public_id=$1`, gotEdge).Scan(&edgeHistoryIDs); err != nil || fmt.Sprint(edgeHistoryIDs) != fmt.Sprint([]uuid.UUID{firstEdgeHistory, replacementHistory}) {
		t.Fatalf("pointcrawl edge history ids=%v err=%v", edgeHistoryIDs, err)
	}
	hiddenEdgeID, _ := writeNodeEdge(nil, hiddenEdgeHistory, nodes[0], nodes[2], "path")
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
		if err := edgeRows.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &edgeID, &nodeA, &nodeB, &directed, &kind, &label, &doc); err != nil {
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
		if err := edgePresenceRows.Scan(&ordinal, &parentID, &resultMap, &parentExists, &resultEdge, new(*uuid.UUID), new(*uuid.UUID), new(*bool), new(*string), new(*string), new(*uuid.UUID)); err != nil {
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
	linkHistory, unlinkHistory := uuid.New(), uuid.New()
	pointLinkArgs := pgx.StrictNamedArgs{"map_id": mapID.String(), "node_id": nodes[1].String(), "document_id": locationVisible.String(), "relation": "location", "history_id": linkHistory.String(), "recorded_at": time.Now().UTC(), "actor_id": actorID.String()}
	var linkedMap, linkedNode, linkedDoc, linkedActor uuid.UUID
	var linkedRelation string
	var linkedAt time.Time
	if err := productQueryRow(t, pool, ctx, productSQL(t, "LinkProductPointcrawlEntry", ":one"), pointLinkArgs).Scan(&linkedMap, &linkedNode, &linkedDoc, &linkedRelation, &linkedAt, &linkedActor); err != nil || linkedMap != mapID || linkedNode != nodes[1] || linkedDoc != locationVisible || linkedRelation != "location" || linkedActor != actorID {
		t.Fatalf("pointcrawl link map=%s node=%s doc=%s relation=%q actor=%s err=%v", linkedMap, linkedNode, linkedDoc, linkedRelation, linkedActor, err)
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
		if err := pointLinkRows.Scan(&ordinal, &parentID, &resultMapID, &parentExists, &resultNodeID, &resultDocID, &relation, &createdAt, &creatorID); err != nil {
			t.Fatal(err)
		}
		pointLinkOrdinals = append(pointLinkOrdinals, ordinal)
		switch ordinal {
		case 1:
			if !parentExists || parentID != nodes[1] || resultMapID == nil || *resultMapID != mapID || resultNodeID == nil || *resultNodeID != nodes[1] || createdAt == nil {
				t.Fatalf("pointcrawl link child correspondence parent=%s map=%v node=%v exists=%t", parentID, resultMapID, resultNodeID, parentExists)
			}
		case 2:
			if !parentExists || parentID != nodes[1] || resultMapID == nil || *resultMapID != mapID || resultNodeID == nil || *resultNodeID != nodes[1] || resultDocID != nil || relation != nil {
				t.Fatalf("pointcrawl link page-past-end marker parent=%s map=%v node=%v doc=%v relation=%v exists=%t", parentID, resultMapID, resultNodeID, resultDocID, relation, parentExists)
			}
		case 3:
			if parentExists || parentID != missingNodeID || resultMapID != nil || resultNodeID != nil || resultDocID != nil || relation != nil {
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
	var pointUnlinked int32
	pointLinkArgs["history_id"] = unlinkHistory.String()
	if err := productQueryRow(t, pool, ctx, productSQL(t, "UnlinkProductPointcrawlEntry", ":one"), pointLinkArgs).Scan(&pointUnlinked); err != nil || pointUnlinked != 1 {
		t.Fatalf("pointcrawl unlink count=%d err=%v", pointUnlinked, err)
	}
	var linkChangeKind, unlinkChangeKind string
	if err := productQueryRow(t, pool, ctx, `SELECT kind FROM pointcrawl_node_changes WHERE public_id=$1`, linkHistory).Scan(&linkChangeKind); err != nil || linkChangeKind != "entry_linked" {
		t.Fatalf("pointcrawl link history kind=%q err=%v", linkChangeKind, err)
	}
	if err := productQueryRow(t, pool, ctx, `SELECT kind FROM pointcrawl_node_changes WHERE public_id=$1`, unlinkHistory).Scan(&unlinkChangeKind); err != nil || unlinkChangeKind != "entry_unlinked" {
		t.Fatalf("pointcrawl unlink history kind=%q err=%v", unlinkChangeKind, err)
	}
}
