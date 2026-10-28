//go:build integration

package spatial

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestPointcrawlNodeStateMigrationLocksExistingNodes(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("nodestate"), postgres.WithUsername("nodestate"), postgres.WithPassword("synthetic-nodestate"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := container.Terminate(cleanup); err != nil {
			t.Errorf("terminate owned PostgreSQL: %v", err)
		}
	})
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	const migrations = "../../db/migrations"
	stateColumns := func() int {
		t.Helper()
		var n int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_name = 'pointcrawl_nodes' AND column_name = 'state'`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := goose.UpToContext(ctx, db, migrations, 10); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO maps(id,name,atlas_code,map_kind) VALUES (1,'Weeping','NS-STATE','pointcrawl')`,
		`INSERT INTO pointcrawl_nodes(id,map_id,name,x,y,created_at) VALUES (11,1,'Existing',0,0,now())`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("SQL %s: %v", q, err)
		}
	}
	if err := goose.UpToContext(ctx, db, migrations, 11); err != nil {
		t.Fatal(err)
	}
	var existing string
	if err := db.QueryRowContext(ctx, `SELECT state FROM pointcrawl_nodes WHERE id = 11`).Scan(&existing); err != nil {
		t.Fatal(err)
	}
	if existing != "locked" {
		t.Fatalf("existing node state after 0011 = %q, want locked", existing)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO pointcrawl_nodes(id,map_id,name,x,y,created_at) VALUES (12,1,'New',1,1,now())`); err != nil {
		t.Fatal(err)
	}
	var fresh string
	if err := db.QueryRowContext(ctx, `SELECT state FROM pointcrawl_nodes WHERE id = 12`).Scan(&fresh); err != nil {
		t.Fatal(err)
	}
	if fresh != "locked" {
		t.Fatalf("new node state after 0011 = %q, want locked", fresh)
	}
	for _, valid := range []string{"unlocked", "mapped", "locked"} {
		if _, err := db.ExecContext(ctx, `UPDATE pointcrawl_nodes SET state = $1 WHERE id = 11`, valid); err != nil {
			t.Fatalf("state %q rejected: %v", valid, err)
		}
	}
	if _, err := db.ExecContext(ctx, `UPDATE pointcrawl_nodes SET state = 'hidden' WHERE id = 11`); err == nil {
		t.Fatal("state 'hidden' accepted, want check violation")
	}
	if err := goose.DownToContext(ctx, db, migrations, 10); err != nil {
		t.Fatal(err)
	}
	if got := stateColumns(); got != 0 {
		t.Fatalf("state columns after down to 0010 = %d, want 0", got)
	}
}
