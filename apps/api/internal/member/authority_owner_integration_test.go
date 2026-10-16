//go:build integration

package member

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, "product fixture process cleanup:", err)
		code = 1
	}
	os.Exit(code)
}

func TestPhase3TaskP06Acceptance(t *testing.T) {
	const owner = "10000000-0000-4000-8000-000000000001"
	const missing = "10000000-0000-4000-8000-000000000002"
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if _, err := NewFromDBTX(nil, ""); err == nil {
		t.Fatal("nil executor accepted")
	}
	var nilPool *pgxpool.Pool
	if _, err := NewFromDBTX(nilPool, ""); err == nil {
		t.Fatal("typed nil executor accepted")
	}
	fixture := dbtest.NewProductFixture(t)
	for _, bad := range []string{"bad", "10000000000040008000000000000001", "AAAAAAAA-0000-4000-8000-000000000001"} {
		if _, err := NewFromDBTX(fixture.Pool, bad); err == nil {
			t.Fatalf("invalid owner accepted %q", bad)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,'owner','live-owner','Owner',ARRAY['player','dm'])`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	store, err := NewFromDBTX(fixture.Pool, owner)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := store.ResolveAuthority(auth.WithClaims(ctx, auth.Claims{MemberID: owner, Roles: []auth.Role{auth.Admin}}), owner)
	if err != nil || !actor.IsPlatformOwner() || !actor.LiveDM() || actor.Handle() != "live-owner" || actor.Claims().Has(auth.Admin) {
		t.Fatalf("live authority=%+v err=%v", actor, err)
	}
	legacy := NewPostgresStore(fixture.Pool.Pool)
	ordinary, err := legacy.ResolveAuthority(ctx, owner)
	if err != nil || ordinary.IsPlatformOwner() {
		t.Fatalf("absent config owner=%v err=%v", ordinary.IsPlatformOwner(), err)
	}
	cfg := config.Config{PlatformOwnerMemberID: owner}
	if err := cfg.Validate(ctx, store.ResolveAuthority); err != nil {
		t.Fatal(err)
	}
	if err := (config.Config{PlatformOwnerMemberID: missing}).Validate(ctx, store.ResolveAuthority); err == nil {
		t.Fatal("missing configured owner accepted at boot")
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player'],handle='changed-owner' WHERE public_id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	actor, err = store.ResolveAuthority(ctx, owner)
	if err != nil || actor.LiveDM() || actor.Handle() != "changed-owner" || !actor.IsPlatformOwner() {
		t.Fatalf("revoked role/renamed handle stale: %+v %v", actor, err)
	}
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE members SET roles=ARRAY['dm','admin'],handle='transaction-owner' WHERE public_id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	bound, err := NewFromDBTX(tx, owner)
	if err != nil {
		t.Fatal(err)
	}
	current, err := bound.ResolveAuthority(ctx, owner)
	if err != nil || !current.LiveDM() || !current.Claims().Has(auth.Admin) || current.Handle() != "transaction-owner" {
		t.Fatalf("transaction authority not current: %+v %v", current, err)
	}
	outside, err := store.ResolveAuthority(ctx, owner)
	if err != nil || outside.Claims().Has(auth.Admin) || outside.Handle() != "changed-owner" {
		t.Fatalf("transaction committed or escaped: %+v %v", outside, err)
	}
	if _, err := tx.Exec(ctx, `UPDATE dm_profiles SET status='rejected' WHERE member_id=(SELECT id FROM members WHERE public_id=$1)`, owner); err != nil {
		t.Fatal(err)
	}
	current, err = bound.ResolveAuthority(ctx, owner)
	if err != nil || current.LiveDM() {
		t.Fatalf("transaction profile revocation stale: %+v %v", current, err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	outside, err = store.ResolveAuthority(ctx, owner)
	if err != nil || outside.Claims().Has(auth.Admin) || outside.Handle() != "changed-owner" {
		t.Fatalf("rollback did not restore authority: %+v %v", outside, err)
	}
	for _, id := range []string{"not-uuid", missing} {
		_, err := store.ResolveAuthority(ctx, id)
		var expected *apierr.Error
		if !errors.As(err, &expected) || expected.Code != apierr.Forbidden {
			t.Fatalf("missing authority id=%s err=%v", id, err)
		}
	}
	for _, status := range []string{"inactive", "banned"} {
		if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET status=$2 WHERE public_id=$1`, owner, status); err != nil {
			t.Fatal(err)
		}
		actor, err := store.ResolveAuthority(ctx, owner)
		if err == nil || actor.IsPlatformOwner() {
			t.Fatalf("inactive owner still authorized status=%s err=%v", status, err)
		}
		if err := cfg.Validate(ctx, store.ResolveAuthority); err == nil {
			t.Fatalf("inactive owner accepted at boot status=%s", status)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `DROP TABLE dm_profiles CASCADE`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ResolveAuthority(ctx, owner); err == nil {
		t.Fatal("database failure became authority")
	}
}
