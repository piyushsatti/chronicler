//go:build integration

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	productgraphql "github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type questGraphResponse struct {
	Data   map[string]json.RawMessage `json:"data"`
	Errors []struct {
		Message    string `json:"message"`
		Extensions struct {
			Code string `json:"code"`
		} `json:"extensions"`
	} `json:"errors"`
}

func questGraphCall(t *testing.T, handler http.Handler, actor auth.Authority, query string, variables map[string]any) questGraphResponse {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/graphql", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(auth.WithAuthority(request.Context(), actor))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var result questGraphResponse
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s err=%v", response.Code, response.Body.String(), err)
	}
	return result
}

type questQueueConsumer struct {
	id       string
	revision int
}

func (c *questQueueConsumer) SyncQuest(_ context.Context, id string, revision int) error {
	c.id, c.revision = id, revision
	return nil
}

func TestFrontendQuestAssembledGraphRegionsAndQueuedSync(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	actor, err := f.store.ResolveAuthority(ctx, f.owner.Claims().MemberID)
	if err != nil {
		t.Fatal(err)
	}
	resolver, err := graph.NewResolver(f.services)
	if err != nil {
		t.Fatal(err)
	}
	handler := productgraphql.NewHandler(resolver, productgraphql.DefaultLimits(), f.store.ResolveAuthority)
	regionID := uuid.NewString()
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Quest Graph region','server')`, regionID); err != nil {
		t.Fatal(err)
	}
	created := questGraphCall(t, handler, actor, `mutation CreateQuest($input:CreateQuestInput!,$meta:CommandMeta!){createQuest(input:$input,meta:$meta){id shortCode updatedAt regions}}`, map[string]any{"input": map[string]any{"title": "Graph Quest", "briefBody": "Initial body", "scheduledAt": "2030-02-01T18:00:00Z", "durationHours": 3, "slotsMax": 4, "kinds": []string{"standard"}, "regionIds": []string{regionID}, "genres": []string{}, "tags": []string{}, "signupType": "last_game_played"}, "meta": map[string]any{"idempotencyKey": uuid.NewString()}})
	if len(created.Errors) > 0 {
		t.Fatalf("create errors=%+v", created.Errors)
	}
	var quest struct {
		ID, ShortCode, UpdatedAt string
		Regions                  []string
	}
	if err := json.Unmarshal(created.Data["createQuest"], &quest); err != nil || !reflect.DeepEqual(quest.Regions, []string{regionID}) {
		t.Fatalf("create=%s err=%v", created.Data["createQuest"], err)
	}
	read := func() {
		t.Helper()
		result := questGraphCall(t, handler, actor, `query EditorQuestLoad($id:ID!){quest(id:$id){id shortCode updatedAt regions}}`, map[string]any{"id": quest.ID})
		if len(result.Errors) > 0 {
			t.Fatalf("read errors=%+v", result.Errors)
		}
		if err := json.Unmarshal(result.Data["quest"], &quest); err != nil {
			t.Fatal(err)
		}
	}
	read()
	if !reflect.DeepEqual(quest.Regions, []string{regionID}) {
		t.Fatalf("reload regions=%v", quest.Regions)
	}
	syncQuery := `mutation SyncQuestDiscord($questId:ID!,$meta:CommandMeta!){syncQuestDiscord(questId:$questId,meta:$meta){jobId desiredRevision appliedRevision deliveryStatus}}`
	key := uuid.NewString()
	variables := map[string]any{"questId": quest.ID, "meta": map[string]any{"idempotencyKey": key}}
	synced := questGraphCall(t, handler, actor, syncQuery, variables)
	if len(synced.Errors) > 0 {
		t.Fatalf("assembled sync errors=%+v", synced.Errors)
	}
	var receipt struct {
		JobID, DeliveryStatus            string
		DesiredRevision, AppliedRevision int
	}
	if err := json.Unmarshal(synced.Data["syncQuestDiscord"], &receipt); err != nil || receipt.DeliveryStatus != "queued" || receipt.DesiredRevision != 2 || receipt.AppliedRevision != 0 {
		t.Fatalf("sync=%s err=%v", synced.Data["syncQuestDiscord"], err)
	}
	if _, err := uuid.Parse(receipt.JobID); err != nil {
		t.Fatalf("queued jobId is not an actual public UUID: %q", receipt.JobID)
	}
	snapshot := func() string {
		t.Helper()
		var state string
		if err := f.db.Pool.QueryRow(ctx, `SELECT jsonb_build_object('quest',to_jsonb(q),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM background_jobs j),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY key) FROM idempotency_keys r))::text FROM quests q WHERE q.public_id=$1`, quest.ID).Scan(&state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	before := snapshot()
	replay := questGraphCall(t, handler, actor, syncQuery, variables)
	if len(replay.Errors) > 0 || !bytes.Equal(replay.Data["syncQuestDiscord"], synced.Data["syncQuestDiscord"]) || snapshot() != before {
		t.Fatalf("sync replay=%s errors=%+v", replay.Data["syncQuestDiscord"], replay.Errors)
	}
	var kind, jobID string
	var payload jobs.QuestDiscordPayload
	var raw []byte
	if err := f.db.Pool.QueryRow(ctx, `SELECT kind,payload,public_id::text FROM background_jobs WHERE job_key=$1`, jobs.QuestDiscordKey(quest.ID)).Scan(&kind, &raw, &jobID); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &payload); err != nil || kind != delivery.KindQuestDiscord || jobID != receipt.JobID || payload.PublicID != quest.ID || payload.DesiredRevision != 2 {
		t.Fatalf("queued kind=%s payload=%+v err=%v", kind, payload, err)
	}
	// Fail the real job update after the desired revision bump and prove one UOW.
	if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_quest_queue_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic queue rollback'; END $$`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `CREATE TRIGGER reject_quest_queue_test BEFORE UPDATE ON background_jobs FOR EACH ROW EXECUTE FUNCTION reject_quest_queue_test()`); err != nil {
		t.Fatal(err)
	}
	failed := questGraphCall(t, handler, actor, syncQuery, map[string]any{"questId": quest.ID, "meta": map[string]any{"idempotencyKey": uuid.NewString()}})
	if len(failed.Errors) != 1 || failed.Errors[0].Extensions.Code != "INTERNAL" || snapshot() != before {
		t.Fatalf("queue rollback errors=%+v", failed.Errors)
	}
	if _, err := f.db.Pool.Exec(ctx, `DROP TRIGGER reject_quest_queue_test ON background_jobs`); err != nil {
		t.Fatal(err)
	}
	consumer := &questQueueConsumer{}
	if worked, err := delivery.NewHandler(jobs.NewPostgresStore(f.db.Pool.Pool), consumer).ProcessOne(ctx); err != nil || !worked || consumer.id != quest.ID || consumer.revision != 2 {
		t.Fatalf("local consumer id=%s revision=%d worked=%v err=%v", consumer.id, consumer.revision, worked, err)
	}
	read()
	update := func(input map[string]any) {
		t.Helper()
		result := questGraphCall(t, handler, actor, `mutation UpdateQuest($id:ID!,$input:QuestEditInput!,$meta:CommandMeta!){updateQuest(id:$id,input:$input,meta:$meta){id updatedAt regions}}`, map[string]any{"id": quest.ID, "input": input, "meta": map[string]any{"idempotencyKey": uuid.NewString()}})
		if len(result.Errors) > 0 {
			t.Fatalf("update errors=%+v", result.Errors)
		}
		if err := json.Unmarshal(result.Data["updateQuest"], &quest); err != nil {
			t.Fatal(err)
		}
	}
	update(map[string]any{"expectedUpdatedAt": quest.UpdatedAt, "title": "Retain regions", "briefBody": "Edited body"})
	if !reflect.DeepEqual(quest.Regions, []string{regionID}) {
		t.Fatalf("omission cleared regions=%v", quest.Regions)
	}
	read()
	update(map[string]any{"expectedUpdatedAt": quest.UpdatedAt, "regionIds": []string{}})
	read()
	if len(quest.Regions) != 0 {
		t.Fatalf("clear retained regions=%v", quest.Regions)
	}
}
