// Command seedqa loads apps/api/db/seed/qa.jsonl into Postgres.
//
// Each line is one row. Foreign keys are public_id references, never bigint ids.
// Re-running is safe: rows use ON CONFLICT DO NOTHING.
// A members ref may set "platform_owner" instead of public_id; it resolves
// through PLATFORM_OWNER_DISCORD_ID at load time, so the ID never sits in a fixture.
//
//	DATABASE_URL=postgres://... go run ./cmd/seedqa
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	file := flag.String("file", "db/seed/qa.jsonl", "JSONL fixture path")
	migrations := flag.String("migrations", "db/migrations", "goose migration directory")
	write := flag.Bool("write", false, "rewrite -file from the built-in QA world and exit")
	checkOnly := flag.Bool("check", false, "check database availability and schema version, then exit")
	flag.Parse()

	if *write {
		if err := writeQA(*file); err != nil {
			fmt.Fprintf(os.Stderr, "write: %v\n", err)
			os.Exit(1)
		}
		return
	}

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://chronicler:chronicler@127.0.0.1:5432/chronicler?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := checkDatabase(ctx, pool, *migrations); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	if *checkOnly {
		return
	}

	raw, err := os.ReadFile(*file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", *file, err)
		os.Exit(1)
	}
	lines, err := parseJSONL(raw)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse: %v\n", err)
		os.Exit(1)
	}
	if needsPlatformOwner(lines) {
		if _, err := platformOwnerDiscordID(); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
	}

	n, err := apply(ctx, pool, lines)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("loaded %d rows from %s\n", n, *file)
}

func checkDatabase(ctx context.Context, pool *pgxpool.Pool, migrationsDir string) error {
	var one int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&one); err != nil {
		return fmt.Errorf("database unavailable: %w", err)
	}
	fmt.Println("database reachable")

	want, err := latestMigrationVersion(migrationsDir)
	if err != nil {
		return err
	}
	var got int
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version_id), 0)
		FROM goose_db_version
		WHERE is_applied
	`).Scan(&got)
	if err != nil {
		return fmt.Errorf("schema check failed (migrate first): %w", err)
	}
	if got != want {
		return fmt.Errorf("schema version %d does not match %s (latest migration %d); run ./scripts/migrate.sh up", got, migrationsDir, want)
	}
	fmt.Printf("schema version %d matches %s\n", got, migrationsDir)
	return nil
}

func latestMigrationVersion(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, fmt.Errorf("read migrations: %w", err)
	}
	latest := 0
	found := false
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			continue
		}
		n, err := strconv.Atoi(prefix)
		if err != nil {
			continue
		}
		if !found || n > latest {
			latest = n
			found = true
		}
	}
	if !found {
		return 0, fmt.Errorf("no migrations in %s", dir)
	}
	return latest, nil
}

type ref struct {
	Table         string `json:"table"`
	PublicID      string `json:"public_id,omitempty"`
	PlatformOwner bool   `json:"platform_owner,omitempty"`
}

const ownerEnv = "PLATFORM_OWNER_DISCORD_ID"

// platformOwnerDiscordID mirrors config.validateDiscordOwnerID. Errors never echo the value.
func platformOwnerDiscordID() (string, error) {
	id := os.Getenv(ownerEnv)
	if id == "" {
		return "", fmt.Errorf("%s is not set; this fixture needs it to resolve the platform owner member", ownerEnv)
	}
	if len(id) < 17 || len(id) > 20 {
		return "", fmt.Errorf("invalid %s", ownerEnv)
	}
	for i := 0; i < len(id); i++ {
		if id[i] < '0' || id[i] > '9' {
			return "", fmt.Errorf("invalid %s", ownerEnv)
		}
	}
	return id, nil
}

func needsPlatformOwner(lines []line) bool {
	for _, row := range lines {
		for _, r := range row.Refs {
			if r.PlatformOwner {
				return true
			}
		}
	}
	return false
}

type line struct {
	Table    string         `json:"table"`
	Conflict []string       `json:"conflict"`
	Refs     map[string]ref `json:"refs,omitempty"`
	Row      map[string]any `json:"row"`
}

var ident = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func parseJSONL(raw []byte) ([]line, error) {
	var out []line
	for i, chunk := range strings.Split(string(raw), "\n") {
		chunk = strings.TrimSpace(chunk)
		if chunk == "" || strings.HasPrefix(chunk, "#") {
			continue
		}
		var row line
		if err := json.Unmarshal([]byte(chunk), &row); err != nil {
			return nil, fmt.Errorf("line %d: %w", i+1, err)
		}
		if err := validate(row); err != nil {
			return nil, fmt.Errorf("line %d: %w", i+1, err)
		}
		out = append(out, row)
	}
	return out, nil
}

func validate(row line) error {
	if !ident.MatchString(row.Table) {
		return fmt.Errorf("bad table %q", row.Table)
	}
	if len(row.Conflict) == 0 {
		return fmt.Errorf("conflict columns required")
	}
	for _, col := range row.Conflict {
		if !ident.MatchString(col) {
			return fmt.Errorf("bad conflict column %q", col)
		}
	}
	for col, r := range row.Refs {
		if !ident.MatchString(col) || !ident.MatchString(r.Table) || (r.PublicID == "") == !r.PlatformOwner {
			return fmt.Errorf("bad ref %q", col)
		}
		if r.PlatformOwner && r.Table != "members" {
			return fmt.Errorf("bad ref %q: platform_owner needs table members", col)
		}
	}
	for col := range row.Row {
		if !ident.MatchString(col) {
			return fmt.Errorf("bad column %q", col)
		}
	}
	return nil
}

func coerce(raw any) (any, error) {
	switch v := raw.(type) {
	case nil, string, bool:
		return coercePrimitive(v)
	case float64:
		return coerceNumber(v), nil
	case []any:
		return coerceStringArray(v)
	case map[string]any:
		return coerceObject(v)
	default:
		return nil, fmt.Errorf("unsupported %T", raw)
	}
}

func coercePrimitive(value any) (any, error) {
	if text, ok := value.(string); ok {
		if parsed, err := time.Parse(time.RFC3339, text); err == nil {
			return parsed, nil
		}
	}
	return value, nil
}

func coerceNumber(value float64) any {
	if value != float64(int64(value)) {
		return value
	}
	if value >= math.MinInt32 && value <= math.MaxInt32 {
		return int32(value)
	}
	return int64(value)
}

func coerceStringArray(values []any) (any, error) {
	if len(values) == 0 {
		return []string{}, nil
	}
	stringsOnly := make([]string, len(values))
	for i, value := range values {
		text, ok := value.(string)
		if !ok {
			return encodeRawJSON(values)
		}
		stringsOnly[i] = text
	}
	return stringsOnly, nil
}

func coerceObject(value map[string]any) (any, error) {
	return encodeRawJSON(value)
}

func encodeRawJSON(value any) (any, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func apply(ctx context.Context, pool *pgxpool.Pool, lines []line) (int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for i, row := range lines {
		args, cols, err := bind(ctx, tx, row)
		if err != nil {
			return 0, fmt.Errorf("line %d %s: %w", i+1, row.Table, err)
		}
		sql := insertSQL(row.Table, cols, row.Conflict)
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			return 0, fmt.Errorf("%s: %w\n%s", row.Table, err, sql)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(lines), nil
}

func bind(ctx context.Context, q pgx.Tx, row line) ([]any, []string, error) {
	cols := make([]string, 0, len(row.Row)+len(row.Refs))
	args := make([]any, 0, len(row.Row)+len(row.Refs))
	for col, raw := range row.Row {
		val, err := coerce(raw)
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %w", col, err)
		}
		cols = append(cols, col)
		args = append(args, val)
	}
	for col, r := range row.Refs {
		var id int64
		if r.PlatformOwner {
			discordID, err := platformOwnerDiscordID()
			if err != nil {
				return nil, nil, err
			}
			err = q.QueryRow(ctx, "SELECT id FROM members WHERE discord_id = $1 AND status = 'active'", discordID).Scan(&id)
			if err != nil {
				return nil, nil, fmt.Errorf("%s -> platform owner: no active member for %s: %w", col, ownerEnv, err)
			}
			cols = append(cols, col)
			args = append(args, id)
			continue
		}
		err := q.QueryRow(ctx, fmt.Sprintf(
			"SELECT id FROM %s WHERE public_id = $1", r.Table,
		), r.PublicID).Scan(&id)
		if err != nil {
			return nil, nil, fmt.Errorf("%s -> %s %s: %w", col, r.Table, r.PublicID, err)
		}
		cols = append(cols, col)
		args = append(args, id)
	}
	return args, cols, nil
}

func insertSQL(table string, cols, conflict []string) string {
	holders := make([]string, len(cols))
	for i := range cols {
		holders[i] = fmt.Sprintf("$%d", i+1)
	}
	return fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO NOTHING",
		table,
		strings.Join(cols, ", "),
		strings.Join(holders, ", "),
		strings.Join(conflict, ", "),
	)
}
