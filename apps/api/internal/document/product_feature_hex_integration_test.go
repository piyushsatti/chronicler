//go:build integration

package document

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestFeatureEntriesSitOnOneHexAndAHexHoldsFour(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	actor, _ := resolve(ctx, frontendAuthor)
	mapID := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,region_id) SELECT $1,'Hexflower','HEX-TEST','pointcrawl',id FROM regions WHERE public_id=$2`, mapID, frontendRegion); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) SELECT id,n,1,1,now() FROM maps, unnest(ARRAY['LFR7008','LFR7009']) n WHERE public_id=$1`, mapID); err != nil {
		t.Fatal(err)
	}
	category := "Feature"
	create := func(frontmatter string) (DocumentView, error) {
		return commands.CreateDocument(ctx, actor, CreateDocumentSpec{Input: DocumentDraftFields{
			Kind: "codex_entry", Category: &category, Title: "Feature " + uuid.NewString()[:8], Body: "Ruins", Visibility: "public", Frontmatter: json.RawMessage(frontmatter),
		}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	}
	onHex := func(hex string) int {
		t.Helper()
		var count int
		if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM pointcrawl_entry_links pel JOIN pointcrawl_nodes n ON n.id=pel.node_id WHERE n.name=$1 AND pel.relation='subject'`, hex).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	for _, frontmatter := range []string{`{}`, `{"hex":"7008"}`, `{"hex":"LFR9999"}`} {
		_, err := create(frontmatter)
		frontendErrorCode(t, err, apierr.Invalid)
	}
	created := []DocumentView{}
	for i := range 4 {
		view, err := create(fmt.Sprintf(`{"hex":"lfr7008","n":%d}`, i))
		if err != nil {
			t.Fatal(err)
		}
		created = append(created, view)
	}
	if got := onHex("LFR7008"); got != 4 {
		t.Fatalf("LFR7008 holds %d Features, want 4", got)
	}
	_, err := create(`{"hex":"LFR7008"}`)
	frontendErrorCode(t, err, apierr.Conflict)

	moved := json.RawMessage(`{"hex":"LFR7009"}`)
	if _, err := commands.UpdateDocument(ctx, actor, UpdateDocumentSpec{Id: created[0].Id, Input: DocumentEditFields{
		ExpectedRevision: int32(created[0].Version), Frontmatter: product.Optional[json.RawMessage]{Set: true, Value: &moved},
	}}, product.CommandMeta{IdempotencyKey: uuid.NewString()}); err != nil {
		t.Fatal(err)
	}
	if a, b := onHex("LFR7008"), onHex("LFR7009"); a != 3 || b != 1 {
		t.Fatalf("after move LFR7008=%d LFR7009=%d, want 3 and 1", a, b)
	}
	if _, err := create(`{"hex":"LFR7008"}`); err != nil {
		t.Fatalf("freed slot rejected: %v", err)
	}
}
