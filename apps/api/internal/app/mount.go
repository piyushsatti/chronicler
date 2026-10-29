package app

import (
	"context"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/login"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// HTTPDeps are the collaborators Mount needs. Nil read callbacks are replaced
// with not-found stubs so the OpenAPI surface stays registered without a DB.
// Notification routes stay registered, but absent read/command dependencies fail internally.
type HTTPDeps struct {
	Resolver        *graph.Resolver
	Authority       auth.AuthorityResolver
	Notifications   notification.Queries
	NotificationCmd notification.Commands
	Documents       document.Queries
	SiteStats       func() site.Stats
	MemberMe        member.MeQuery
	Login           *login.Service
	Ingest          *ingest.Handler
	Agent           *agent.Service
	SpatialTime     spatial.TimeMap
	SpatialRead     spatial.ReadAPI
}

// Mount registers the HTTP surface used by cmd/api (health, auth, GraphQL, /v1).
func Mount(mux httpserver.Router, d HTTPDeps) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.Handle("POST /v1/graphql", graphql.NewHandler(d.Resolver, graphql.DefaultLimits(), d.Authority))

	if d.Login != nil {
		d.Login.Routes(mux)
	}
	document.HTTP{Q: d.Documents}.Routes(mux)

	stats := d.SiteStats
	if stats == nil {
		stats = func() site.Stats { return site.Stats{} }
	}
	site.Routes(mux, stats)

	timeMap := d.SpatialTime
	if timeMap == nil {
		timeMap = spatial.EmptyTimeMap{}
	}
	spatial.Routes(mux, timeMap)

	me := d.MemberMe
	if me == nil {
		me = func(string) (member.Member, error) {
			return member.Member{}, apierr.New(apierr.NotFound, "member not found")
		}
	}
	member.Routes(mux, me)
	notification.Routes(mux, d.Notifications)
	notification.CommandRoutes(mux, d.NotificationCmd)

	withSpatialReadStubs(d.SpatialRead).Routes(mux)

	if d.Ingest != nil {
		d.Ingest.Routes(mux)
	}
	if d.Agent != nil {
		d.Agent.Routes(mux)
	}
}

// MountFromAPI builds HTTPDeps from a Wire'd API and env config, then Mounts.
func MountFromAPI(mux httpserver.Router, runtime API, cfg config.Config) {
	var memberStore login.MemberStore = login.StaticMemberStore{}
	if runtime.Members != nil {
		memberStore = runtime.Members
	}

	timeMap := spatial.TimeMap(spatial.EmptyTimeMap{})
	spatialRead := spatial.ReadAPI{}
	if runtime.Pool != nil {
		spatialPG := spatial.NewPostgresQueries(runtime.Pool.Pool)
		timeMap = spatial.PostgresTimeMap{Queries: spatialPG}
		spatialRead = spatial.ReadAPI{
			HexHistory:   spatialPG.HexHistory,
			RegionCounts: spatialPG.RegionCounts,
			MapActivity:  spatialPG.MapActivity,
		}
	}

	Mount(mux, HTTPDeps{
		Resolver:        runtime.Resolver,
		Authority:       runtime.Authority,
		Documents:       runtime.Documents,
		Notifications:   runtime.Notifications,
		NotificationCmd: runtime.NotificationCmd,
		SiteStats:       runtime.SiteStats,
		MemberMe: func(id string) (member.Member, error) {
			if id == "" {
				return member.Member{}, apierr.New(apierr.NotFound, "member not found")
			}
			return runtime.MemberMe(id)
		},
		Login: login.New(login.Config{
			ClientID:      cfg.DiscordClientID,
			ClientSecret:  cfg.DiscordSecret,
			RedirectURI:   cfg.DiscordRedirect,
			JWTSecret:     cfg.JWTSecret,
			AllowDevLogin: cfg.Env != "production",
		}, memberStore),
		Ingest:      ingest.New(cfg.IngestSecret, runtime.Ingest),
		Agent:       runtime.Agent,
		SpatialTime: timeMap,
		SpatialRead: spatialRead,
	})
}

func withSpatialReadStubs(a spatial.ReadAPI) spatial.ReadAPI {
	if a.HexHistory == nil {
		a.HexHistory = func(context.Context, string, int) ([]spatial.HexChange, error) {
			return nil, apierr.New(apierr.NotFound, "hex not found")
		}
	}
	if a.RegionCounts == nil {
		a.RegionCounts = func(context.Context, string) (spatial.RegionCounts, error) {
			return spatial.RegionCounts{}, apierr.New(apierr.NotFound, "region not found")
		}
	}
	if a.MapActivity == nil {
		a.MapActivity = func(context.Context, string) (spatial.MapActivity, error) {
			return spatial.MapActivity{}, apierr.New(apierr.NotFound, "map not found")
		}
	}
	return a
}
