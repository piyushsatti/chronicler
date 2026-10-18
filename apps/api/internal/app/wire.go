package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/ingest"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/config"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

type API struct {
	Authority       auth.AuthorityResolver
	Pool            *db.Pool
	QuestCmd        quest.Commands
	Resolver        *graph.Resolver
	Ingest          ingest.Store
	Agent           *agent.Service
	JobStore        jobs.Store
	Members         *member.PostgresStore
	Notifications   notification.Queries
	NotificationCmd notification.Commands
	Documents       document.Queries
	SiteStats       func() site.Stats
	MemberMe        func(string) (member.Member, error)
}

func Wire(ctx context.Context, cfg config.Config) API {
	mem := API{
		QuestCmd: quest.NewCommands(quest.MemoryRunner(), time.Now),
		SiteStats: func() site.Stats {
			return site.Stats{}
		},
		MemberMe: func(id string) (member.Member, error) {
			return member.Member{ID: id, Handle: "me", DisplayName: "Me", Status: member.StatusActive}, nil
		},
		Ingest:   &ingest.MemoryStore{},
		Agent:    agent.New(cfg.IngestSecret, nil),
		JobStore: &delivery.MemoryStore{},
	}
	mem.Resolver = &graph.Resolver{Services: emptyServices(mem.QuestCmd)}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		if cfg.RequireDatabase {
			slog.Error("database required but unavailable", "env", cfg.Env, "error", err)
			panic("database required: " + err.Error())
		}
		slog.Warn("database unavailable; using in-memory stores", "error", err)
		return mem
	}
	return wirePostgres(ctx, cfg, pool, mem)
}

func emptyServices(cmd quest.Commands) graph.Services {
	return graph.Services{
		Documents:  document.Queries{},
		Quests:     quest.Queries{},
		Members:    member.Queries{},
		Site:       site.Queries{},
		Spatial:    spatial.Queries{},
		Characters: character.Queries{},
		QuestCmd:   cmd,
	}
}

func wirePostgres(_ context.Context, cfg config.Config, pool *db.Pool, base API) API {
	pgxPool := pool.Pool
	q := dbgen.New(pgxPool)
	jobStore := jobs.NewPostgresStore(pgxPool)

	questRunner := db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	})
	questCmd := quest.NewCommands(questRunner, time.Now)

	memStore := member.NewPostgresStore(pgxPool)
	base.Authority = memStore.ResolveAuthority
	docRepo := document.NewPostgresReadRepo(pgxPool)
	docQ := document.Queries{
		Repo:            docRepo,
		Revisions:       docRepo.ListRevisions,
		Trash:           docRepo.ListTrash,
		BacklinksFn:     docRepo.Backlinks,
		BacklinkCountFn: docRepo.CountBacklinks,
	}
	questRead := quest.NewReadModel(q)
	spatialPG := spatial.NewPostgresQueries(pgxPool)
	charPG := character.NewPostgresQueries(pgxPool)
	sitePG := site.NewPostgresStats(pgxPool)

	services := graph.Services{
		Documents: docQ,
		Quests: quest.Queries{
			Read:           questRead,
			ParticipantsFn: questRead.ListParticipants,
		},
		Members: member.Queries{
			Lookup:         memStore.GetByID,
			ByHandle:       memStore.GetByHandle,
			ListFn:         memStore.List,
			AvailabilityFn: memStore.Availability,
		},
		Site: site.Queries{Stats: sitePG.Stats},
		Spatial: spatial.Queries{
			DocumentScope:  docQ.Scope,
			MapByAtlas:     spatialPG.MapByAtlas,
			ListMapsFn:     spatialPG.ListMaps,
			ListRegionsFn:  spatialPG.ListRegions,
			GameDay:        spatialPG.GameDay,
			MapViewFn:      spatialPG.MapViewPage,
			HexFn:          spatialPG.HexAt,
			RegionCountsFn: spatialPG.RegionCounts,
			MapActivityFn:  spatialPG.MapActivity,
			HexHistoryFn:   spatialPG.HexHistory,
		},
		Characters: character.Queries{
			GetByID:        charPG.GetByID,
			GetByShortCode: charPG.GetByShortCode,
			ListByOwnerFn:  charPG.ListByOwner,
			ListAll:        charPG.List,
		},
		QuestCmd: questCmd,
	}

	services, err := wireProductServices(pgxPool, pool, memStore, []byte(cfg.JWTSecret), services)
	if err != nil {
		slog.Error("product GraphQL wiring failed", "error", err)
		panic("product GraphQL wiring: " + err.Error())
	}
	resolver, err := graph.NewResolver(services)
	if err != nil {
		slog.Error("GraphQL resolver construction failed", "error", err)
		panic("GraphQL resolver: " + err.Error())
	}

	base.Pool = pool
	base.QuestCmd = questCmd
	base.Resolver = resolver
	base.Documents = docQ
	base.Notifications = notification.Queries{Repo: notification.NewPostgresRepository(q)}
	base.NotificationCmd = notification.NewCommands(db.NewRunner(pool, func(tx pgx.Tx) notification.CommandRepository {
		return notification.NewPostgresRepository(dbgen.New(tx))
	}))
	base.Ingest = ingest.NewPostgresStore(pgxPool)
	base.Agent = agent.New(cfg.IngestSecret, agent.NewPostgresStore(pgxPool))
	base.JobStore = jobStore
	base.Members = memStore
	base.SiteStats = func() site.Stats {
		st, err := sitePG.Stats(context.Background())
		if err != nil {
			return site.Stats{}
		}
		return st
	}
	base.MemberMe = func(id string) (member.Member, error) {
		return memStore.GetByID(context.Background(), id)
	}
	return base
}
