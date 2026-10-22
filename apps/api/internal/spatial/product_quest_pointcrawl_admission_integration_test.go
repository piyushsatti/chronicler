//go:build integration

package spatial

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestQuestPointcrawlAdmissionUsesSpatialVisibilityAndActualRegion(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	actor, err := resolve(ctx, mapArchon)
	if err != nil {
		t.Fatal(err)
	}
	regionID := mapNorth
	world := pointcrawlCreateMap(t, ctx, commands, actor, &regionID)
	node := pointcrawlCreateNode(t, ctx, commands, actor, world.Id)
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck
	repo, _ := NewProductPostgres(tx)
	candidates := []QuestPointcrawlCandidate{{ID: node.Id, Role: "visited"}, {ID: node.Id, Role: "expected"}}
	facts, err := repo.ResolveQuestPointcrawlNodes(ctx, actor, candidates)
	if err != nil || len(facts) != 2 || facts[0].ID != node.Id || facts[0].MapID != world.Id || facts[0].RegionID == nil || *facts[0].RegionID != mapNorth || facts[0].Role != "visited" || facts[1].Role != "expected" || facts[0].AdminOverride || facts[1].AdminOverride {
		t.Fatalf("actual node facts=%+v err=%v", facts, err)
	}
	for _, invalid := range [][]QuestPointcrawlCandidate{
		{{ID: node.Id, Role: "expected"}, {ID: node.Id, Role: "expected"}},
		{{ID: node.Id, Role: "unsupported"}},
		make([]QuestPointcrawlCandidate, 101),
	} {
		_, err := repo.ResolveQuestPointcrawlNodes(ctx, actor, invalid)
		pointcrawlCode(t, err, apierr.Invalid)
	}
	_, err = repo.ResolveQuestPointcrawlNodes(ctx, actor, []QuestPointcrawlCandidate{{ID: uuid.NewString(), Role: "expected"}})
	pointcrawlCode(t, err, apierr.NotFound)
	var docID int64
	if err := tx.QueryRow(ctx, `INSERT INTO documents(kind,category,slug,title,status,visibility,body,author_id)
		SELECT 'codex_entry','location','hidden-quest-admission','Hidden','published','restricted','Private',id FROM members WHERE public_id=$1 RETURNING id`, mapPlayer).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by)
		SELECT n.map_id,n.id,$2,'location',now(),d.author_id FROM pointcrawl_nodes n,documents d WHERE n.public_id=$1 AND d.id=$2`, node.Id, docID); err != nil {
		t.Fatal(err)
	}
	_, err = repo.ResolveQuestPointcrawlNodes(ctx, actor, candidates)
	pointcrawlCode(t, err, apierr.NotFound)
	page, err := repo.readBatchPointcrawlNodes(ctx, actor, []MapNodesKey{{ParentID: world.Id, Limit: 100}})
	if err != nil || len(page) != 1 || page[0].Value == nil || len(page[0].Value.Items) != 0 {
		t.Fatalf("admission diverged from shared node visibility: %+v %v", page, err)
	}
}

func TestQuestPointcrawlAdmissionCarriesOnlyActualLockedOverride(t *testing.T) {
	f, ctx, commands, resolve := pointcrawlFixture(t)
	steward, err := resolve(ctx, mapArchon)
	if err != nil {
		t.Fatal(err)
	}
	region := mapNorth
	world := pointcrawlCreateMap(t, ctx, commands, steward, &region)
	node := pointcrawlCreateNode(t, ctx, commands, steward, world.Id)
	var documentID int64
	if err := f.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,policy,author_id) SELECT 'codex_entry','pointcrawl-command-audit','Private location','published','public','[]'::jsonb,id FROM members WHERE public_id=$1 RETURNING id`, mapPlayer).Scan(&documentID); err != nil {
		t.Fatal(err)
	}
	candidates := []QuestPointcrawlCandidate{{ID: node.Id, Role: "expected"}}
	for _, tc := range []struct {
		name, policy, author                                       string
		noLocation, subject, deleted, revoked, overridden, missing bool
	}{
		{name: "public", policy: "null", author: mapPlayer},
		{name: "explicit grant", policy: `["role:admin"]`, author: mapPlayer},
		{name: "author", policy: `[]`, author: mapAdmin},
		{name: "private location", policy: `[]`, author: mapPlayer, overridden: true},
		{name: "no location", policy: `[]`, author: mapPlayer, noLocation: true},
		{name: "private subject", policy: `[]`, author: mapPlayer, subject: true},
		{name: "deleted location", policy: `[]`, author: mapPlayer, deleted: true, missing: true},
		{name: "revoked current admin", policy: `[]`, author: mapPlayer, revoked: true, missing: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			roles := []string{"admin", "archon"}
			if tc.revoked {
				roles = []string{"player"}
			}
			if _, err := f.Pool.Exec(ctx, `UPDATE members SET roles=$2 WHERE public_id=$1`, mapAdmin, roles); err != nil {
				t.Fatal(err)
			}
			if _, err := f.Pool.Exec(ctx, `UPDATE documents SET policy=$2::jsonb,author_id=(SELECT id FROM members WHERE public_id=$3),deleted_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE id=$1`, documentID, tc.policy, tc.author, tc.deleted); err != nil {
				t.Fatal(err)
			}
			if _, err := f.Pool.Exec(ctx, `DELETE FROM pointcrawl_entry_links WHERE document_id=$1`, documentID); err != nil {
				t.Fatal(err)
			}
			if !tc.noLocation {
				relation := "location"
				if tc.subject {
					relation = "subject"
				}
				if _, err := f.Pool.Exec(ctx, `INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by) SELECT n.map_id,n.id,$2,$3,now(),d.author_id FROM pointcrawl_nodes n,documents d WHERE n.public_id=$1 AND d.id=$2`, node.Id, documentID, relation); err != nil {
					t.Fatal(err)
				}
			}
			actor, err := resolve(ctx, mapAdmin)
			if err != nil {
				t.Fatal(err)
			}
			tx, err := f.Pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			repo, _ := NewProductPostgres(tx)
			facts, err := repo.ResolveQuestPointcrawlNodes(ctx, actor, candidates)
			if rollbackErr := tx.Rollback(ctx); rollbackErr != nil {
				t.Fatal(rollbackErr)
			}
			if tc.missing {
				pointcrawlCode(t, err, apierr.NotFound)
				return
			}
			if err != nil || len(facts) != 1 || facts[0].ID != node.Id || facts[0].MapID != world.Id || facts[0].RegionID == nil || *facts[0].RegionID != mapNorth || facts[0].Role != "expected" || facts[0].AdminOverride != tc.overridden {
				t.Fatalf("facts=%+v err=%v want override=%v", facts, err, tc.overridden)
			}
		})
	}
	// The lock planner sees ordinary admission. Only the current read after
	// the map lock wait may supply the command's actual override evidence.
	if _, err := f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['admin','archon'] WHERE public_id=$1`, mapAdmin); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE documents SET policy='null'::jsonb,deleted_at=NULL WHERE id=$1`, documentID); err != nil {
		t.Fatal(err)
	}
	actor, err := resolve(ctx, mapAdmin)
	if err != nil {
		t.Fatal(err)
	}
	locker, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locker.Rollback(context.Background()) //nolint:errcheck
	if _, err := locker.Exec(ctx, `SELECT id FROM maps WHERE public_id=$1 FOR UPDATE`, world.Id); err != nil {
		t.Fatal(err)
	}
	type result struct {
		facts []PointcrawlAdmission
		err   error
	}
	done := make(chan result, 1)
	go func() {
		tx, err := f.Pool.Begin(ctx)
		if err != nil {
			done <- result{err: err}
			return
		}
		repo, _ := NewProductPostgres(tx)
		facts, err := repo.ResolveQuestPointcrawlNodes(ctx, actor, candidates)
		_ = tx.Rollback(context.Background())
		done <- result{facts, err}
	}()
	waitCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		var waiting bool
		if err := f.Pool.QueryRow(waitCtx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '-- name: LockProductMap :one%')`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		select {
		case <-waitCtx.Done():
			t.Fatal("admission did not wait for map lock", waitCtx.Err())
		case <-ticker.C:
		}
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE documents SET policy='[]'::jsonb WHERE id=$1`, documentID); err != nil {
		t.Fatal(err)
	}
	if err := locker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	got := <-done
	if got.err != nil || len(got.facts) != 1 || !got.facts[0].AdminOverride {
		t.Fatalf("post-lock evidence=%+v err=%v", got.facts, got.err)
	}
}
