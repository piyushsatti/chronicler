//go:build integration

package document_test

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestPostgresDocumentBySlug(t *testing.T) {
	ctx := context.Background()
	pool := dbtest.Pool(t)

	repo := document.NewPostgresReadRepo(pool.Pool)
	q := document.Queries{Repo: repo}
	d, err := q.BySlug(ctx, "quest-welcome")
	if err != nil {
		t.Fatalf("by slug: %v", err)
	}
	if d.Title == "" {
		t.Fatal("expected title")
	}
}
