package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/agent"
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
)

type API struct {
	Authority     auth.AuthorityResolver
	Pool          *db.Pool
	QuestCmd      quest.Commands
	Resolver      *graph.Resolver
	Ingest        ingest.Store
	Agent         *agent.Service
	JobStore      jobs.Store
	Members       *member.PostgresStore
	Notifications notification.Queries
	Documents     document.Queries
	SiteStats     func(context.Context) (site.Stats, error)
	MemberMe      func(string) (member.Member, error)
}

func Wire(ctx context.Context, cfg config.Config) API {
	mem := API{
		QuestCmd: quest.NewCommands(quest.MemoryRunner(), time.Now),
		SiteStats: func(context.Context) (site.Stats, error) {
			return site.Stats{}, nil
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
		if _, err := cfg.Validate(ctx, nil, nil); err != nil {
			slog.Error("startup configuration invalid", "error", err)
			panic("startup configuration: " + err.Error())
		}
		slog.Warn("database unavailable; using in-memory stores", "error", err)
		return mem
	}
	return wirePostgres(ctx, cfg, pool, mem)
}

func emptyServices(_ quest.Commands) graph.Services {
	return graph.Services{}
}

func wirePostgres(ctx context.Context, cfg config.Config, pool *db.Pool, base API) API {
	pgxPool := pool.Pool
	q := dbgen.New(pgxPool)
	jobStore := jobs.NewPostgresStore(pgxPool)

	questRunner := db.NewRunner(pool, func(tx pgx.Tx) quest.Repository {
		return quest.NewPostgresRepository(dbgen.New(tx))
	})
	questCmd := quest.NewCommands(questRunner, time.Now)

	ownerLookup, err := member.NewFromDBTX(pgxPool, "")
	var ownerID string
	if err == nil {
		ownerID, err = cfg.Validate(ctx, ownerLookup.ResolveAuthority, func(ctx context.Context, discordID string) (string, error) {
			found, err := ownerLookup.GetByDiscordID(ctx, discordID)
			return found.ID, err
		})
	}
	var memStore *member.PostgresStore
	if err == nil {
		memStore, err = member.NewFromDBTX(pgxPool, ownerID)
	}
	if err != nil {
		pool.Close()
		slog.Error("member authority wiring failed", "error", err)
		panic("member authority wiring: " + err.Error())
	}
	base.Authority = memStore.ResolveAuthority
	docRepo := document.NewPostgresReadRepo(pgxPool)
	docQ := document.Queries{
		Repo:      docRepo,
		Revisions: docRepo.ListRevisions,
		Trash:     docRepo.ListTrash,
	}
	sitePG := site.NewPostgresStats(pgxPool)

	services, err := wireProductServices(pgxPool, pool, memStore, []byte(cfg.JWTSecret), graph.Services{})
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
	base.Ingest = ingest.NewPostgresStore(pgxPool)
	base.Agent = agent.New(cfg.IngestSecret, agent.NewPostgresStore(pgxPool))
	base.JobStore = jobStore
	base.Members = memStore
	base.SiteStats = sitePG.Stats
	base.MemberMe = func(id string) (member.Member, error) {
		return memStore.GetByID(context.Background(), id)
	}
	return base
}
