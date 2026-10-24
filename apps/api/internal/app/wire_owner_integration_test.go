//go:build integration

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

func TestWireConfiguredOwnerHTTPAuthority(t *testing.T) {
	ctx := context.Background()
	f := dbtest.NewProductFixture(t)
	owner, player, admin := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, actor := range []struct {
		id, handle, discordID string
		roles                 []string
	}{
		{owner, "wire-owner", "12345678901234567", []string{"player"}},
		{player, "wire-player", "22345678901234567", []string{"player"}},
		{admin, "wire-admin", "32345678901234567", []string{"player", "admin"}},
	} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$3,$3,$4)`, actor.id, actor.discordID, actor.handle, actor.roles); err != nil {
			t.Fatal(err)
		}
	}
	cfg := config.Config{DatabaseURL: f.DatabaseURL, RequireDatabase: true, JWTSecret: "wire-owner-synthetic-secret", PlatformOwnerDiscordID: "12345678901234567"}
	runtime := Wire(ctx, cfg)
	t.Cleanup(runtime.Pool.Close)
	mux := http.NewServeMux()
	MountFromAPI(mux, runtime, cfg)
	handler := auth.LiveMiddleware(login.Parser(cfg.JWTSecret), runtime.Authority, mux)
	ownerToken := wireOwnerToken(t, cfg, owner, []auth.Role{auth.Player})
	// Signed role claims deliberately disagree with current database authority.
	playerToken := wireOwnerToken(t, cfg, player, []auth.Role{auth.Admin})
	adminToken := wireOwnerToken(t, cfg, admin, []auth.Role{auth.Admin})
	queries := []string{
		`query CurrentAdminAccess { adminOperations(limit:1,offset:0) { activeAlertCount } }`,
		`query CurrentReviewAccess { pendingDmProfileVerifications(limit:1,offset:0) { total } }`,
	}
	t.Run("UUID configured owner retains mounted read access", func(t *testing.T) {
		uuidCfg := cfg
		uuidCfg.PlatformOwnerDiscordID = ""
		uuidCfg.PlatformOwnerMemberID = owner
		uuidRuntime := Wire(ctx, uuidCfg)
		defer uuidRuntime.Pool.Close()
		uuidMux := http.NewServeMux()
		MountFromAPI(uuidMux, uuidRuntime, uuidCfg)
		uuidHandler := auth.LiveMiddleware(login.Parser(uuidCfg.JWTSecret), uuidRuntime.Authority, uuidMux)
		actor, err := uuidRuntime.Authority(ctx, owner)
		if err != nil || !actor.IsPlatformOwner() || uuidRuntime.Members.ConfiguredOwnerID() != owner {
			t.Fatalf("UUID configured owner=%v retained=%v err=%v", actor.IsPlatformOwner(), uuidRuntime.Members.ConfiguredOwnerID() == owner, err)
		}
		for _, query := range queries {
			wireOwnerGraphQL(t, uuidHandler, ownerToken, query, nil, http.StatusOK, "")
		}
	})
	t.Run("configured Player owner survives production wiring", func(t *testing.T) {
		actor, err := runtime.Authority(ctx, owner)
		if err != nil || !actor.IsPlatformOwner() || actor.Claims().Has(auth.Admin) || runtime.Members.ConfiguredOwnerID() != owner {
			t.Errorf("configured owner=%v admin=%v retained=%v err=%v", actor.IsPlatformOwner(), actor.Claims().Has(auth.Admin), runtime.Members.ConfiguredOwnerID() == owner, err)
		}
		for _, query := range queries {
			data := wireOwnerGraphQL(t, handler, ownerToken, query, nil, http.StatusOK, "")
			// No jobs or heartbeat exist: SiteActiveAlertCount reports one missing-heartbeat alert.
			if string(data) != `{"adminOperations":{"activeAlertCount":1}}` && string(data) != `{"pendingDmProfileVerifications":{"total":0}}` {
				t.Errorf("configured-owner read returned unexpected data: %s", data)
			}
		}
	})
	t.Run("ordinary roles and revocation use current database state", func(t *testing.T) {
		actor, err := runtime.Authority(ctx, admin)
		if err != nil || actor.IsPlatformOwner() || !actor.Claims().Has(auth.Admin) {
			t.Fatalf("ordinary admin owner=%v admin=%v err=%v", actor.IsPlatformOwner(), actor.Claims().Has(auth.Admin), err)
		}
		for _, query := range queries {
			wireOwnerGraphQL(t, handler, playerToken, query, nil, http.StatusOK, "FORBIDDEN")
			wireOwnerGraphQL(t, handler, adminToken, query, nil, http.StatusOK, "")
		}
		const adminMutation = `mutation AdminCatalog { upsertCreationCatalogEntry(input:{kind:"background",name:"wire-admin-allowed",available:true,retired:false},meta:{idempotencyKey:"wire-admin-ordinary"}) { id name } }`
		data := wireOwnerGraphQL(t, handler, adminToken, adminMutation, nil, http.StatusOK, "")
		var saved struct {
			Entry struct{ ID, Name string } `json:"upsertCreationCatalogEntry"`
		}
		if err := json.Unmarshal(data, &saved); err != nil || uuid.Validate(saved.Entry.ID) != nil || saved.Entry.Name != "wire-admin-allowed" {
			t.Fatalf("ordinary admin catalog result=%s err=%v", data, err)
		}
		var completed int
		if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys WHERE key='wire-admin-ordinary' AND completed_at IS NOT NULL`).Scan(&completed); err != nil || completed != 1 {
			t.Fatalf("ordinary admin completed receipt=%d err=%v", completed, err)
		}
		var ordinaryFacts bool
		if err := f.Pool.QueryRow(ctx, `SELECT receipt ? '_authorizationOverrides' FROM idempotency_keys WHERE key='wire-admin-ordinary'`).Scan(&ordinaryFacts); err != nil || ordinaryFacts {
			t.Fatalf("ordinary admin false override=%v err=%v", ordinaryFacts, err)
		}
		if _, err := f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player'] WHERE public_id=$1`, admin); err != nil {
			t.Fatal(err)
		}
		for _, query := range queries {
			wireOwnerGraphQL(t, handler, adminToken, query, nil, http.StatusOK, "FORBIDDEN")
		}
		wireOwnerGraphQL(t, handler, adminToken, adminMutation, nil, http.StatusOK, "FORBIDDEN")
	})
	t.Run("owner override uses actual created catalog identity and replays once", func(t *testing.T) {
		query := `mutation OwnerCatalog($input:UpsertCreationCatalogEntryInput!,$meta:CommandMeta!) { upsertCreationCatalogEntry(input:$input,meta:$meta) { id name } }`
		variables := map[string]any{"input": map[string]any{"kind": "species", "name": "wire-owner-catalog", "available": true, "retired": false}, "meta": map[string]any{"idempotencyKey": "wire-owner-audited"}}
		var originalID, originalReceipt string
		for attempt := 0; attempt < 2; attempt++ {
			data := wireOwnerGraphQL(t, handler, ownerToken, query, variables, http.StatusOK, "")
			var saved struct {
				Entry struct{ ID, Name string } `json:"upsertCreationCatalogEntry"`
			}
			if err := json.Unmarshal(data, &saved); err != nil || uuid.Validate(saved.Entry.ID) != nil || saved.Entry.Name != "wire-owner-catalog" {
				t.Fatalf("owner catalog=%s err=%v", data, err)
			}
			var receipt string
			if err := f.Pool.QueryRow(ctx, `SELECT receipt::text||':'||xmin::text FROM idempotency_keys WHERE key='wire-owner-audited'`).Scan(&receipt); err != nil {
				t.Fatal(err)
			}
			if attempt == 0 {
				originalID, originalReceipt = saved.Entry.ID, receipt
			} else if originalID != saved.Entry.ID || originalReceipt != receipt {
				t.Fatal("replay changed catalog ID or durable receipt")
			}
		}
		assertWireOverrideFacts(t, f, owner, "upsertCreationCatalogEntry", "wire-owner-audited", []string{originalID}, "character", "ROLE")
		var catalog, receipts int
		var auditAbsent bool
		if err := f.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM creation_catalog WHERE name='wire-owner-catalog'),(SELECT count(*) FROM idempotency_keys WHERE key='wire-owner-audited'),to_regclass('public.auth_override_audit') IS NULL`).Scan(&catalog, &receipts, &auditAbsent); err != nil {
			t.Fatal(err)
		}
		if catalog != 1 || receipts != 1 || !auditAbsent {
			t.Fatalf("catalog=%d receipts=%d auditAbsent=%v", catalog, receipts, auditAbsent)
		}
	})
	t.Run("actual typed created subjects and ordered successful role batch", func(t *testing.T) {
		actor, err := runtime.Authority(ctx, owner)
		if err != nil {
			t.Fatal(err)
		}
		services := runtime.Resolver.Services
		backstoryMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		backstory, err := services.CharacterCommands.CreateBackstory(ctx, actor, character.CreateBackstorySpec{Input: character.BackstoryFields{Name: "Receipt backstory", Lore: "Authored lore", Cohort: "Receipt cohort"}}, backstoryMeta)
		if err != nil {
			t.Fatal(err)
		}
		assertWireOverrideFacts(t, f, owner, "createBackstory", backstoryMeta.IdempotencyKey, []string{backstory.Id}, "character", "ROLE")
		unlockMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		unlock, err := services.MemberCommands.UpsertUnlockable(ctx, actor, member.UpsertUnlockableSpec{Input: member.UpsertUnlockableFields{Name: "Receipt unlockable", Kind: member.UnlockKindAchievement, Payload: json.RawMessage(`{}`), Active: true}}, unlockMeta)
		if err != nil {
			t.Fatal(err)
		}
		assertWireOverrideFacts(t, f, owner, "upsertUnlockable", unlockMeta.IdempotencyKey, []string{unlock.Id}, "member", "ROLE")
		batchMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		batch := member.SetMemberRolesBatchSpec{Changes: []member.MemberRoleBatchFields{{MemberId: player, Roles: []string{"player", "verifier"}}, {MemberId: admin, Roles: []string{"player", "dm"}}}}
		rows, err := services.MemberCommands.SetMemberRolesBatch(ctx, actor, batch, batchMeta)
		if err != nil || len(rows) != 2 {
			t.Fatalf("batch=%+v err=%v", rows, err)
		}
		for i, row := range rows {
			if !row.Ok || row.Error != nil || row.Member == nil || row.MemberId != batch.Changes[i].MemberId || row.Member.Id != row.MemberId {
				t.Fatalf("batch row=%+v", row)
			}
		}
		assertWireOverrideFacts(t, f, owner, "setMemberRolesBatch", batchMeta.IdempotencyKey, []string{player, admin}, "member", "ROLE")
		var before, after string
		const batchState = `SELECT jsonb_build_object('history',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM role_changes r),'receipt',(SELECT receipt FROM idempotency_keys WHERE key=$1))::text`
		if err := f.Pool.QueryRow(ctx, batchState, batchMeta.IdempotencyKey).Scan(&before); err != nil {
			t.Fatal(err)
		}
		replayed, err := services.MemberCommands.SetMemberRolesBatch(ctx, actor, batch, batchMeta)
		originalJSON, encodeErr := json.Marshal(rows)
		replayJSON, replayEncodeErr := json.Marshal(replayed)
		if err != nil || encodeErr != nil || replayEncodeErr != nil || !bytes.Equal(originalJSON, replayJSON) {
			t.Fatalf("batch replay business JSON differs: err=%v encode=%v/%v", err, encodeErr, replayEncodeErr)
		}
		for i, row := range replayed {
			if !row.Member.JoinedAt.Equal(rows[i].Member.JoinedAt) {
				t.Fatal("batch replay changed joined instant")
			}
			t.Logf("batch row%d identical business JSON and JoinedAt instant; original zone=%s replay zone=%s", i, rows[i].Member.JoinedAt.Location(), row.Member.JoinedAt.Location())
		}
		if err := f.Pool.QueryRow(ctx, batchState, batchMeta.IdempotencyKey).Scan(&after); err != nil || before != after {
			t.Fatalf("batch replay changed facts/history: %v", err)
		}
		if _, err := f.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, admin); err != nil {
			t.Fatal(err)
		}
		questMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		created, err := services.QuestCommands.CreateQuest(ctx, actor, quest.CreateQuestSpec{Input: quest.CreateQuestFields{Title: "Receipt quest", BriefBody: "Authored brief", ScheduledAt: time.Date(2032, 1, 1, 18, 0, 0, 0, time.UTC), DurationHours: 2, SlotsMax: 3, DmId: &admin}}, questMeta)
		if err != nil {
			t.Fatal(err)
		}
		assertWireOverrideFacts(t, f, owner, "createQuest", questMeta.IdempotencyKey, []string{created.Id}, "quest", "ROLE")
		arcMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		arc, err := services.QuestCommands.UpsertQuestArc(ctx, actor, quest.UpsertQuestArcSpec{Name: "Receipt arc"}, arcMeta)
		if err != nil {
			t.Fatal(err)
		}
		assertWireOverrideFacts(t, f, owner, "upsertQuestArc", arcMeta.IdempotencyKey, []string{arc.Id}, "quest", "ROLE")
		summaryMeta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
		summary, err := services.QuestCommands.UpsertQuestSummary(ctx, actor, quest.UpsertQuestSummarySpec{Input: quest.QuestSummaryFields{QuestIds: []string{created.Id}, Title: "Receipt summary", Body: "Authored summary", Visibility: "public", Frontmatter: json.RawMessage(`{}`)}}, summaryMeta)
		if err != nil {
			t.Fatal(err)
		}
		assertWireOverrideFacts(t, f, owner, "upsertQuestSummary", summaryMeta.IdempotencyKey, []string{summary.Id}, "quest", "OWNERSHIP")
	})
	t.Run("owner status revocation rejects unchanged JWT", func(t *testing.T) {
		if _, err := f.Pool.Exec(ctx, `UPDATE members SET status='inactive' WHERE public_id=$1`, owner); err != nil {
			t.Fatal(err)
		}
		for _, query := range queries {
			wireOwnerGraphQL(t, handler, ownerToken, query, nil, http.StatusForbidden, "FORBIDDEN")
		}
	})
}

func TestWireConfiguredOwnerStartupValidation(t *testing.T) {
	ctx := context.Background()
	f := dbtest.NewProductFixture(t)
	inactive, banned, mismatch := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, actor := range []struct{ id, discordID, status string }{{inactive, "42345678901234567", "inactive"}, {banned, "52345678901234567", "banned"}, {mismatch, "62345678901234567", "active"}} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles,status) VALUES($1::uuid,$2,$2,'Unavailable owner',ARRAY['player'],$3)`, actor.id, actor.discordID, actor.status); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct{ name, owner, discordOwner, reason string }{
		{"malformed", "not-a-uuid", "", "invalid"},
		{"noncanonical", strings.ToUpper("aaaaaaaa-0000-4000-8000-000000000001"), "", "invalid"},
		{"missing", uuid.NewString(), "", "configured owner must resolve active"},
		{"inactive", inactive, "", "configured owner must resolve active"},
		{"banned", banned, "", "configured owner must resolve active"},
		{"unknown Discord", "", "72345678901234567", "configured owner must resolve active"},
		{"inactive Discord", "", "42345678901234567", "configured owner must resolve active"},
		{"mismatched dual owner", inactive, "62345678901234567", "configured owner identity mismatch"},
	} {
		t.Run(test.name, func(t *testing.T) {
			defer func() {
				recovered := recover()
				message, ok := recovered.(string)
				if !ok || !strings.Contains(message, test.reason) {
					t.Errorf("startup rejection=%v; want %q", recovered, test.reason)
				}
			}()
			runtime := Wire(ctx, config.Config{DatabaseURL: f.DatabaseURL, RequireDatabase: true, JWTSecret: "wire-owner-startup-secret", PlatformOwnerMemberID: test.owner, PlatformOwnerDiscordID: test.discordOwner})
			runtime.Pool.Close()
		})
	}
	t.Run("matching dual identifiers resolve one immutable owner", func(t *testing.T) {
		active := uuid.NewString()
		if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1::uuid,'82345678901234567','dual-owner','dual-owner',ARRAY['player'])`, active); err != nil {
			t.Fatal(err)
		}
		runtime := Wire(ctx, config.Config{DatabaseURL: f.DatabaseURL, RequireDatabase: true, JWTSecret: "wire-owner-startup-secret", PlatformOwnerMemberID: active, PlatformOwnerDiscordID: "82345678901234567"})
		defer runtime.Pool.Close()
		if runtime.Members.ConfiguredOwnerID() != active {
			t.Fatalf("configured owner=%q want %q", runtime.Members.ConfiguredOwnerID(), active)
		}
	})
	t.Run("absent owner grants no implicit ownership", func(t *testing.T) {
		if _, err := f.Pool.Exec(ctx, `UPDATE members SET status='active' WHERE public_id=$1`, inactive); err != nil {
			t.Fatal(err)
		}
		runtime := Wire(ctx, config.Config{DatabaseURL: f.DatabaseURL, RequireDatabase: true, JWTSecret: "wire-owner-startup-secret"})
		defer runtime.Pool.Close()
		actor, err := runtime.Authority(ctx, inactive)
		if err != nil || actor.IsPlatformOwner() || runtime.Members.ConfiguredOwnerID() != "" {
			t.Fatalf("absent configured owner=%v err=%v", actor.IsPlatformOwner(), err)
		}
	})
}

func TestWireConfiguredOwnerRejectsMemoryFallback(t *testing.T) {
	cfg := config.Config{DatabaseURL: ":invalid-url", PlatformOwnerMemberID: uuid.NewString()}
	t.Run("configured owner requires live resolver", func(t *testing.T) {
		defer func() {
			recovered := recover()
			message, ok := recovered.(string)
			if !ok || !strings.Contains(message, "configured owner requires live authority resolver") {
				t.Errorf("startup rejection=%v", recovered)
			}
		}()
		Wire(context.Background(), cfg)
	})
	t.Run("configured Discord owner cannot use memory fallback", func(t *testing.T) {
		defer func() {
			recovered := recover()
			message, ok := recovered.(string)
			if !ok || !strings.Contains(message, "configured Discord owner requires member lookup") {
				t.Errorf("startup rejection=%v", recovered)
			}
		}()
		Wire(context.Background(), config.Config{DatabaseURL: ":invalid-url", PlatformOwnerDiscordID: "92345678901234567"})
	})
	t.Run("ordinary development fallback remains available", func(t *testing.T) {
		cfg.PlatformOwnerMemberID = ""
		runtime := Wire(context.Background(), cfg)
		if runtime.Pool != nil || runtime.Authority != nil || runtime.Members != nil {
			t.Fatal("development fallback unexpectedly created live authority")
		}
	})
}

func wireOwnerToken(t *testing.T, cfg config.Config, id string, roles []auth.Role) string {
	t.Helper()
	token, err := login.Mint(cfg.JWTSecret, login.Claims{MemberID: id, Roles: roles, Exp: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func wireOwnerGraphQL(t *testing.T, handler http.Handler, token, query string, variables map[string]any, wantStatus int, wantCode string) json.RawMessage {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var result struct {
		Data   json.RawMessage `json:"data"`
		Code   string          `json:"code"`
		Errors []struct {
			Extensions struct{ Code string } `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	gotCode := result.Code
	if len(result.Errors) > 0 {
		gotCode = result.Errors[0].Extensions.Code
	}
	if response.Code != wantStatus || gotCode != wantCode || len(result.Errors) > 1 {
		t.Errorf("HTTP=%d code=%q errors=%d; want HTTP=%d code=%q", response.Code, gotCode, len(result.Errors), wantStatus, wantCode)
	}
	return result.Data
}

func assertWireOverrideFacts(t *testing.T, f *dbtest.ProductFixture, actor, operation, key string, subjects []string, subjectType, rule string) {
	t.Helper()
	var raw json.RawMessage
	if err := f.Pool.QueryRow(t.Context(), `SELECT receipt->'_authorizationOverrides' FROM idempotency_keys r JOIN members m ON m.id=r.actor_id WHERE m.public_id=$1 AND r.endpoint=$2 AND r.key=$3 AND completed_at IS NOT NULL`, actor, "graphql:"+operation, key).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var facts []idempotency.CommandOverrideFact
	if err := idempotency.StrictJSON(raw, &facts); err != nil || len(facts) != len(subjects) {
		t.Fatalf("facts=%s err=%v", raw, err)
	}
	for i, fact := range facts {
		if fact.ActorID != actor || fact.Operation != "Mutation."+operation || fact.SubjectType != subjectType || fact.SubjectID != subjects[i] || fact.RuleCode != rule || fact.At.IsZero() || !fact.At.Equal(fact.At.Truncate(time.Microsecond)) {
			t.Fatalf("fact%d=%+v", i, fact)
		}
		if _, offset := fact.At.Zone(); offset != 0 {
			t.Fatal("fact clock is not UTC")
		}
	}
}
