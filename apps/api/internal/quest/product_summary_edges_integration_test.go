//go:build integration

package quest

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestFrontendQuestSummaryCommandAndReplayPreserveIndependentTypedEdges(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	input := f.summaryInput()
	created, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	var regionID int64
	if err := f.fixture.Pool.QueryRow(ctx, `INSERT INTO regions(name,kind) VALUES('Independent summary region','server') RETURNING id`).Scan(&regionID); err != nil {
		t.Fatal(err)
	}
	for _, relation := range []string{"subject", "summarizes"} {
		_, err := f.fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,document_target_id,relation)
			SELECT source.id,target.id,$2 FROM documents source,quests q JOIN documents target ON target.id=q.document_id
			WHERE source.public_id=$1 AND q.public_id=$3`, created.Id, relation, f.questID)
		if err != nil {
			t.Fatal(err)
		}
		_, err = f.fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation)
			SELECT id,$2,$3 FROM documents WHERE public_id=$1`, created.Id, regionID, relation)
		if err != nil {
			t.Fatal(err)
		}
	}
	independentEdges := func() string {
		t.Helper()
		var state string
		err := f.fixture.Pool.QueryRow(ctx, `SELECT jsonb_agg(to_jsonb(l) ORDER BY l.summary_append_order)::text
			FROM document_links l JOIN documents d ON d.id=l.source_id
			WHERE d.public_id=$1 AND l.target_type IN ('document','region')`, created.Id).Scan(&state)
		if err != nil {
			t.Fatal(err)
		}
		return state
	}
	initial := independentEdges()
	input.Input.DocumentId = &created.Id
	input.Input.ExpectedRevision = &created.Version
	input.Input.Body = "Edited by the authoritative Quest summary command"
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	updated, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, meta)
	if err != nil || updated.Version != created.Version+1 {
		t.Fatalf("update=%+v err=%v", updated, err)
	}
	if independentEdges() != initial {
		t.Fatal("Quest summary command changed independent Document/Region subject or summarizes edges/ordinals")
	}
	beforeReplay := summarySnapshot(t, f, created.Id)
	replayed, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, meta)
	if err != nil || replayed.Version != updated.Version || independentEdges() != initial || summarySnapshot(t, f, created.Id) != beforeReplay {
		t.Fatalf("summary replay changed effects or independent edges: %+v %v", replayed, err)
	}
}
