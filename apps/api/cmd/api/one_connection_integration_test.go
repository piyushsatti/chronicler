//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/app"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func TestProductCommandsCompleteOnOnePoolConnection(t *testing.T) {
	fixture := newProductFixture(t)
	ctx := context.Background()
	adminID := uuid.NewString()
	if _, err := fixture.pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$2,$2,ARRAY['admin','player'])`, adminID, "one-conn-"+adminID); err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(fixture.databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("pool_max_conns", "1")
	parsed.RawQuery = query.Encode()
	runtime := app.Wire(ctx, config.Config{DatabaseURL: parsed.String(), RequireDatabase: true, JWTSecret: "one-connection-integration-key"})
	t.Cleanup(runtime.Pool.Close)
	if runtime.Pool == nil || runtime.Resolver == nil {
		t.Fatal("Wire did not bind Postgres product commands")
	}
	actor, err := runtime.Authority(ctx, adminID)
	if err != nil {
		t.Fatal(err)
	}
	services := runtime.Resolver.Services
	category := "Lore"
	mutations := []struct {
		name string
		run  func(context.Context) error
	}{
		{"quest", func(callCtx context.Context) error {
			_, err := services.QuestCommands.UpsertQuestArc(callCtx, actor, quest.UpsertQuestArcSpec{Name: "One connection arc"}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"document", func(callCtx context.Context) error {
			_, err := services.DocumentCommands.CreateDocument(callCtx, actor, document.CreateDocumentSpec{Input: document.DocumentDraftFields{
				Kind: "codex_entry", Category: &category, Title: "One connection", Body: "body\n", Visibility: "public", Frontmatter: json.RawMessage(`{}`),
			}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"spatial", func(callCtx context.Context) error {
			_, err := services.SpatialCommands.CreateMap(callCtx, actor, spatial.CreateMapSpec{Input: spatial.MapCreateFields{
				Name: "One connection", AtlasCode: "one-conn-" + uuid.NewString()[:8], MapKind: "pointcrawl", Family: "campaign",
			}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
		{"site", func(callCtx context.Context) error {
			_, err := services.SiteCommands.UpdateHomeBanner(callCtx, actor, site.UpdateHomeBannerSpec{Input: site.HomeBannerFields{Enabled: false}}, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			return err
		}},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			callCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			if err := mutation.run(callCtx); err != nil {
				t.Fatalf("%s on pool_max_conns=1: %v", mutation.name, err)
			}
		})
	}
}
