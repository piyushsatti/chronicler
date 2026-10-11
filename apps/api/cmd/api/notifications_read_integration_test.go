//go:build integration

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

const nativeReadPath = "/v1/me/notifications/read"

func readNativeBody(ids ...string) []byte {
	if ids == nil {
		ids = []string{}
	}
	body, _ := json.Marshal(map[string]any{"ids": ids})
	return body
}
func assertNativeReadSuccess(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	assertUnreadNativeCORS(t, w)
	if w.Code != 204 || w.Body.Len() != 0 {
		t.Fatalf("mark-read response=%d %s", w.Code, w.Body)
	}
}
func readNativeNotice(t *testing.T, f *authorityDBFixture, m authorityDBMember, read bool) string {
	t.Helper()
	id := uuid.NewString()
	var at any
	if read {
		at = time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	}
	f.exec(t, `INSERT INTO notifications(public_id,member_id,kind,body,read_at) VALUES($1::uuid,$2,'read-test','private notification payload',$3)`, id, m.rowID, at)
	return id
}
func readNativeSnapshot(t *testing.T, f *authorityDBFixture, members ...authorityDBMember) string {
	t.Helper()
	ids := make([]int64, len(members))
	for i, m := range members {
		ids[i] = m.rowID
	}
	var got string
	if err := f.pool.QueryRow(context.Background(), `SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.id),'[]'::jsonb)::text FROM notifications n WHERE member_id=ANY($1::bigint[])`, ids).Scan(&got); err != nil {
		t.Fatal(err)
	}
	return got
}
func readNativeTimes(t *testing.T, f *authorityDBFixture, ids ...string) map[string]*time.Time {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `SELECT public_id::text,read_at FROM notifications WHERE public_id::text=ANY($1::text[])`, ids)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	result := map[string]*time.Time{}
	for rows.Next() {
		var id string
		var at *time.Time
		if err := rows.Scan(&id, &at); err != nil {
			t.Fatal(err)
		}
		result[id] = at
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(result) != len(ids) {
		t.Fatal("fixture rows missing")
	}
	return result
}
func readNativeHandler(f *authorityDBFixture, command notification.Commands) http.Handler {
	runtime := f.runtime
	runtime.NotificationCmd = command
	mux := http.NewServeMux()
	app.MountFromAPI(mux, runtime, f.cfg)
	return apiHandler(mux, f.cfg, runtime.Authority)
}

func TestNotificationsMarkReadProductionRecipientTimestampAndConcurrentRetries(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a, b := f.member(t, auth.Player), f.member(t, auth.Player)
	first, second, already, foreign := readNativeNotice(t, f, a, false), readNativeNotice(t, f, a, false), readNativeNotice(t, f, a, true), readNativeNotice(t, f, b, false)
	beforeForeign := readNativeSnapshot(t, f, b)
	old := readNativeTimes(t, f, already)[already]
	token := f.token(t, a.publicID, auth.Admin)
	body := readNativeBody(strings.ToUpper(first), first, second, already, foreign, uuid.NewString())
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath+"?member_id="+b.publicID, token, body))
	got := readNativeTimes(t, f, first, second, already, foreign)
	if got[first] == nil || got[second] == nil || !got[first].Equal(*got[second]) || !got[already].Equal(*old) || got[foreign] != nil {
		t.Fatalf("recipient/timestamp state=%v", got)
	}
	// Compete for one still-unread row, rather than only racing no-op retries.
	race := readNativeNotice(t, f, a, false)
	retryBody := readNativeBody(first, second, already, foreign, race)
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 4)
	start := make(chan struct{})
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			responses <- authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, retryBody)
		}()
	}
	close(start)
	wg.Wait()
	close(responses)
	for w := range responses {
		assertNativeReadSuccess(t, w)
	}
	afterRace := readNativeTimes(t, f, first, second, already, race)
	if afterRace[race] == nil || !afterRace[first].Equal(*got[first]) || !afterRace[second].Equal(*got[second]) || !afterRace[already].Equal(*old) {
		t.Fatal("concurrent retry failed to converge or changed existing timestamps")
	}
	committed := readNativeSnapshot(t, f, a, b)
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, retryBody))
	if after := readNativeSnapshot(t, f, a, b); after != committed {
		t.Fatal("retry changed committed timestamps or row content")
	}
	if after := readNativeSnapshot(t, f, b); after != beforeForeign {
		t.Fatal("foreign row changed")
	}
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, readNativeBody()))
	if after := readNativeSnapshot(t, f, a, b); after != committed {
		t.Fatal("empty command changed rows")
	}
}

func TestNotificationsMarkReadProductionRejectsWholeInvalidRequest(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a := f.member(t, auth.Player)
	id := readNativeNotice(t, f, a, false)
	before := readNativeSnapshot(t, f, a)
	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = id
	}
	for _, body := range [][]byte{readNativeBody(id, "bad"), readNativeBody(tooMany...), []byte(`{"ids":[],"ids":["` + id + `"]}`), append(readNativeBody(id), []byte(` {}`)...), append(readNativeBody(id), []byte(strings.Repeat(" ", 8192))...)} {
		w := authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, f.token(t, a.publicID), body)
		assertNativeUnreadProblem(t, w, 422, "INVALID")
		var problem map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &problem)
		if problem["title"] != "Invalid notification read request" {
			t.Fatal("invalid request leaked details")
		}
		if after := readNativeSnapshot(t, f, a); after != before {
			t.Fatal("invalid mixed request changed rows")
		}
	}
	ids := make([]string, 100)
	ids[0] = id
	for i := 1; i < len(ids); i++ {
		ids[i] = readNativeNotice(t, f, a, false)
	}
	body := readNativeBody(ids...)
	body = append(body, []byte(strings.Repeat(" ", 8192-len(body)))...)
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, f.token(t, a.publicID), body))
	times := readNativeTimes(t, f, ids...)
	for _, at := range times {
		if at == nil || times[id] == nil || !at.Equal(*times[id]) {
			t.Fatal("100-row command did not use one transaction timestamp")
		}
	}
}

func TestNotificationsMarkReadProductionCurrentAuthorityBeforeCommand(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a := f.member(t, auth.Player)
	id := readNativeNotice(t, f, a, false)
	before := readNativeSnapshot(t, f, a)
	token := f.token(t, a.publicID, auth.Admin)
	expired, err := login.Mint(f.cfg.JWTSecret, login.Claims{MemberID: a.publicID, Roles: []auth.Role{auth.Admin}, Exp: time.Now().Add(-time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	// Existing live-authority middleware is exercised through the production chain.
	for _, token := range []string{"", "invalid-bearer", expired} {
		assertNativeUnreadProblem(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, readNativeBody(id)), 401, "UNAUTHENTICATED")
	}
	assertNativeUnreadProblem(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, f.token(t, uuid.NewString(), auth.Admin), readNativeBody(id)), 403, "FORBIDDEN")
	for _, status := range []string{"inactive", "banned"} {
		f.exec(t, `UPDATE members SET status=$2 WHERE id=$1`, a.rowID, status)
		assertNativeUnreadProblem(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, readNativeBody(id)), 403, "FORBIDDEN")
	}
	if after := readNativeSnapshot(t, f, a); after != before {
		t.Fatal("denied authority changed rows")
	}
	f.exec(t, `UPDATE members SET status='active' WHERE id=$1`, a.rowID)
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, readNativeBody(id)))
}

func TestNotificationsMarkReadProductionWriteDependencyFailure(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a := f.member(t, auth.Player)
	id := readNativeNotice(t, f, a, false)
	before := readNativeSnapshot(t, f, a)
	writePool, err := db.Connect(context.Background(), f.cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	writePool.Close()
	command := notification.NewCommands(db.NewRunner(writePool, func(tx pgx.Tx) notification.CommandRepository {
		return notification.NewPostgresRepository(dbgen.New(tx))
	}))
	for _, candidate := range []notification.Commands{command, {}} {
		w := authorityDBRequest(readNativeHandler(f, candidate), http.MethodPost, nativeReadPath, f.token(t, a.publicID), readNativeBody(id))
		assertNativeUnreadProblem(t, w, 500, "INTERNAL")
	}
	if after := readNativeSnapshot(t, f, a); after != before {
		t.Fatal("missing/closed write dependency changed rows")
	}
}

func TestNotificationsMarkReadProductionStatementAndDeferredCommitFailureRollback(t *testing.T) {
	for _, deferred := range []bool{false, true} {
		t.Run(fmt.Sprintf("deferred=%v", deferred), func(t *testing.T) {
			f := newAuthorityDBFixture(t)
			a := f.member(t, auth.Player)
			first, second := readNativeNotice(t, f, a, false), readNativeNotice(t, f, a, false)
			before := readNativeSnapshot(t, f, a)
			name := "read_failure_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			// Fixture-only trigger targets this one test's member and second row.
			// Deferred mode fails at COMMIT after UPDATE has succeeded.
			f.exec(t, fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.member_id = %d AND NEW.public_id = '%s'::uuid THEN RAISE EXCEPTION 'private fixture failure'; END IF; RETURN NEW; END $$`, name, a.rowID, second))
			t.Cleanup(func() {
				f.exec(t, "DROP TRIGGER IF EXISTS "+name+" ON notifications")
				f.exec(t, "DROP FUNCTION IF EXISTS "+name+"()")
			})
			if deferred {
				f.exec(t, "CREATE CONSTRAINT TRIGGER "+name+" AFTER UPDATE ON notifications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "+name+"()")
			} else {
				f.exec(t, "CREATE TRIGGER "+name+" BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION "+name+"()")
			}
			w := authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, f.token(t, a.publicID), readNativeBody(first, second))
			assertNativeUnreadProblem(t, w, 500, "INTERNAL")
			if strings.Contains(w.Body.String(), "private") {
				t.Fatal("SQL details escaped")
			}
			if after := readNativeSnapshot(t, f, a); after != before {
				t.Fatal("failed statement/definitive commit rollback left partial updates")
			}
			f.exec(t, "DROP TRIGGER "+name+" ON notifications")
			assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, f.token(t, a.publicID), readNativeBody(first, second)))
		})
	}
}

type readCommitAcknowledgementLoss struct {
	next uow.Runner[notification.CommandRepository]
}

func (r readCommitAcknowledgementLoss) Do(ctx context.Context, fn func(notification.CommandRepository) error) error {
	// Simulate the transport error only after the real transaction has committed.
	// This is not evidence of a real network-level COMMIT fault injection.
	if err := r.next.Do(ctx, fn); err != nil {
		return err
	}
	return errors.New("simulated lost commit acknowledgement")
}

func TestNotificationsMarkReadProductionUnknownCommitOutcomeSafeRetry(t *testing.T) {
	f := newAuthorityDBFixture(t)
	a := f.member(t, auth.Player)
	id := readNativeNotice(t, f, a, false)
	runner := db.NewRunner(f.runtime.Pool, func(tx pgx.Tx) notification.CommandRepository {
		return notification.NewPostgresRepository(dbgen.New(tx))
	})
	command := notification.NewCommands(readCommitAcknowledgementLoss{next: runner})
	token := f.token(t, a.publicID)
	body := readNativeBody(id)
	w := authorityDBRequest(readNativeHandler(f, command), http.MethodPost, nativeReadPath, token, body)
	assertNativeUnreadProblem(t, w, 500, "INTERNAL")
	committed := readNativeSnapshot(t, f, a)
	times := readNativeTimes(t, f, id)
	if times[id] == nil {
		t.Fatal("uncertainty fixture failed to commit before dropping acknowledgement")
	}
	assertNativeReadSuccess(t, authorityDBRequest(f.handler, http.MethodPost, nativeReadPath, token, body))
	if after := readNativeSnapshot(t, f, a); after != committed {
		t.Fatal("safe retry moved committed read_at")
	}
}
