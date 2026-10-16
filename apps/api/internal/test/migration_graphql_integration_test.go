//go:build integration

package test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

func p04JSON(t *testing.T, name string, dst any) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("../../cmd/api/testdata/product", name))
	if err != nil {
		t.Fatal(err)
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := d.Decode(dst); err != nil {
		t.Fatal(err)
	}
}

type p04Executor interface {
	Exec(string, ...any) (sql.Result, error)
}

func p04Exec(t *testing.T, db p04Executor, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("SQL %s: %v", q, err)
	}
}
func p04Text(t *testing.T, db *sql.DB, q string, args ...any) string {
	t.Helper()
	var v string
	if err := db.QueryRow(q, args...).Scan(&v); err != nil {
		t.Fatalf("query %s: %v", q, err)
	}
	return v
}
func p04Equal(t *testing.T, a, b any) {
	t.Helper()
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("got %#v want %#v", a, b)
	}
}
func p04Reject(t *testing.T, db p04Executor, q string) {
	t.Helper()
	if _, err := db.Exec(q); err == nil {
		t.Fatalf("expected SQL failure %s", q)
	}
}

func TestPhase3TaskP04Acceptance(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("requires fresh disposable Postgres; omit DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Minute)
	defer cancel()
	beforeContainers, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("container identities before: %s", strings.TrimSpace(string(beforeContainers)))
	c, err := postgres.Run(ctx, "postgres:16-alpine", postgres.WithDatabase("p04"), postgres.WithUsername("p04"), postgres.WithPassword("synthetic-p04"), testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned PostgreSQL container %s", c.GetContainerID())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := c.Terminate(ctx); err != nil {
			t.Errorf("cleanup owned container: %v", err)
		} else {
			t.Logf("terminated owned container %s", c.GetContainerID())
			after, err := exec.CommandContext(ctx, "docker", "ps", "-aq", "--no-trunc").Output()
			if err != nil {
				t.Error(err)
				return
			}
			t.Logf("container identities after owned cleanup: %s", strings.TrimSpace(string(after)))
			for _, id := range strings.Fields(string(beforeContainers)) {
				if !strings.Contains(string(after), id) {
					t.Errorf("preexisting container missing %s", id)
				}
			}
			if strings.Contains(string(after), c.GetContainerID()) {
				t.Error("owned PostgreSQL container remains")
			}
		}
	})
	dsn, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	serial := 0
	fresh := func(t *testing.T) {
		serial++
		s := fmt.Sprintf("p04_%d", serial)
		p04Exec(t, db, "CREATE SCHEMA "+s)
		p04Exec(t, db, "SET search_path TO "+s+",public")
		if err := goose.UpToContext(ctx, db, "../../db/migrations", 2); err != nil {
			t.Fatal(err)
		}
	}
	up := func() error { return goose.UpContext(ctx, db, "../../db/migrations") }
	down := func() error { return goose.DownContext(ctx, db, "../../db/migrations") }
	t.Run("up-down-up-object-lifetime", func(t *testing.T) {
		fresh(t)
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'roundtrip','roundtrip','Roundtrip')")
		p04Exec(t, db, "INSERT INTO documents(kind,slug,title,category,author_id) VALUES('community','roundtrip','Roundtrip','dm_table',1)")
		baseline := p04ObjectSnapshot(t, db)
		if err := up(); err != nil {
			t.Fatal(err)
		}
		first := p04ObjectSnapshot(t, db)
		if err := down(); err != nil {
			t.Fatal(err)
		}
		reverted := p04ObjectSnapshot(t, db)
		if err := up(); err != nil {
			t.Fatalf("actual Goose Up after Down: %v", err)
		}
		p04Equal(t, reverted, baseline)
		p04Equal(t, p04ObjectSnapshot(t, db), first)
		p04AssertInventory(t, db)
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM documents WHERE author_id=1 AND category='dm_table'"), "1")
		t.Log("actual Goose Up->Down->Up succeeded; baseline relation/index/function/trigger identities restored by Down; current physical inventory reverified")
	})

	t.Run("old637-purge-schema-up-down", func(t *testing.T) {
		fresh(t)
		p04LoadOld(t, db)
		before := p04Snapshot(t, db)
		if err := up(); err != nil {
			t.Fatal(err)
		}
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM unlockables"), "0")
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM member_unlocks"), "0")
		p04AssertInventory(t, db)
		after := p04Snapshot(t, db)
		checked := 0
		for table, old := range before {
			if table == "unlockables" || table == "member_unlocks" {
				continue
			}
			for _, row := range old {
				found := false
				for _, current := range after[table] {
					if p04Retained(table, row, current) {
						found = true
						break
					}
				}
				if !found {
					t.Fatalf("lost old %s row %v", table, row)
				}
				checked++
			}
		}
		p04Equal(t, checked, 623)
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM documents WHERE published_by IS NOT NULL OR deleted_by IS NOT NULL OR version<>0"), "0")
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM idempotency_keys WHERE receipt IS NOT NULL OR fingerprint IS NOT NULL OR completed_at IS NOT NULL"), "0")
		if err := down(); err != nil {
			t.Fatal(err)
		}
		after = p04Snapshot(t, db)
		for table, old := range before {
			if table == "unlockables" || table == "member_unlocks" || table == "member_settings" {
				continue
			}
			p04Equal(t, after[table], old)
		}
		t.Log("actual 69 tables/563 columns; exact 9 catalog and 5 grant purge, 623 preserved old rows, up/down executed")
	})
	var cases struct {
		Cases []struct {
			ID       string         `json:"id"`
			Fixture  map[string]any `json:"fixture"`
			Expected map[string]any `json:"expected"`
		} `json:"cases"`
	}
	p04JSON(t, "mounted-integration-repair-cases.json", &cases)
	for _, c := range cases.Cases {
		if !strings.HasPrefix(c.ID, "SETTINGS-") {
			continue
		}
		t.Run(c.ID, func(t *testing.T) {
			fresh(t)
			p04Exec(t, db, "INSERT INTO members(id,public_id,discord_id,handle,display_name) VALUES(1,$1,'m','m','Member')", c.Fixture["memberId"])
			raw, _ := json.Marshal(c.Fixture["payload"])
			stamp := c.Fixture["updated_at"]
			if stamp == nil {
				stamp = "2026-10-13T10:00:00Z"
			}
			p04Exec(t, db, "INSERT INTO member_settings(member_id,theme_mode,timezone,payload,updated_at) VALUES(1,$1,$2,$3,$4)", c.Fixture["theme_mode"], c.Fixture["timezone"], string(raw), stamp)
			before := p04Snapshot(t, db)
			err := up()
			fail := c.Expected["value"] == "PREFLIGHT_FAIL" || c.Expected["typed_theme_mode_density"] == "PREFLIGHT_FAIL"
			if fail {
				if err == nil {
					t.Fatal("expected preflight failure")
				}
				if !strings.Contains(err.Error(), "Settings member") {
					t.Fatalf("unexpected failure route: %v", err)
				}
				p04Equal(t, p04Snapshot(t, db), before)
				p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='member_settings'"), "5")
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			p04Equal(t, p04Text(t, db, "SELECT (payload=$1::jsonb)::text FROM member_settings", string(raw)), "true")
			if col, ok := c.Expected["column"].(string); ok {
				p04Equal(t, p04Text(t, db, "SELECT "+col+"::text FROM member_settings"), fmt.Sprint(c.Expected["value"]))
			}
			if v, ok := c.Expected["typed_theme_mode_density"].([]any); ok {
				p04Equal(t, p04Text(t, db, "SELECT theme||','||mode||','||density FROM member_settings"), fmt.Sprint(v[0])+","+fmt.Sprint(v[1])+","+fmt.Sprint(v[2]))
			}
			p04Equal(t, p04Text(t, db, "SELECT (updated_at=$1::timestamptz)::text FROM member_settings", stamp), "true")
			p04Equal(t, p04Text(t, db, "SELECT (timezone IS NOT DISTINCT FROM $1::text)::text FROM member_settings", c.Fixture["timezone"]), "true")
			if err := down(); err != nil {
				t.Fatal(err)
			}
			p04Equal(t, p04Text(t, db, "SELECT (payload=$1::jsonb)::text FROM member_settings", string(raw)), "true")
		})
	}
	for _, c := range cases.Cases {
		if !strings.HasPrefix(c.ID, "UNLOCK-AMBIGUOUS-") {
			continue
		}
		t.Run(c.ID, func(t *testing.T) {
			fresh(t)
			u := c.Fixture["unlockable"].(map[string]any)
			raw, _ := json.Marshal(u["payload"])
			p04Exec(t, db, "INSERT INTO unlockables(public_id,code,cosmetic_type,payload) VALUES($1,'legacy','badge',$2)", u["public_id"], string(raw))
			before := p04Snapshot(t, db)
			if err := up(); err == nil {
				t.Fatal("expected ambiguity failure")
			}
			p04Equal(t, p04Snapshot(t, db), before)
		})
	}
	t.Run("nested-ambiguity", func(t *testing.T) {
		fresh(t)
		p04Exec(t, db, `INSERT INTO unlockables(code,cosmetic_type,payload) VALUES('nested','badge','{"opaque":[{"unlockKind":"achievement"}]}')`)
		before := p04Snapshot(t, db)
		if err := up(); err == nil {
			t.Fatal("expected nested ambiguity")
		}
		p04Equal(t, p04Snapshot(t, db), before)
	})
	t.Run("D5-author-preflight", func(t *testing.T) {
		fresh(t)
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'m','m','Member')")
		p04Exec(t, db, "INSERT INTO documents(kind,slug,title,category) VALUES('community','null','Null','dm_table')")
		before := p04Snapshot(t, db)
		if err := up(); err == nil {
			t.Fatal("expected NULL author failure")
		}
		p04Equal(t, p04Snapshot(t, db), before)
		p04Exec(t, db, "UPDATE documents SET author_id=1")
		p04Exec(t, db, "INSERT INTO documents(kind,slug,title,category,author_id) VALUES('community','dup','Duplicate','dm_table',1)")
		before = p04Snapshot(t, db)
		if err := up(); err == nil {
			t.Fatal("expected duplicate failure")
		}
		p04Equal(t, p04Snapshot(t, db), before)
		p04Exec(t, db, "UPDATE documents SET deleted_at=now() WHERE slug='dup'")
		if err := up(); err != nil {
			t.Fatal(err)
		}
		p04Reject(t, db, "UPDATE documents SET deleted_at=NULL WHERE slug='dup'")
	})
	t.Run("all-physical-shapes-typed-links-receipt-commit", func(t *testing.T) {
		fresh(t)
		p04LoadOld(t, db)
		if err := up(); err != nil {
			t.Fatal(err)
		}
		p04Physical(t, db)
		if err := down(); err == nil {
			t.Fatal("down accepted new catalog loss")
		}
		fresh(t)
		if err := up(); err != nil {
			t.Fatal(err)
		}
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'p04','p04','Member')")
		p04Exec(t, db, "INSERT INTO documents(id,public_id,kind,slug,title,author_id) VALUES(124,'10000000-0000-4000-8000-000000000010','community','p04-source','Source',1)")
		p04Typed(t, db)
		before := p04Snapshot(t, db)
		if err := down(); err == nil {
			t.Fatal("down accepted typed link loss")
		}
		p04Equal(t, p04Snapshot(t, db), before)
		p04Exec(t, db, "DELETE FROM document_links WHERE target_type<>'document'")
		if err := down(); err == nil {
			t.Fatal("down accepted product receipt loss")
		}
		p04Exec(t, db, "DELETE FROM idempotency_keys WHERE endpoint LIKE 'graphql:%'")
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(2,'other','other','Other')")
		p04Exec(t, db, "INSERT INTO idempotency_keys(endpoint,key,actor_id) VALUES('legacy','same',1),('legacy','same',2)")
		if err := down(); err == nil {
			t.Fatal("down collapsed cross-actor reservations")
		}
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM idempotency_keys WHERE endpoint='legacy'"), "2")
		p04Exec(t, db, "DELETE FROM idempotency_keys WHERE actor_id=2")
		if err := down(); err != nil {
			t.Fatal(err)
		}
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM document_links WHERE source_id=124 AND target_id=123"), "1")
	})
	t.Run("D5-concurrent-slot", func(t *testing.T) {
		fresh(t)
		if err := up(); err != nil {
			t.Fatal(err)
		}
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'race','race','Race')")
		schema := p04Text(t, db, "SELECT current_schema()")
		other, err := sql.Open("pgx", dsn)
		if err != nil {
			t.Fatal(err)
		}
		defer other.Close()
		other.SetMaxOpenConns(1)
		p04Exec(t, other, "SET search_path TO "+schema+",public")
		tx, err := db.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		p04Exec(t, tx, "INSERT INTO documents(kind,slug,title,category,author_id) VALUES('community','winner','Winner','dm_table',1)")
		result := make(chan error, 1)
		go func() {
			ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			_, err := other.ExecContext(ctx, "INSERT INTO documents(kind,slug,title,category,author_id) VALUES('community','loser','Loser','dm_table',1)")
			result <- err
		}()
		select {
		case err := <-result:
			t.Fatalf("second insert did not wait for winner: %v", err)
		case <-time.After(100 * time.Millisecond):
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		if err := <-result; err == nil || !strings.Contains(err.Error(), "uq_documents_dm_table_per_member") {
			t.Fatalf("expected named slot conflict, got %v", err)
		}
		p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM documents WHERE author_id=1"), "1")
	})
	t.Run("review-counterexamples", func(t *testing.T) {
		for _, tc := range []struct {
			name       string
			statements []string
		}{
			{"unlock-nullability-drift", []string{"ALTER TABLE unlockables ALTER COLUMN cosmetic_type DROP NOT NULL", "INSERT INTO unlockables(code,cosmetic_type,payload) VALUES('unknown',NULL,'{}')"}},
			{"unlock-orphan-grant", []string{"INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'orphan','orphan','Orphan')", "ALTER TABLE member_unlocks DROP CONSTRAINT member_unlocks_unlockable_id_fkey", "INSERT INTO member_unlocks(member_id,unlockable_id,source) VALUES(1,999999,'grant')", "ALTER TABLE member_unlocks ADD CONSTRAINT member_unlocks_unlockable_id_fkey FOREIGN KEY(unlockable_id) REFERENCES unlockables(id) NOT VALID"}},
			{"unlock-unvalidated-resolved-grant", []string{"INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'resolved','resolved','Resolved')", "INSERT INTO unlockables(id,code,cosmetic_type,payload) VALUES(1,'badge','badge','{}')", "INSERT INTO member_unlocks(member_id,unlockable_id,source) VALUES(1,1,'grant')", "ALTER TABLE member_unlocks DROP CONSTRAINT member_unlocks_unlockable_id_fkey", "ALTER TABLE member_unlocks ADD CONSTRAINT member_unlocks_unlockable_id_fkey FOREIGN KEY(unlockable_id) REFERENCES unlockables(id) NOT VALID"}},
			{"unlock-payload-type-drift", []string{"ALTER TABLE unlockables ALTER COLUMN payload TYPE JSON USING payload::json", "INSERT INTO unlockables(code,cosmetic_type,payload) VALUES('badge','badge','{}')"}},
			{"unlock-check-definition-drift", []string{"ALTER TABLE unlockables DROP CONSTRAINT unlockables_cosmetic_type_check", "ALTER TABLE unlockables ADD CONSTRAINT unlockables_cosmetic_type_check CHECK(cosmetic_type IN ('theme','palette','font','flair','title','badge','frame','nameplate','token') OR true)", "INSERT INTO unlockables(code,cosmetic_type,payload) VALUES('badge','badge','{}')"}},
			{"grant-nullability-drift", []string{"ALTER TABLE member_unlocks ALTER COLUMN source DROP NOT NULL"}},
			{"grant-fk-definition-drift", []string{"ALTER TABLE member_unlocks DROP CONSTRAINT member_unlocks_unlockable_id_fkey", "ALTER TABLE member_unlocks ADD CONSTRAINT member_unlocks_unlockable_id_fkey FOREIGN KEY(unlockable_id) REFERENCES unlockables(id) ON DELETE CASCADE"}},
		} {
			t.Run(tc.name, func(t *testing.T) {
				fresh(t)
				for _, q := range tc.statements {
					p04Exec(t, db, q)
				}
				before, shape := p04Snapshot(t, db), p04SchemaSnapshot(t, db)
				err := up()
				if err == nil {
					t.Fatal("unexpected destructive migration success")
				}
				p04Equal(t, p04Snapshot(t, db), before)
				p04Equal(t, p04SchemaSnapshot(t, db), shape)
			})
		}
		t.Run("nonnull-json-receipt", func(t *testing.T) {
			fresh(t)
			if err := up(); err != nil {
				t.Fatal(err)
			}
			p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'receipt','receipt','Receipt')")
			for _, tc := range []struct{ name, fp, receipt, completed string }{
				{"json-null", "repeat('a',64)", "'null'::jsonb", "now()"},
				{"sql-null", "repeat('a',64)", "NULL", "now()"},
				{"missing-completion", "repeat('a',64)", "'{}'::jsonb", "NULL"},
				{"malformed-fingerprint", "'BAD'", "'{}'::jsonb", "now()"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					tx, err := db.Begin()
					if err != nil {
						t.Fatal(err)
					}
					defer tx.Rollback()
					p04Exec(t, tx, "INSERT INTO idempotency_keys(endpoint,key,actor_id,fingerprint,receipt,completed_at) VALUES('graphql:review',$1,1,"+tc.fp+","+tc.receipt+","+tc.completed+")", tc.name)
					if err := tx.Commit(); err == nil {
						t.Fatal("invalid completed product receipt committed")
					}
					p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM idempotency_keys WHERE endpoint='graphql:review' AND key=$1", tc.name), "0")
				})
			}
			p04Exec(t, db, "INSERT INTO idempotency_keys(endpoint,key,actor_id) VALUES('legacy','legacy',1)")
			p04Exec(t, db, "INSERT INTO idempotency_keys(endpoint,key,actor_id,fingerprint,receipt,completed_at) VALUES('graphql:review','array',1,repeat('a',64),'[]'::jsonb,now())")
			p04Equal(t, p04Text(t, db, "SELECT receipt::text FROM idempotency_keys WHERE key='array'"), "[]")
			p04Equal(t, p04Text(t, db, "SELECT (fingerprint IS NULL AND receipt IS NULL AND completed_at IS NULL)::text FROM idempotency_keys WHERE key='legacy'"), "true")
		})
	})

	t.Run("purge-effect-admission", func(t *testing.T) {
		for _, tc := range []struct{ name, ddl string }{
			{"incoming-grant-cascade", `CREATE TABLE preserved_annotations(member_id BIGINT,unlockable_id BIGINT,note TEXT,FOREIGN KEY(member_id,unlockable_id) REFERENCES member_unlocks(member_id,unlockable_id) ON DELETE CASCADE); INSERT INTO preserved_annotations SELECT member_id,unlockable_id,'Keep grant annotation' FROM member_unlocks ORDER BY member_id,unlockable_id LIMIT 1`},
			{"incoming-catalog-cascade", `CREATE TABLE preserved_annotations(unlockable_id BIGINT REFERENCES unlockables(id) ON DELETE CASCADE,note TEXT); INSERT INTO preserved_annotations SELECT id,'Keep catalog annotation' FROM unlockables ORDER BY id LIMIT 1`},
			{"trigger-member_unlocks", `CREATE FUNCTION p04_preserved_settings_hook() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM member_settings; RETURN OLD; END $$; CREATE TRIGGER p04_delete_settings AFTER DELETE ON member_unlocks FOR EACH ROW EXECUTE FUNCTION p04_preserved_settings_hook()`},
			{"trigger-unlockables", `CREATE FUNCTION p04_preserved_settings_hook() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM member_settings; RETURN OLD; END $$; CREATE TRIGGER p04_delete_settings AFTER DELETE ON unlockables FOR EACH ROW EXECUTE FUNCTION p04_preserved_settings_hook()`},
			{"rule-member_unlocks", `CREATE RULE p04_delete_settings AS ON DELETE TO member_unlocks DO ALSO DELETE FROM member_settings`},
			{"rule-unlockables", `CREATE RULE p04_delete_settings AS ON DELETE TO unlockables DO ALSO DELETE FROM member_settings`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				fresh(t)
				p04LoadOld(t, db)
				p04Exec(t, db, tc.ddl)
				before, shape := p04Snapshot(t, db), p04SchemaSnapshot(t, db)
				settings := p04Text(t, db, "SELECT count(*)::text FROM member_settings")
				err := up()
				if err == nil {
					t.Fatalf("unexpected purge success: preserved settings before=%s after=%s; annotations=%v", settings, p04Text(t, db, "SELECT count(*)::text FROM member_settings"), p04Snapshot(t, db)["preserved_annotations"])
				}
				if !strings.Contains(err.Error(), "Unexpected unlock purge") {
					t.Fatalf("wrong admission failure: %v", err)
				}
				p04Equal(t, p04Snapshot(t, db), before)
				p04Equal(t, p04SchemaSnapshot(t, db), shape)
				p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM member_settings"), settings)
			})
		}
	})

	t.Run("purge-effect-locking", func(t *testing.T) {
		for _, tc := range []struct{ name, ddl string }{
			{"incoming-grant-fk", `ALTER TABLE preserved_annotations ADD FOREIGN KEY(member_id,unlockable_id) REFERENCES member_unlocks(member_id,unlockable_id) ON DELETE CASCADE`},
			{"incoming-catalog-fk", `ALTER TABLE preserved_annotations ADD FOREIGN KEY(unlockable_id) REFERENCES unlockables(id) ON DELETE CASCADE`},
			{"trigger-member_unlocks", `CREATE TRIGGER p04_blocked_hook AFTER DELETE ON member_unlocks FOR EACH ROW EXECUTE FUNCTION p04_lock_hook()`},
			{"trigger-unlockables", `CREATE TRIGGER p04_blocked_hook AFTER DELETE ON unlockables FOR EACH ROW EXECUTE FUNCTION p04_lock_hook()`},
			{"rule-member_unlocks", `CREATE RULE p04_blocked_rule AS ON DELETE TO member_unlocks DO ALSO DELETE FROM member_settings WHERE false`},
			{"rule-unlockables", `CREATE RULE p04_blocked_rule AS ON DELETE TO unlockables DO ALSO DELETE FROM member_settings WHERE false`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				fresh(t)
				p04Exec(t, db, "CREATE TABLE preserved_annotations(member_id BIGINT,unlockable_id BIGINT)")
				p04Exec(t, db, `CREATE FUNCTION p04_lock_hook() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$`)
				schema := p04Text(t, db, "SELECT current_schema()")
				other, err := sql.Open("pgx", dsn)
				if err != nil {
					t.Fatal(err)
				}
				defer other.Close()
				other.SetMaxOpenConns(1)
				p04Exec(t, other, "SET search_path TO "+schema+",public")
				pid := p04Text(t, other, "SELECT pg_backend_pid()::text")
				tx, err := db.Begin()
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback()
				p04Exec(t, tx, "LOCK TABLE unlockables,member_unlocks IN ACCESS EXCLUSIVE MODE")
				result := make(chan error, 1)
				go func() {
					ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
					defer cancel()
					_, err := other.ExecContext(ctx, tc.ddl)
					result <- err
				}()
				deadline := time.Now().Add(2 * time.Second)
				pending := ""
				for pending == "" && time.Now().Before(deadline) {
					if err := tx.QueryRow(`SELECT coalesce(string_agg(mode,','),'') FROM pg_locks WHERE pid=$1::integer AND relation IN ('unlockables'::regclass,'member_unlocks'::regclass) AND NOT granted`, pid).Scan(&pending); err != nil {
						t.Fatal(err)
					}
					if pending == "" {
						select {
						case err := <-result:
							t.Fatalf("DDL escaped purge lock: %v", err)
						case <-time.After(10 * time.Millisecond):
						}
					}
				}
				if pending == "" {
					t.Fatal("did not observe native DDL lock wait")
				}
				t.Logf("native %s waits on %s while purge lock is held", tc.name, pending)
				if err := tx.Rollback(); err != nil {
					t.Fatal(err)
				}
				if err := <-result; err != nil {
					t.Fatalf("DDL failed after purge lock release: %v", err)
				}
			})
		}
	})

	t.Run("unexpected-shape-and-reserved-namespace", func(t *testing.T) {
		fresh(t)
		p04Exec(t, db, "ALTER TABLE document_links ADD COLUMN unexpected TEXT")
		before := p04Snapshot(t, db)
		if err := up(); err == nil || !strings.Contains(err.Error(), "Unexpected document_links shape") {
			t.Fatalf("expected shape preflight, got %v", err)
		}
		p04Equal(t, p04Snapshot(t, db), before)
		p04Exec(t, db, "ALTER TABLE document_links DROP COLUMN unexpected")
		p04Exec(t, db, "INSERT INTO members(id,discord_id,handle,display_name) VALUES(1,'legacy','legacy','Legacy')")
		p04Exec(t, db, "INSERT INTO idempotency_keys(endpoint,key,actor_id) VALUES('graphql:occupied','key',1)")
		before = p04Snapshot(t, db)
		if err := up(); err == nil || !strings.Contains(err.Error(), "Reserved graphql receipt namespace") {
			t.Fatalf("expected namespace preflight, got %v", err)
		}
		p04Equal(t, p04Snapshot(t, db), before)
	})
}

type p04Spec struct {
	Table string         `json:"table"`
	Row   map[string]any `json:"row"`
	Refs  map[string]struct {
		Table    string         `json:"table"`
		PublicID string         `json:"public_id"`
		Key      map[string]any `json:"key"`
	} `json:"refs"`
}

func p04LoadOld(t *testing.T, db *sql.DB) {
	t.Helper()
	var m struct {
		SHA string `json:"old_source_sha256"`
	}
	p04JSON(t, "qa-catalog-purge-fixture.json", &m)
	raw, err := os.ReadFile("../../cmd/api/testdata/product/qa-v2-2026-10-14.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(raw)
	p04Equal(t, hex.EncodeToString(hash[:]), m.SHA)
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 4096), 4<<20)
	count := 0
	for scanner.Scan() {
		raw := scanner.Bytes()
		if len(raw) == 0 || raw[0] == '#' {
			continue
		}
		var s p04Spec
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&s); err != nil {
			t.Fatal(err)
		}
		for col, ref := range s.Refs {
			key := "public_id"
			v := any(ref.PublicID)
			if ref.PublicID == "" {
				for k, value := range ref.Key {
					key = k
					v = value
				}
			}
			s.Row[col] = p04Text(t, db, "SELECT id::text FROM "+ref.Table+" WHERE "+key+"=$1", v)
		}
		var cols, params []string
		var values []any
		for col, value := range s.Row {
			cols = append(cols, col)
			values = append(values, p04Value(value))
			params = append(params, fmt.Sprintf("$%d", len(values)))
		}
		p04Exec(t, db, "INSERT INTO "+s.Table+" ("+strings.Join(cols, ",")+") VALUES ("+strings.Join(params, ",")+")", values...)
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	p04Equal(t, count, 637)
}
func p04Value(v any) any {
	switch x := v.(type) {
	case map[string]any:
		raw, _ := json.Marshal(x)
		return string(raw)
	case []any:
		if len(x) > 0 {
			if _, ok := x[0].(string); ok {
				var values []string
				for _, v := range x {
					values = append(values, fmt.Sprint(v))
				}
				return "{" + strings.Join(values, ",") + "}"
			}
		}
		raw, _ := json.Marshal(x)
		return string(raw)
	case json.Number:
		return x.String()
	default:
		return v
	}
}
func p04Snapshot(t *testing.T, db *sql.DB) map[string][]map[string]any {
	t.Helper()
	rows, err := db.Query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename<>'goose_db_version' ORDER BY tablename")
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, table)
	}
	rows.Close()
	result := map[string][]map[string]any{}
	for _, table := range tables {
		raw := p04Text(t, db, "SELECT coalesce(jsonb_agg(row ORDER BY row::text),'[]')::text FROM (SELECT to_jsonb(t) AS row FROM "+table+" t) x")
		var value []map[string]any
		dec := json.NewDecoder(strings.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&value); err != nil {
			t.Fatal(err)
		}
		result[table] = value
	}
	return result
}
func p04Retained(table string, old, current map[string]any) bool {
	for key, v := range old {
		if table == "member_settings" && key == "theme_mode" {
			continue
		}
		if table == "document_links" && key == "target_id" {
			key = "document_target_id"
		}
		if !reflect.DeepEqual(v, current[key]) {
			return false
		}
	}
	return true
}

func p04Physical(t *testing.T, db *sql.DB) {
	t.Helper()
	id := func(table string) string { return p04Text(t, db, "SELECT min(id)::text FROM "+table) }
	m, ch, q, r, d, mp := id("members"), id("characters"), id("quests"), id("regions"), id("documents"), id("maps")
	statements := []string{
		fmt.Sprintf("INSERT INTO character_catalog_picks VALUES(%s,%s)", ch, id("creation_catalog")),
		fmt.Sprintf("INSERT INTO assignment_changes(actor_id,assignment_kind,created_at,member_id,region_id) VALUES(%s,'archon',now(),%s,%s)", m, m, r),
		fmt.Sprintf("INSERT INTO quest_changes(actor_id,created_at,facts,kind,quest_id) VALUES(%s,now(),'{}','CLOSE',%s)", m, q),
		fmt.Sprintf("INSERT INTO region_changes(actor_id,created_at,kind,region_id) VALUES(%s,now(),'UPDATE',%s)", m, r),
		fmt.Sprintf("INSERT INTO pointcrawl_nodes(id,created_at,map_id,name,x,y) VALUES(5001,now(),%s,'A',1,2),(5002,now(),%s,'B',3,4)", mp, mp),
		fmt.Sprintf("INSERT INTO pointcrawl_edges(directed,kind,map_id,node_a,node_b) VALUES(false,'path',%s,5001,5002)", mp),
		fmt.Sprintf("INSERT INTO pointcrawl_entry_links(created_at,created_by,document_id,map_id,node_id,relation) VALUES(now(),%s,%s,%s,5001,'location')", m, d, mp),
		fmt.Sprintf("INSERT INTO pointcrawl_node_changes(actor_id,created_at,kind,node_id) VALUES(%s,now(),'UPDATE',5001)", m),
		fmt.Sprintf("INSERT INTO time_anchor_changes(actor_id,anchor_id,created_at,new_value) VALUES(%s,%s,now(),'{}')", m, id("time_anchors")),
		fmt.Sprintf("INSERT INTO notification_events(id,actor_id,created_at,event_key,facts,kind,subject_public_id,subject_type) VALUES(5001,%s,now(),'p04:event','{}','document','10000000-0000-4000-8000-000000000010','document')", m),
		fmt.Sprintf("INSERT INTO notification_channel_deliveries(event_id,member_id,channel,state,delivered_at) VALUES(5001,%s,'in_app','delivered',now())", m),
		fmt.Sprintf("INSERT INTO character_ddb_attempts(character_id,started_at,url) VALUES(%s,now(),'https://example.test/character')", ch),
		fmt.Sprintf("INSERT INTO job_redrives(actor_id,created_at,job_id,reason) VALUES(%s,now(),%s,'P04 test')", m, id("background_jobs")),
		"INSERT INTO operational_observations(key,observed_at,payload,state) VALUES('probe:p04',now(),'{}','OK')",
		fmt.Sprintf("INSERT INTO quest_reward_entitlements(awarded_at,awarded_by,character_id,pcxp,quest_id) VALUES(now(),%s,%s,1,%s)", m, ch, q),
		fmt.Sprintf("INSERT INTO request_decisions(actor_id,decision,recorded_at,request_id) VALUES(%s,'accepted',now(),%s)", m, id("dm_requests")),
		fmt.Sprintf("INSERT INTO quest_reward_decisions(closure_change_id,decided_at,decided_by,quest_id) SELECT id,now(),%s,%s FROM quest_changes LIMIT 1", m, q),
		fmt.Sprintf("INSERT INTO auth_override_audit(actor_id,operation,recorded_at,rule_code,subject_public_id,subject_type) VALUES(%s,'editPublishedDocument',now(),'AUDIENCE','10000000-0000-4000-8000-000000000010','document')", m),
		fmt.Sprintf("INSERT INTO character_changes(affected_public_id,affected_type,character_id,kind,recorded_at,recorded_by) VALUES('10000000-0000-4000-8000-000000000030','character',%s,'UPDATE',now(),%s)", ch, m),
		"INSERT INTO unlockables(kind,name,code,payload) VALUES('achievement','Bridge keeper','p04-achievement','{}'),('dm_tier','DM tier','p04-tier','{}')",
		fmt.Sprintf("INSERT INTO member_unlocks(member_id,unlockable_id,source,granted_by,note) SELECT %s,id,'grant',%s,'P04 grant' FROM unlockables LIMIT 1", m, m),
		fmt.Sprintf("INSERT INTO site_setting_changes(actor_id,created_at,new_value,setting_key) VALUES(%s,now(),'{}','p04')", m),
		fmt.Sprintf("INSERT INTO calendar_changes(actor_id,calendar_id,created_at,new_value) VALUES(%s,1,now(),'{}')", m),
		fmt.Sprintf("INSERT INTO arc_changes(actor_id,arc_id,created_at,new_value) VALUES(%s,%s,now(),'{}')", m, id("quest_arcs")),
		fmt.Sprintf("INSERT INTO map_changes(actor_id,affected_public_id,affected_type,map_id,recorded_at) VALUES(%s,'10000000-0000-4000-8000-000000000024','map',%s,now())", m, mp),
	}
	for _, s := range statements {
		p04Exec(t, db, s)
	}
	p04Reject(t, db, "UPDATE hexes SET submap_id=999999 WHERE id=(SELECT min(id) FROM hexes)")
	for table, rows := range p04Snapshot(t, db) {
		if len(rows) == 0 {
			t.Errorf("physical table %s empty", table)
		}
	}
}

func p04Typed(t *testing.T, db *sql.DB) {
	t.Helper()
	m, d := "1", "124"
	var fixture struct {
		Cases []struct {
			ID      string `json:"id"`
			Fixture struct {
				Source  string `json:"sourceDocument"`
				Targets []struct {
					Type     string `json:"type"`
					UUID     string `json:"uuid"`
					Physical string `json:"physical"`
				} `json:"targets"`
			} `json:"fixture"`
		} `json:"cases"`
	}
	p04JSON(t, "mounted-integration-repair-cases.json", &fixture)
	var expectedTargets map[string]string
	for _, c := range fixture.Cases {
		if c.ID == "LINK-EXCLUSIVE-ARC-FOUR-TYPES" {
			p04Equal(t, p04Text(t, db, "SELECT public_id::text FROM documents WHERE id=124"), c.Fixture.Source)
			expectedTargets = map[string]string{}
			for _, target := range c.Fixture.Targets {
				expectedTargets[target.Type] = target.UUID
				p04Equal(t, target.Physical, target.Type+"_target_id")
			}
		}
	}
	p04Equal(t, len(expectedTargets), 4)
	p04Exec(t, db, "INSERT INTO documents(id,public_id,kind,slug,title,author_id) VALUES(123,'10000000-0000-4000-8000-000000000015','community','p04-target','Target',$1)", m)
	p04Exec(t, db, "INSERT INTO regions(id,public_id,name,kind) VALUES(123,'10000000-0000-4000-8000-000000000020','P04 region','uncharted')")
	p04Exec(t, db, "INSERT INTO characters(id,public_id,short_code,owner_id,name) VALUES(123,'10000000-0000-4000-8000-000000000030','P04-C',$1,'P04 character')", m)
	p04Exec(t, db, "INSERT INTO quests(id,public_id,short_code,kinds,dm_id,scheduled_at,document_id,created_by) VALUES(123,'10000000-0000-4000-8000-000000000051','P04-Q','{standard}',$1,now(),123,$1)", m)
	for _, kind := range []string{"document", "quest", "character", "region"} {
		p04Exec(t, db, "INSERT INTO document_links(source_id,"+kind+"_target_id,relation) VALUES($1,123,'subject')", d)
	}
	p04Equal(t, p04Text(t, db, "SELECT string_agg(target_type||':'||target_id,',' ORDER BY target_type) FROM document_links WHERE source_id=$1 AND relation='subject' AND target_id=123", d), "character:123,document:123,quest:123,region:123")
	for _, s := range []string{"INSERT INTO document_links(source_id,relation) VALUES(" + d + ",'zero')", "INSERT INTO document_links(source_id,document_target_id,quest_target_id,relation) VALUES(" + d + ",123,123,'two')", "INSERT INTO document_links(source_id,quest_target_id,relation) VALUES(" + d + ",999999,'missing')", "INSERT INTO document_links(source_id,quest_target_id,relation) VALUES(" + d + ",123,'subject')", "DELETE FROM quests WHERE id=123", "UPDATE documents SET published_by=999999 WHERE id=123", "INSERT INTO unlockables(kind,name,code) VALUES('ACHIEVEMENT','Bad','bad')"} {
		p04Reject(t, db, s)
	}
	for _, kind := range []string{"document", "quest", "character", "region"} {
		table := map[string]string{"document": "documents", "quest": "quests", "character": "characters", "region": "regions"}[kind]
		p04Equal(t, p04Text(t, db, "SELECT t.public_id::text FROM document_links l JOIN "+table+" t ON t.id=l."+kind+"_target_id WHERE l.source_id=124 AND l.target_type=$1", kind), expectedTargets[kind])
	}
	p04Exec(t, db, "UPDATE quests SET deleted_at=now() WHERE id=123")
	p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM document_links WHERE quest_target_id=123"), "1")
	p04Exec(t, db, "UPDATE documents SET published_by=$1,deleted_by=$1 WHERE id=123", m)
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	p04Exec(t, tx, "INSERT INTO idempotency_keys(endpoint,key,actor_id) VALUES('graphql:p04','incomplete',$1)", m)
	if err := tx.Commit(); err == nil {
		t.Fatal("incomplete product receipt committed")
	}
	p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM idempotency_keys WHERE key='incomplete'"), "0")
	tx, err = db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	p04Exec(t, tx, "INSERT INTO idempotency_keys(endpoint,key,actor_id) VALUES('graphql:p04','complete',$1)", m)
	p04Exec(t, tx, "UPDATE idempotency_keys SET fingerprint=repeat('a',64),receipt='{}',completed_at=now() WHERE endpoint='graphql:p04' AND key='complete'")
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	p04Equal(t, p04Text(t, db, "SELECT count(*)::text FROM idempotency_keys WHERE key='complete'"), "1")

	t.Log("generated typed projections, missing/duplicate/zero/two targets, tombstones, provenance FKs, and deferred receipt commit executed")
}

func p04SchemaSnapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	return p04Text(t, db, `SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=current_schema() AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal),
 'rules',(SELECT jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_get_ruledef(r.oid),r.ev_enabled) ORDER BY c.relname,r.rulename) FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()),
 'functions',(SELECT jsonb_agg(pg_get_functiondef(f.oid) ORDER BY f.proname,f.oid) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname=current_schema() AND f.prokind='f'))::text`)
}

func p04AssertInventory(t *testing.T, db *sql.DB) {
	t.Helper()
	var inventory struct {
		Tables map[string]struct {
			Columns map[string]struct {
				Declaration string `json:"declaration"`
			} `json:"columns"`
			BaselineDDL string `json:"baseline_ddl"`
		} `json:"final_tables"`
	}
	p04JSON(t, "physical-schema-inventory.json", &inventory)
	type column struct {
		oid                 int64
		sqlType             string
		typmod              int
		notNull             bool
		identity, generated string
		defaultValue        sql.NullString
		unique, check       bool
	}
	rows, err := db.Query(`SELECT c.relname,a.attname,a.atttypid::bigint,format_type(a.atttypid,a.atttypmod),a.atttypmod,a.attnotnull,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid),
 EXISTS(SELECT FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN ('u','p') AND k.conkey=ARRAY[a.attnum] AND k.convalidated),
 EXISTS(SELECT FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='c' AND a.attnum=ANY(k.conkey) AND k.convalidated)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname<>'goose_db_version' AND a.attnum>0 AND NOT a.attisdropped`)
	if err != nil {
		t.Fatal(err)
	}
	actual := map[string]map[string]column{}
	for rows.Next() {
		var table, name string
		var c column
		if err := rows.Scan(&table, &name, &c.oid, &c.sqlType, &c.typmod, &c.notNull, &c.identity, &c.generated, &c.defaultValue, &c.unique, &c.check); err != nil {
			t.Fatal(err)
		}
		if actual[table] == nil {
			actual[table] = map[string]column{}
		}
		actual[table][name] = c
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	rows.Close()
	p04Equal(t, len(actual), 69)
	typePattern := regexp.MustCompile(`^(BIGINT|SMALLINT|INTEGER|INT|DOUBLE PRECISION|JSONB|BOOLEAN|DATE|TIMESTAMPTZ|TEXT\[\]|TEXT|UUID)(?:\s|$)`)
	pkPattern := regexp.MustCompile(`PRIMARY KEY \(([^)]+)\)`)
	fkPattern := regexp.MustCompile(`REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)`)
	defaultPattern := regexp.MustCompile(`(?i)DEFAULT\s+(now\(\)|gen_random_uuid\(\)|'(?:[^']|'')*'|true|false|[0-9]+)`)
	extraPK := map[string][]string{"document_links": {"source_id", "target_type", "target_id", "relation"}, "idempotency_keys": {"endpoint", "actor_id", "key"}, "character_catalog_picks": {"character_id", "catalog_id"}, "pointcrawl_entry_links": {"node_id", "document_id", "relation"}, "notification_channel_deliveries": {"event_id", "member_id", "channel"}, "quest_reward_decisions": {"quest_id"}}
	count := 0
	for table, shape := range inventory.Tables {
		p04Equal(t, len(actual[table]), len(shape.Columns))
		var pk []string
		if m := pkPattern.FindStringSubmatch(shape.BaselineDDL); m != nil {
			for _, c := range strings.Split(m[1], ",") {
				pk = append(pk, strings.TrimSpace(c))
			}
		}
		for name, spec := range shape.Columns {
			if strings.Contains(spec.Declaration, "PRIMARY KEY") {
				pk = []string{name}
			}
		}
		if keys, ok := extraPK[table]; ok {
			pk = keys
		}
		p04Equal(t, p04Text(t, db, `SELECT coalesce(string_agg(a.attname,',' ORDER BY k.ordinality),'') FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=to_regclass($1) AND c.contype='p'`, table), strings.Join(pk, ","))
		for name, spec := range shape.Columns {
			c, ok := actual[table][name]
			if !ok {
				t.Fatalf("missing %s.%s", table, name)
			}
			count++
			declaredType := ""
			if m := typePattern.FindStringSubmatch(spec.Declaration); m != nil {
				declaredType = m[1]
			} else if table == "document_links" && name == "target_id" {
				declaredType = "bigint"
			} else if table == "document_links" && name == "target_type" {
				declaredType = "text"
			} else {
				t.Fatalf("undeclared type %s.%s: %s", table, name, spec.Declaration)
			}
			expectedOID := p04Text(t, db, "SELECT to_regtype($1)::oid::text", declaredType)
			if fmt.Sprint(c.oid) != expectedOID || c.typmod != -1 {
				t.Fatalf("physical type %s.%s: got %s, want %s", table, name, c.sqlType, declaredType)
			}
			notNull := strings.Contains(spec.Declaration, "NOT NULL")
			for _, key := range pk {
				if key == name {
					notNull = true
				}
			}
			if c.notNull != notNull {
				t.Fatalf("physical nullability %s.%s: got not-null=%v want %v", table, name, c.notNull, notNull)
			}
			identity := ""
			if strings.Contains(spec.Declaration, "GENERATED BY DEFAULT AS IDENTITY") {
				identity = "d"
			}
			if c.identity != identity {
				t.Fatalf("physical identity %s.%s: got %q want %q", table, name, c.identity, identity)
			}
			generated := ""
			if table == "document_links" && (name == "target_id" || name == "target_type") {
				generated = "s"
			}
			if c.generated != generated {
				t.Fatalf("physical generation %s.%s: got %q want %q", table, name, c.generated, generated)
			}
			if generated != "" {
				if !c.defaultValue.Valid {
					t.Fatalf("missing stored generated expression %s.%s", table, name)
				}
			} else if m := defaultPattern.FindStringSubmatch(spec.Declaration); m != nil {
				normalize := func(v string) string { return strings.Trim(strings.TrimSpace(strings.Split(v, "::")[0]), "'()") }
				gotDefault, wantDefault := normalize(c.defaultValue.String), normalize(m[1])
				if declaredType == "BOOLEAN" {
					gotDefault, wantDefault = strings.ToLower(gotDefault), strings.ToLower(wantDefault)
				}
				if !c.defaultValue.Valid || gotDefault != wantDefault {
					t.Fatalf("physical default %s.%s: got %v want %s", table, name, c.defaultValue, m[1])
				}
			} else if c.defaultValue.Valid {
				t.Fatalf("undeclared default %s.%s: %s", table, name, c.defaultValue.String)
			}
			if strings.Contains(spec.Declaration, "UNIQUE") && !c.unique {
				t.Fatalf("missing physical unique %s.%s", table, name)
			}
			if strings.Contains(spec.Declaration, "CHECK") && !c.check {
				t.Fatalf("missing validated physical check %s.%s", table, name)
			}
			if m := fkPattern.FindStringSubmatch(spec.Declaration); m != nil {
				action := "a"
				if strings.Contains(spec.Declaration, "ON DELETE CASCADE") {
					action = "c"
				}
				if strings.Contains(spec.Declaration, "ON DELETE SET NULL") {
					action = "n"
				}
				if table == "document_links" {
					if name == "document_target_id" || name == "source_id" {
						action = "c"
					} else {
						action = "r"
					}
				}
				got := p04Text(t, db, `SELECT EXISTS(SELECT FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attname=$2 JOIN pg_attribute target ON target.attrelid=k.confrelid AND target.attname=$4 WHERE k.conrelid=to_regclass($1) AND k.contype='f' AND k.conkey=ARRAY[a.attnum] AND k.confrelid=to_regclass($3) AND k.confkey=ARRAY[target.attnum] AND k.confdeltype::text=$5 AND k.convalidated AND NOT k.condeferrable)::text`, table, name, m[1], m[2], action)
				if got != "true" {
					t.Fatalf("missing validated physical FK %s.%s -> %s.%s action %s", table, name, m[1], m[2], action)
				}
			}
		}
	}
	p04Equal(t, count, 563)
	t.Log("native inventory matched69 tables/563 columns with PostgreSQL types, nullability, PK, UNIQUE, identity, defaults, generated columns, validated CHECK presence and exact FK targets/actions")
}

func p04ObjectSnapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	return p04Text(t, db, `SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=current_schema()),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid)) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema()),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal))::text`)
}
