//go:build integration

package document

import (
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestDocumentBatchReadsUseConstantStatements(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	actor, err := resolve(ctx, frontendAuthor)
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 20)
	for i := range ids {
		ids[i] = uuid.NewString()
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,category,status,visibility,body,author_id,version) SELECT $1,'codex_entry',$2,$3,'Lore','published','public','Body',id,1 FROM members WHERE public_id=$4`, ids[i], uuid.NewString(), uuid.NewString(), frontendAuthor); err != nil {
			t.Fatal(err)
		}
	}
	pool, counter, err := dbtest.ConnectCounted(ctx, fixture.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	repo, err := NewProductPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}

	countBatch := func(n int) int64 {
		t.Helper()
		keys := make([]DocumentKey, n)
		for i := range keys {
			keys[i] = DocumentKey{ID: ids[i]}
		}
		counter.Reset()
		values, err := repo.ReadBatchDocuments(ctx, actor, keys)
		if err != nil {
			t.Fatal(err)
		}
		if len(values) != n {
			t.Fatalf("batch len=%d want %d", len(values), n)
		}
		for i, value := range values {
			if value.Err != nil || value.Value == nil || value.Value.Id != ids[i] {
				t.Fatalf("batch[%d]=%+v", i, value)
			}
		}
		return counter.Count()
	}
	countReadable := func(n int) int64 {
		t.Helper()
		counter.Reset()
		visible, err := repo.ReadableDocumentIDs(ctx, actor, ids[:n])
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids[:n] {
			if !visible[id] {
				t.Fatalf("id %s not readable", id)
			}
		}
		return counter.Count()
	}

	if got1, got20 := countBatch(1), countBatch(20); got1 != got20 {
		t.Fatalf("ReadBatchDocuments statements 1=%d 20=%d; want constant", got1, got20)
	}
	if got1, got20 := countReadable(1), countReadable(20); got1 != got20 {
		t.Fatalf("ReadableDocumentIDs statements 1=%d 20=%d; want constant", got1, got20)
	}
}
