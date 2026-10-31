//go:build integration

package document

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestFeatureEntriesSitOnOneLightfallHexAndAHexHoldsFour(t *testing.T) {
	fixture, ctx, commands, resolve := frontendDocumentFixture(t)
	dm, _ := resolve(ctx, frontendAuthor)
	player, _ := resolve(ctx, frontendReader)
	// Lightfall map plus a same-named node on another map, which the lookup must ignore.
	for _, atlas := range []string{"WEEPING-LF", "HEX-TEST"} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO maps(public_id,name,atlas_code,map_kind,region_id) SELECT $1,$2,$2,'pointcrawl',id FROM regions WHERE public_id=$3`, uuid.NewString(), atlas, frontendRegion); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO pointcrawl_nodes(map_id,name,x,y,created_at) SELECT m.id,n,1,1,now() FROM maps m, unnest(ARRAY['LFR1001','LFR1002']) n WHERE m.atlas_code='WEEPING-LF' OR (m.atlas_code='HEX-TEST' AND n='LFR1001')`); err != nil {
		t.Fatal(err)
	}
	category := "Feature"
	meta := func() product.CommandMeta { return product.CommandMeta{IdempotencyKey: uuid.NewString()} }
	create := func(actor auth.Authority, frontmatter string) (DocumentView, error) {
		return commands.CreateDocument(ctx, actor, CreateDocumentSpec{Input: DocumentDraftFields{
			Kind: "codex_entry", Category: &category, Title: "Feature " + uuid.NewString()[:8], Body: "Ruins", Visibility: "public", Frontmatter: json.RawMessage(frontmatter),
		}}, meta())
	}
	publish := func(actor auth.Authority, view DocumentView) (DocumentView, error) {
		return commands.PublishDocument(ctx, actor, PublishDocumentSpec{Id: view.Id, ExpectedRevision: int32(view.Version)}, meta())
	}
	onHex := func(hex string) int {
		t.Helper()
		var count int
		if err := fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM pointcrawl_entry_links pel JOIN pointcrawl_nodes n ON n.id=pel.node_id JOIN maps m ON m.id=n.map_id WHERE m.atlas_code='WEEPING-LF' AND n.name=$1 AND pel.relation='subject'`, hex).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	for _, frontmatter := range []string{`{}`, `{"hex":"1001"}`, `{"hex":"LFR9999"}`} {
		_, err := create(dm, frontmatter)
		frontendErrorCode(t, err, apierr.Invalid)
	}

	draft, err := create(player, `{"hex":"LFR1001"}`)
	if err != nil {
		t.Fatalf("player draft: %v", err)
	}
	_, err = publish(player, draft)
	frontendErrorCode(t, err, apierr.Forbidden)
	if !strings.Contains(err.Error(), "DM or admin") {
		t.Fatalf("player publish refused by %v, want the Feature placement rule", err)
	}

	published := []DocumentView{}
	for i := range 4 {
		view, err := create(dm, fmt.Sprintf(`{"hex":"lfr1001","n":%d}`, i))
		if err != nil {
			t.Fatal(err)
		}
		if got := onHex("LFR1001"); got != i {
			t.Fatalf("draft is on the map: LFR1001 holds %d, want %d", got, i)
		}
		if view, err = publish(dm, view); err != nil {
			t.Fatal(err)
		}
		published = append(published, view)
	}
	if got := onHex("LFR1001"); got != 4 {
		t.Fatalf("LFR1001 holds %d Features, want 4", got)
	}
	fifth, err := create(dm, `{"hex":"LFR1001"}`)
	if err != nil {
		t.Fatalf("drafts must not count toward the cap: %v", err)
	}
	_, err = publish(dm, fifth)
	frontendErrorCode(t, err, apierr.Conflict)

	moved := json.RawMessage(`{"hex":"LFR1002"}`)
	if _, err := commands.EditPublishedDocument(ctx, dm, EditPublishedDocumentSpec{Id: published[0].Id, Input: DocumentEditFields{
		ExpectedRevision: int32(published[0].Version), Frontmatter: product.Optional[json.RawMessage]{Set: true, Value: &moved},
	}}, meta()); err != nil {
		t.Fatal(err)
	}
	if a, b := onHex("LFR1001"), onHex("LFR1002"); a != 3 || b != 1 {
		t.Fatalf("after move LFR1001=%d LFR1002=%d, want 3 and 1", a, b)
	}
	if _, err := publish(dm, fifth); err != nil {
		t.Fatalf("freed slot rejected: %v", err)
	}
	if _, err := commands.DeleteDocument(ctx, dm, DeleteDocumentSpec{Id: published[1].Id, ExpectedRevision: int32(published[1].Version)}, meta()); err != nil {
		t.Fatal(err)
	}
	if got := onHex("LFR1001"); got != 3 {
		t.Fatalf("trashed Feature still on the map: LFR1001 holds %d, want 3", got)
	}
	lore := "Lore"
	if _, err := commands.EditPublishedDocument(ctx, dm, EditPublishedDocumentSpec{Id: published[2].Id, Input: DocumentEditFields{
		ExpectedRevision: int32(published[2].Version), Category: product.Optional[string]{Set: true, Value: &lore},
	}}, meta()); err != nil {
		t.Fatal(err)
	}
	if got := onHex("LFR1001"); got != 2 {
		t.Fatalf("former Feature still on the map: LFR1001 holds %d, want 2", got)
	}
}
