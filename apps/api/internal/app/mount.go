package app

import (
	"context"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
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
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// HTTPDeps are the collaborators Mount needs. Nil read callbacks are replaced
// with not-found stubs so the OpenAPI surface stays registered without a DB.
// Notification routes stay registered, but absent read/command dependencies fail internally.
type HTTPDeps struct {
	Resolver        *graph.Resolver
	Authority       auth.AuthorityResolver
	QuestCmd        quest.Commands
	Notifications   notification.Queries
	NotificationCmd notification.Commands
	Documents       document.Queries
	SiteStats       func() site.Stats
	MemberMe        member.MeQuery
	Login           *login.Service
	Ingest          *ingest.Handler
	Agent           *agent.Service
	SpatialTime     spatial.TimeMap
	MemberRead      member.ReadAPI
	SpatialRead     spatial.ReadAPI
	CharacterRead   character.ReadAPI
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
	quest.Routes(mux, d.QuestCmd)
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

	withMemberReadStubs(d.MemberRead).Routes(mux)
	withSpatialReadStubs(d.SpatialRead).Routes(mux)
	withCharacterReadStubs(d.CharacterRead).Routes(mux)

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
	memberRead := member.ReadAPI{}
	spatialRead := spatial.ReadAPI{}
	characterRead := character.ReadAPI{}
	if runtime.Pool != nil {
		spatialPG := spatial.NewPostgresQueries(runtime.Pool.Pool)
		timeMap = spatial.PostgresTimeMap{Queries: spatialPG}
		spatialRead = spatial.ReadAPI{
			HexHistory:   spatialPG.HexHistory,
			RegionCounts: spatialPG.RegionCounts,
			MapActivity:  spatialPG.MapActivity,
		}
		charPG := character.NewPostgresQueries(runtime.Pool.Pool)
		characterRead = character.ReadAPI{
			Progression:         charPG.Progression,
			Logs:                charPG.Logs,
			VerificationHistory: charPG.VerificationHistory,
		}
	}
	if runtime.Members != nil {
		memberRead = member.ReadAPI{
			ByDiscordID:  runtime.Members.GetByDiscordID,
			RoleHistory:  runtime.Members.RoleHistory,
			Availability: runtime.Members.Availability,
		}
	}

	Mount(mux, HTTPDeps{
		Resolver:        runtime.Resolver,
		Authority:       runtime.Authority,
		QuestCmd:        runtime.QuestCmd,
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
			ClientID:     cfg.DiscordClientID,
			ClientSecret: cfg.DiscordSecret,
			RedirectURI:  cfg.DiscordRedirect,
			JWTSecret:    cfg.JWTSecret,
		}, memberStore),
		Ingest:        ingest.New(cfg.IngestSecret, runtime.Ingest),
		Agent:         runtime.Agent,
		SpatialTime:   timeMap,
		MemberRead:    memberRead,
		SpatialRead:   spatialRead,
		CharacterRead: characterRead,
	})
}

func withMemberReadStubs(a member.ReadAPI) member.ReadAPI {
	if a.ByDiscordID == nil {
		a.ByDiscordID = func(context.Context, string) (member.Member, error) {
			return member.Member{}, apierr.New(apierr.NotFound, "member not found")
		}
	}
	if a.RoleHistory == nil {
		a.RoleHistory = func(context.Context, string, int) ([]member.RoleChange, error) {
			return nil, apierr.New(apierr.NotFound, "member not found")
		}
	}
	if a.Availability == nil {
		a.Availability = func(context.Context, string) ([]member.AvailabilityWindow, error) {
			return nil, apierr.New(apierr.NotFound, "member not found")
		}
	}
	return a
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

func withCharacterReadStubs(a character.ReadAPI) character.ReadAPI {
	if a.Progression == nil {
		a.Progression = func(context.Context, string, int) ([]character.ProgressionEntry, error) {
			return nil, apierr.New(apierr.NotFound, "character not found")
		}
	}
	if a.Logs == nil {
		a.Logs = func(context.Context, string, int) ([]character.LogEntry, error) {
			return nil, apierr.New(apierr.NotFound, "character not found")
		}
	}
	if a.VerificationHistory == nil {
		a.VerificationHistory = func(context.Context, string, int) ([]character.VerificationEntry, error) {
			return nil, apierr.New(apierr.NotFound, "character not found")
		}
	}
	return a
}
