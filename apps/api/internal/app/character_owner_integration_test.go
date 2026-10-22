//go:build integration

package app

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestMain(m *testing.M) {
	code := m.Run()
	if err := dbtest.CloseProductFixtures(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		code = 1
	}
	os.Exit(code)
}

func TestCharacterCommandBindingPreservesConfiguredOwner(t *testing.T) {
	fixture := dbtest.NewProductFixture(t)
	ctx := context.Background()
	ownerID := uuid.NewString()
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,'character-configured-owner','character-configured-owner','Owner',ARRAY['player'])`, ownerID); err != nil {
		t.Fatal(err)
	}
	store, err := member.NewFromDBTX(fixture.Pool, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	poolActor, err := store.ResolveAuthority(ctx, ownerID)
	if err != nil || !poolActor.IsPlatformOwner() {
		t.Fatalf("pool owner=%v err=%v", poolActor.IsPlatformOwner(), err)
	}
	policy, err := auth.NewPoolPolicy(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	repos := bindCharacterCommandRepos(tx, policy, store)
	actor, err := repos.Authority(ctx, ownerID)
	if err != nil || !actor.IsPlatformOwner() || actor.Claims().Has(auth.Admin) {
		t.Fatalf("bound owner=%v roles=%v err=%v", actor.IsPlatformOwner(), actor.Claims().Roles, err)
	}
	for _, operation := range []auth.Operation{"Mutation.decideVerification", "Mutation.upsertCreationCatalogEntry"} {
		request, err := auth.ForOperation(operation)
		if err != nil {
			t.Fatal(err)
		}
		decision, err := repos.Policy.Decide(ctx, actor, request)
		if err != nil || !decision.Allowed {
			t.Fatalf("operation=%s decision=%+v err=%v", operation, decision, err)
		}
	}
}
