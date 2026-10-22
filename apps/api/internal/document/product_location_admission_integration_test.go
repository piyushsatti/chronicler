//go:build integration

package document

import (
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func TestFrontendLocationAdmissionUsesCurrentDocumentRegions(t *testing.T) {
	f, ctx, _, resolve := frontendDocumentFixture(t)
	archon, _ := resolve(ctx, frontendArchon)
	author, _ := resolve(ctx, frontendAuthor)
	admin, _ := resolve(ctx, frontendAdmin)
	otherRegion := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO regions(public_id,name,kind) VALUES($1,'Other region','archon')`, otherRegion); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Pool.Exec(ctx, `INSERT INTO archon_assignments(member_id,region_id) SELECT m.id,r.id FROM members m,regions r WHERE m.public_id=$1 AND r.public_id=$2`, frontendArchon, otherRegion); err != nil {
		t.Fatal(err)
	}
	locationID := uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id) SELECT $1,'codex_entry','admitted-location','Location','Locations','published','public','unchanged',m.id FROM members m WHERE m.public_id=$2`, locationID, frontendAuthor); err != nil {
		t.Fatal(err)
	}
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	reader, _ := NewProductPostgres(tx)
	unlinked, err := reader.AdmitLocationLink(ctx, archon, locationID, frontendRegion)
	if err != nil || len(unlinked.LinkedRegionIDs) != 0 || unlinked.UsedOverride {
		t.Fatalf("unlinked=%+v err=%v", unlinked, err)
	}
	_, err = reader.AdmitLocationLink(ctx, author, locationID, frontendRegion)
	frontendErrorCode(t, err, apierr.Forbidden)
	if _, err := tx.Exec(ctx, `INSERT INTO document_links(source_id,region_target_id,relation) SELECT d.id,r.id,'located_in' FROM documents d,regions r WHERE d.public_id=$1 AND r.public_id=$2`, locationID, frontendRegion); err != nil {
		t.Fatal(err)
	}
	linked, err := reader.AdmitLocationLink(ctx, archon, locationID, frontendRegion)
	if err != nil || len(linked.LinkedRegionIDs) != 1 || linked.LinkedRegionIDs[0] != frontendRegion {
		t.Fatalf("linked=%+v err=%v", linked, err)
	}
	_, err = reader.AdmitLocationLink(ctx, archon, locationID, otherRegion)
	frontendErrorCode(t, err, apierr.Forbidden)
	override, err := reader.AdmitLocationLink(ctx, admin, locationID, otherRegion)
	if err != nil || !override.UsedOverride {
		t.Fatalf("override=%+v err=%v", override, err)
	}
	if _, err := tx.Exec(ctx, `UPDATE documents SET category='Lore' WHERE public_id=$1`, locationID); err != nil {
		t.Fatal(err)
	}
	_, err = reader.AdmitLocationLink(ctx, admin, locationID, frontendRegion)
	frontendErrorCode(t, err, apierr.Invalid)
	if _, err := tx.Exec(ctx, `UPDATE documents SET category='Locations',deleted_at=now() WHERE public_id=$1`, locationID); err != nil {
		t.Fatal(err)
	}
	_, err = reader.AdmitLocationLink(ctx, admin, locationID, frontendRegion)
	frontendErrorCode(t, err, apierr.Invalid)
}
