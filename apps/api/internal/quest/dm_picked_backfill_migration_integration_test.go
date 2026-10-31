//go:build integration

package quest

import (
	"context"
	"database/sql"
	"os"
	"reflect"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestDMPickedMigrationBackfillsOpenLastGamePlayedSeats(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires disposable PostgreSQL; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	container, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("dmpicked"), postgres.WithUsername("dmpicked"), postgres.WithPassword("synthetic-dmpicked"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
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
	if err := goose.UpToContext(ctx, db, migrations, 8); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO members(id,discord_id,handle,display_name) VALUES (1,'dmp-1','dmp-1','DM'),(2,'dmp-2','dmp-2','A'),(3,'dmp-3','dmp-3','B')`,
		`INSERT INTO characters(id,short_code,name,owner_id,status) VALUES (11,'DMP-A','A',2,'active'),(12,'DMP-B','B',3,'active')`,
		`INSERT INTO documents(id,kind,slug,title,author_id) VALUES (21,'quest_brief','dmp-open','Open',1),(22,'quest_brief','dmp-played','Played',1),(23,'quest_brief','dmp-pick','Pick',1),(24,'quest_brief','dmp-full','Full',1)`,
		`INSERT INTO quests(id,short_code,kinds,status,dm_id,scheduled_at,document_id,signup_type,created_by) VALUES
			(31,'DMP-OPEN','{standard}','open',1,now(),21,'last_game_played',1),
			(32,'DMP-PLAYED','{standard}','played',1,now(),22,'last_game_played',1),
			(33,'DMP-PICK','{standard}','open',1,now(),23,'dm_pick',1)`,
		`INSERT INTO quests(id,short_code,kinds,status,dm_id,scheduled_at,document_id,signup_type,created_by,slots_max,filled_count) VALUES
			(34,'DMP-FULL','{standard}','full',1,now(),24,'last_game_played',1,1,1)`,
		`INSERT INTO quest_participants(quest_id,member_id,character_id,status) VALUES
			(31,2,11,'signed_up'),(31,3,12,'waitlisted'),
			(32,2,11,'signed_up'),
			(33,2,11,'signed_up'),
			(34,3,12,'signed_up')`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("SQL %s: %v", q, err)
		}
	}
	if err := goose.UpToContext(ctx, db, migrations, 9); err != nil {
		t.Fatal(err)
	}
	rows, err := db.QueryContext(ctx, `SELECT quest_id, character_id, dm_picked FROM quest_participants ORDER BY quest_id, character_id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type seat struct {
		Quest, Character int64
		DMPicked         bool
	}
	var got []seat
	for rows.Next() {
		var s seat
		if err := rows.Scan(&s.Quest, &s.Character, &s.DMPicked); err != nil {
			t.Fatal(err)
		}
		got = append(got, s)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	want := []seat{{31, 11, true}, {31, 12, false}, {32, 11, false}, {33, 11, false}, {34, 12, true}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dm_picked after 0009 = %+v, want %+v", got, want)
	}
	if err := goose.DownToContext(ctx, db, migrations, 8); err != nil {
		t.Fatal(err)
	}
	var columns int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_name = 'quest_participants' AND column_name = 'dm_picked'`).Scan(&columns); err != nil {
		t.Fatal(err)
	}
	if columns != 0 {
		t.Fatalf("dm_picked columns after down to 0008 = %d, want 0", columns)
	}
}
