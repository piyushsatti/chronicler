// Package migrate applies the embedded goose migrations. It is invoked only
// by the explicit `api migrate` subcommand; the API never migrates at boot.
package migrate

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"io/fs"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/piyushsatti/chronicler/apps/api/db/migrations"
)

func provider(db *sql.DB, fsys fs.FS) (*goose.Provider, error) {
	return goose.NewProvider(goose.DialectPostgres, db, fsys)
}

func open(ctx context.Context, databaseURL string) (*sql.DB, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return db, nil
}

// Up applies all pending embedded migrations and reports each to out.
func Up(ctx context.Context, databaseURL string, out io.Writer) error {
	db, err := open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	return up(ctx, db, migrations.FS, out)
}

func up(ctx context.Context, db *sql.DB, fsys fs.FS, out io.Writer) error {
	p, err := provider(db, fsys)
	if err != nil {
		return err
	}
	results, err := p.Up(ctx)
	for _, r := range results {
		fmt.Fprintf(out, "applied %s (%s)\n", r.Source.Path, r.Duration)
	}
	if err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	if len(results) == 0 {
		fmt.Fprintln(out, "no pending migrations")
	}
	return nil
}

// Status prints every embedded migration and whether it is applied.
func Status(ctx context.Context, databaseURL string, out io.Writer) error {
	db, err := open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	p, err := provider(db, migrations.FS)
	if err != nil {
		return err
	}
	statuses, err := p.Status(ctx)
	if err != nil {
		return fmt.Errorf("goose status: %w", err)
	}
	for _, s := range statuses {
		state := "pending"
		if s.State == goose.StateApplied {
			state = "applied " + s.AppliedAt.UTC().Format("2006-01-02T15:04:05Z")
		}
		fmt.Fprintf(out, "%-40s %s\n", s.Source.Path, state)
	}
	return nil
}
