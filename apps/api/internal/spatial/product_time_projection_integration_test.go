//go:build integration

package spatial

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func timeCommandFixture(t *testing.T) (*dbtest.ProductFixture, context.Context, *ProductCommands, auth.Authority) {
	t.Helper()
	f, ctx, commands, resolve := pointcrawlFixture(t)
	commands.Clock = func() time.Time { return time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC) }
	admin, err := resolve(ctx, mapAdmin)
	if err != nil {
		t.Fatal(err)
	}
	return f, ctx, commands, admin
}

func timeState(t *testing.T, f *dbtest.ProductFixture, ctx context.Context) string {
	t.Helper()
	var value string
	err := f.Pool.QueryRow(ctx, `SELECT jsonb_build_object('anchors',(SELECT jsonb_agg(to_jsonb(a) ORDER BY public_id) FROM time_anchors a),'calendar',(SELECT jsonb_agg(to_jsonb(c)) FROM game_calendar c),'map',(SELECT jsonb_agg(to_jsonb(m) ORDER BY real_date) FROM game_time_map m),'receipts',(SELECT jsonb_agg(to_jsonb(i) ORDER BY endpoint,actor_id,key) FROM idempotency_keys i),'jobs',(SELECT count(*) FROM background_jobs),'notices',(SELECT count(*) FROM notifications))::text`).Scan(&value)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func timeDay(t *testing.T, f *dbtest.ProductFixture, ctx context.Context, date string, want int32) {
	t.Helper()
	var day int32
	if err := f.Pool.QueryRow(ctx, `SELECT game_day FROM game_time_map WHERE real_date=$1::date`, date).Scan(&day); err != nil || day != want {
		t.Fatalf("%s day=%d error=%v, want %d", date, day, err, want)
	}
}

func TestTimeCommandsMaterializeFuturePreservePastAndReplay(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	if _, err := f.Pool.Exec(ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES('2026-10-13',112)`); err != nil {
		t.Fatal(err)
	}
	base := TimeAnchorFields{RealUtc: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), EpochDay: 100, Rate: 1}
	if _, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	timeDay(t, f, ctx, "2026-10-14", 113)
	timeDay(t, f, ctx, "2026-11-12", 142)
	input := CreateTimeAnchorSpec{Input: TimeAnchorFields{RealUtc: time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC), EpochDay: 200, Rate: 2}}
	meta := pointcrawlMeta()
	created, err := commands.CreateTimeAnchor(ctx, admin, input, meta)
	if err != nil {
		t.Fatal(err)
	}
	timeDay(t, f, ctx, "2026-10-13", 112)
	timeDay(t, f, ctx, "2026-10-14", 200)
	timeDay(t, f, ctx, "2026-10-15", 202)
	timeDay(t, f, ctx, "2026-11-12", 258)
	before := timeState(t, f, ctx)
	replayed, err := commands.CreateTimeAnchor(ctx, admin, input, meta)
	if err != nil || replayed.Id != created.Id || timeState(t, f, ctx) != before {
		t.Fatalf("replay=%+v error=%v changed persisted state", replayed, err)
	}
	input.Input.EpochDay = 201
	if _, err := commands.UpdateTimeAnchor(ctx, admin, UpdateTimeAnchorSpec{Id: created.Id, Input: input.Input}, pointcrawlMeta()); err != nil {
		t.Fatal(err)
	}
	timeDay(t, f, ctx, "2026-10-14", 201)
	timeDay(t, f, ctx, "2026-10-15", 203)
	timeDay(t, f, ctx, "2026-11-12", 259)
	timeDay(t, f, ctx, "2026-10-13", 112)
	var changed int32
	if err := db.NewRunner(f.Pool, func(tx pgx.Tx) TimeWriteRepository { p, _ := NewProductPostgres(tx); return p }).Do(ctx, func(repo TimeWriteRepository) error {
		var err error
		changed, err = materializeTime(ctx, repo, commands.Clock())
		return err
	}); err != nil || changed != 0 {
		t.Fatalf("unchanged projection count=%d error=%v", changed, err)
	}
}

func TestTimeCommandsRejectInvalidMissingCoverageCollisionsAndOverflow(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	base := TimeAnchorFields{RealUtc: time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC), EpochDay: 0, Rate: 1}
	before := timeState(t, f, ctx)
	_, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	if timeState(t, f, ctx) != before {
		t.Fatal("uncovered first date left anchor/map/receipt effects")
	}
	base.RealUtc = base.RealUtc.Add(-12 * time.Hour)
	base.Rate = 0
	created, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	timeDay(t, f, ctx, "2026-10-14", 0)
	timeDay(t, f, ctx, "2026-11-12", 0)
	before = timeState(t, f, ctx)
	_, err = commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Conflict)
	for _, rate := range []float64{-1, 101, math.Inf(1), math.NaN()} {
		bad := base
		bad.Rate = rate
		_, err := commands.UpdateTimeAnchor(ctx, admin, UpdateTimeAnchorSpec{Id: created.Id, Input: bad}, pointcrawlMeta())
		pointcrawlCode(t, err, apierr.Invalid)
	}
	overflow := base
	overflow.EpochDay, overflow.Rate = math.MaxInt32, 1
	_, err = commands.UpdateTimeAnchor(ctx, admin, UpdateTimeAnchorSpec{Id: created.Id, Input: overflow}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Invalid)
	if timeState(t, f, ctx) != before {
		t.Fatal("rejected input changed anchor/map/receipt")
	}
}

func TestTimeCalendarValidatesDefinitionAndReturnsThirtyStoredCells(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	if _, err := f.Pool.Exec(ctx, `INSERT INTO game_time_map(real_date,game_day) VALUES('2026-10-14',0),('2026-10-15',-1),('2026-10-13',91)`); err != nil {
		t.Fatal(err)
	}
	definition := json.RawMessage(`{"era":{"name":"Pi Era","abbrev":"PI"},"periods":[{"name":"River","type":"month","days":30}],"rate_real_days_per_game_day":2,"leap":null}`)
	meta := pointcrawlMeta()
	view, err := commands.UpdateGameCalendar(ctx, admin, UpdateGameCalendarSpec{Definition: definition}, meta)
	if err != nil || view.CurrentGameDay == nil || *view.CurrentGameDay != 0 || len(view.MonthGrid) != 30 || view.MonthGrid[0].RealDate != "2026-10-14" || view.MonthGrid[29].RealDate != "2026-11-12" || view.MonthGrid[1].GameDay == nil || *view.MonthGrid[1].GameDay != -1 || view.MonthGrid[2].GameDay != nil {
		t.Fatalf("calendar=%+v error=%v", view, err)
	}
	var stored json.RawMessage
	if err := f.Pool.QueryRow(ctx, `SELECT definition FROM game_calendar WHERE id=1`).Scan(&stored); err != nil || !json.Valid(stored) {
		t.Fatalf("stored=%s error=%v", stored, err)
	}
	before := timeState(t, f, ctx)
	if _, err := commands.UpdateGameCalendar(ctx, admin, UpdateGameCalendarSpec{Definition: definition}, meta); err != nil || timeState(t, f, ctx) != before {
		t.Fatalf("calendar replay changed state: %v", err)
	}
	for _, bad := range []string{`{}`, `{"months":[{"name":"Month","days":30}]}`, `{"epoch":"Era","months":[{"name":"Month","days":0}]}`, `{"epoch":"Era","months":[{"name":"Month","days":30}],"periods":[]}`, `{"epoch":"Era","months":[{"name":"Month","days":30}],"leap":{"every":4}}`} {
		_, err := commands.UpdateGameCalendar(ctx, admin, UpdateGameCalendarSpec{Definition: json.RawMessage(bad)}, pointcrawlMeta())
		pointcrawlCode(t, err, apierr.Invalid)
	}
	if timeState(t, f, ctx) != before {
		t.Fatal("invalid definition changed calendar/map/receipt")
	}
	timeDay(t, f, ctx, "2026-10-13", 91)
}

func TestTimeProjectionFailuresRollBackAnchorMapAndReceipt(t *testing.T) {
	for _, target := range []string{"game_time_map", "idempotency_keys"} {
		t.Run(target, func(t *testing.T) {
			f, ctx, commands, admin := timeCommandFixture(t)
			base := TimeAnchorFields{RealUtc: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), EpochDay: 100, Rate: 1}
			created, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta())
			if err != nil {
				t.Fatal(err)
			}
			if _, err := f.Pool.Exec(ctx, `CREATE FUNCTION fail_time_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected Time effect failure'; END $$`); err != nil {
				t.Fatal(err)
			}
			if _, err := f.Pool.Exec(ctx, `CREATE TRIGGER fail_time_effect BEFORE UPDATE ON `+target+` FOR EACH ROW EXECUTE FUNCTION fail_time_effect()`); err != nil {
				t.Fatal(err)
			}
			before := timeState(t, f, ctx)
			base.EpochDay = 300
			if _, err := commands.UpdateTimeAnchor(ctx, admin, UpdateTimeAnchorSpec{Id: created.Id, Input: base}, pointcrawlMeta()); err == nil {
				t.Fatal("injected failure was swallowed")
			}
			if timeState(t, f, ctx) != before {
				t.Fatal("failure left partial anchor/map/receipt effects")
			}
		})
	}
}

func TestTimeConcurrentCollidingCreatesAdmitExactlyOne(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	input := CreateTimeAnchorSpec{Input: TimeAnchorFields{RealUtc: time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC), EpochDay: 40, Rate: 1}}
	var wait sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wait.Go(func() {
			_, err := commands.CreateTimeAnchor(ctx, admin, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			results <- err
		})
	}
	wait.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if failure, ok := errors.AsType[*apierr.Error](err); ok && failure.Code == apierr.Conflict {
			conflict++
		} else {
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("success=%d conflict=%d", success, conflict)
	}
	var anchors, receipts int
	if err := f.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM time_anchors),(SELECT count(*) FROM idempotency_keys)`).Scan(&anchors, &receipts); err != nil || anchors != 1 || receipts != 1 {
		t.Fatalf("anchors=%d receipts=%d error=%v", anchors, receipts, err)
	}
}

func TestTimeProjectionRetainsLegacyDuplicateTieAndUsesUTCMidnight(t *testing.T) {
	f, ctx, commands, _ := timeCommandFixture(t)
	for _, row := range []struct {
		id, at string
		epoch  int32
		rate   float64
	}{
		{"30000000-0000-4000-8000-000000000001", "2026-10-01T00:00:00Z", 100, 1},
		{"30000000-0000-4000-8000-000000000002", "2026-10-01T00:00:00Z", 500, 1},
		{"30000000-0000-4000-8000-000000000003", "2026-10-14T12:00:00Z", 10, 0},
		{"30000000-0000-4000-8000-000000000004", "2026-10-16T00:00:00Z", 40, 1},
		{"30000000-0000-4000-8000-000000000005", "2026-10-16T00:00:00Z", 60, 1},
	} {
		if _, err := f.Pool.Exec(ctx, `INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate) VALUES($1,$2::timestamptz,$3,$4)`, row.id, row.at, row.epoch, row.rate); err != nil {
			t.Fatal(err)
		}
	}
	err := db.NewRunner(f.Pool, func(tx pgx.Tx) pgx.Tx { return tx }).Do(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SET LOCAL TIME ZONE 'Pacific/Honolulu'`); err != nil {
			return err
		}
		p, _ := NewProductPostgres(tx)
		changed, err := materializeTime(ctx, p, commands.Clock())
		if err == nil && changed != 30 {
			return errors.New("projection did not insert all30 dates")
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	timeDay(t, f, ctx, "2026-10-14", 513)
	timeDay(t, f, ctx, "2026-10-15", 10)
	timeDay(t, f, ctx, "2026-10-16", 60)
	var count int
	if err := f.Pool.QueryRow(ctx, `SELECT count(*) FROM time_anchors`).Scan(&count); err != nil || count != 5 {
		t.Fatalf("legacy anchors=%d error=%v", count, err)
	}
}

func TestTimeAuthorityRevokedDuringAggregateLockWaitLeavesNoEffects(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	locker, err := f.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locker.Rollback(ctx)
	if _, err := locker.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('chronicler:time-aggregate',0))`); err != nil {
		t.Fatal(err)
	}
	before := timeState(t, f, ctx)
	result := make(chan error, 1)
	go func() {
		_, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: TimeAnchorFields{RealUtc: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), EpochDay: 100, Rate: 1}}, pointcrawlMeta())
		result <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting bool
		if err := f.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted)`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Time command did not wait on aggregate lock")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err := f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`, mapAdmin); err != nil {
		t.Fatal(err)
	}
	if err := locker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	pointcrawlCode(t, <-result, apierr.Forbidden)
	if timeState(t, f, ctx) != before {
		t.Fatal("revoked authority left Time or receipt effects")
	}
}

func TestTimeCommandsDenyPlayerAndRecheckReplayAuthority(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	input := CreateTimeAnchorSpec{Input: TimeAnchorFields{RealUtc: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), EpochDay: 100, Rate: 1}}
	meta := pointcrawlMeta()
	created, err := commands.CreateTimeAnchor(ctx, admin, input, meta)
	if err != nil {
		t.Fatal(err)
	}
	player, err := auth.NewAuthorityWithHandle(mapPlayer, []auth.Role{"player"}, "active", "unapproved", "player")
	if err != nil {
		t.Fatal(err)
	}
	before := timeState(t, f, ctx)
	_, err = commands.CreateTimeAnchor(ctx, player, input, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	_, err = commands.UpdateTimeAnchor(ctx, player, UpdateTimeAnchorSpec{Id: created.Id, Input: input.Input}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	_, err = commands.UpdateGameCalendar(ctx, player, UpdateGameCalendarSpec{Definition: json.RawMessage(`{"epoch":"Era","months":[{"name":"Month","days":30}]}`)}, pointcrawlMeta())
	pointcrawlCode(t, err, apierr.Forbidden)
	if _, err := f.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`, mapAdmin); err != nil {
		t.Fatal(err)
	}
	_, err = commands.CreateTimeAnchor(ctx, admin, input, meta)
	pointcrawlCode(t, err, apierr.Forbidden)
	if timeState(t, f, ctx) != before {
		t.Fatal("denied command/replay changed Time or receipts")
	}
}

func TestTimeConcurrentUpdatesKeepStoredAnchorAndFutureMapConsistent(t *testing.T) {
	f, ctx, commands, admin := timeCommandFixture(t)
	base := TimeAnchorFields{RealUtc: time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC), EpochDay: 100, Rate: 1}
	created, err := commands.CreateTimeAnchor(ctx, admin, CreateTimeAnchorSpec{Input: base}, pointcrawlMeta())
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	for _, epoch := range []int32{200, 300} {
		go func() {
			input := base
			input.EpochDay = epoch
			_, err := commands.UpdateTimeAnchor(ctx, admin, UpdateTimeAnchorSpec{Id: created.Id, Input: input}, pointcrawlMeta())
			results <- err
		}()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var epoch int32
	if err := f.Pool.QueryRow(ctx, `SELECT epoch_day FROM time_anchors WHERE public_id=$1`, created.Id).Scan(&epoch); err != nil || epoch != 200 && epoch != 300 {
		t.Fatalf("stored epoch=%d error=%v", epoch, err)
	}
	timeDay(t, f, ctx, "2026-10-14", epoch)
	timeDay(t, f, ctx, "2026-11-12", epoch+29)
}
