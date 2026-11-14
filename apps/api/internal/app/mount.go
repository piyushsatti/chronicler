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
// Notification unread-count dependencies fail internally when absent.
type HTTPDeps struct {
	Resolver      *graph.Resolver
	Authority     auth.AuthorityResolver
	Notifications notification.Queries
	Documents     document.Queries
	SiteStats     func(context.Context) (site.Stats, error)
	MemberMe      member.MeQuery
	Login         *login.Service
	Ingest        *ingest.Handler
	Agent         *agent.Service
	SpatialTime   spatial.TimeMap
	Introspection bool
}

// Mount registers the HTTP surface used by cmd/api (health, auth, GraphQL, /v1).
func Mount(mux httpserver.Router, d HTTPDeps) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	limits := graphql.DefaultLimits()
	limits.Introspection = d.Introspection
	mux.Handle("POST /v1/graphql", graphql.NewHandler(d.Resolver, limits, d.Authority))

	if d.Login != nil {
		d.Login.Routes(mux)
	}
	document.HTTP{Q: d.Documents}.Routes(mux)

	stats := d.SiteStats
	if stats == nil {
		stats = func(context.Context) (site.Stats, error) { return site.Stats{}, nil }
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
	if runtime.Pool != nil {
		spatialPG := spatial.NewPostgresQueries(runtime.Pool.Pool)
		timeMap = spatial.PostgresTimeMap{Queries: spatialPG}
	}

	Mount(mux, HTTPDeps{
		Resolver:      runtime.Resolver,
		Authority:     runtime.Authority,
		Documents:     runtime.Documents,
		Notifications: runtime.Notifications,
		SiteStats:     runtime.SiteStats,
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
			AllowDevLogin: cfg.Env != config.EnvProduction,
		}, memberStore),
		Ingest:        ingest.New(cfg.IngestSecret, runtime.Ingest),
		Agent:         runtime.Agent,
		SpatialTime:   timeMap,
		Introspection: cfg.Env != config.EnvProduction,
	})
}
