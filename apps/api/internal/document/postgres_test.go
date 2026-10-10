//go:build integration

package document_test

import (
	"context"
	"os"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
)

func TestPostgresDocumentBySlug(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

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
