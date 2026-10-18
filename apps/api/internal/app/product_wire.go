package app

import (
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

func productClock() product.Clock {
	return time.Now
}

func productIDs() product.IDGenerator {
	return func() string { return uuid.NewString() }
}

func wireProductServices(pgxPool dbgen.DBTX, pool *db.Pool, memberPool *member.PostgresStore, jwtSecret []byte, legacy graph.Services) (graph.Services, error) {
	authority := memberPool.ResolveAuthority
	policy, err := auth.NewPoolPolicy(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		return graph.Services{}, err
	}
	clock := productClock()
	ids := productIDs()

	memPG, err := member.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	charPG, err := character.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	notifPG, err := notification.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	sitePG, err := site.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	docPG, err := document.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	questPG, err := quest.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	spatialPG, err := spatial.NewProductPostgres(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}

	memberQueries, err := member.NewProductQueries(
		member.ProductReadRepos{Member: memPG, Social: memPG, Reference: memPG, Batch: memPG},
		policy, clock, observer, member.NewGrantReconciler(),
	)
	if err != nil {
		return graph.Services{}, err
	}
	characterQueries, err := character.NewProductQueries(
		character.ProductReadRepos{Character: charPG, Reference: charPG, Batch: charPG, DocumentAudience: docPG},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	documentQueries, err := document.NewProductQueries(
		document.ProductReadRepos{Document: docPG, Batch: docPG},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	questQueries, err := quest.NewProductQueries(
		quest.ProductReadRepos{Quest: questPG, Batch: questPG, DocumentAudience: docPG, RewardCoverage: questPG},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	spatialQueries, err := spatial.NewProductQueries(
		spatial.ProductReadRepos{Map: spatialPG, Region: spatialPG, Time: spatialPG, Batch: spatialPG},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	siteQueries, err := site.NewProductQueries(
		site.ProductReadRepos{Operations: sitePG, Site: sitePG, Batch: sitePG},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	cursorCodec, err := notification.NewCursorCodec(jwtSecret)
	if err != nil {
		return graph.Services{}, err
	}
	notificationQueries, err := notification.NewProductQueries(
		notification.ProductReadRepos{Notification: notifPG, Batch: notifPG, DocumentAudience: docPG},
		policy, clock, observer, cursorCodec,
	)
	if err != nil {
		return graph.Services{}, err
	}

	producer := notification.NewProducer()
	memberRunner := db.NewRunner(pool, func(tx pgx.Tx) member.ProductCommandRepos {
		return bindMemberCommandRepos(tx, policy, memberPool, producer)
	})
	memberCommands, err := member.NewProductCommands(memberRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}

	characterRunner := db.NewRunner(pool, func(tx pgx.Tx) character.ProductCommandRepos {
		return bindCharacterCommandRepos(tx, policy, authority)
	})
	characterCommands, err := character.NewProductCommands(characterRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}

	documentRunner := db.NewRunner(pool, func(tx pgx.Tx) document.ProductCommandRepos {
		return bindDocumentCommandRepos(tx, policy, authority, producer)
	})
	documentCommands, err := document.NewProductCommands(documentRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}

	questRunner := db.NewRunner(pool, func(tx pgx.Tx) quest.ProductCommandRepos {
		return bindQuestCommandRepos(tx, policy, authority, producer)
	})
	questCommands, err := quest.NewProductCommands(questRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}
	questCommands.Queries = questQueries

	spatialRunner := db.NewRunner(pool, func(tx pgx.Tx) spatial.ProductCommandRepos {
		return bindSpatialCommandRepos(tx, policy, authority, producer)
	})
	spatialCommands, err := spatial.NewProductCommands(spatialRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}

	siteRunner := db.NewRunner(pool, func(tx pgx.Tx) site.ProductCommandRepos {
		return bindSiteCommandRepos(tx, policy, authority, producer)
	})
	siteCommands, err := site.NewProductCommands(siteRunner, clock, ids)
	if err != nil {
		return graph.Services{}, err
	}

	notificationRunner := db.NewRunner(pool, func(tx pgx.Tx) notification.ProductCommandRepos {
		return bindNotificationCommandRepos(tx, policy, memberPool)
	})
	notificationCommands, err := notification.NewProductCommands(notificationRunner, clock)
	if err != nil {
		return graph.Services{}, err
	}

	legacy.MemberQueries = memberQueries
	legacy.DocumentQueries = documentQueries
	legacy.SpatialQueries = spatialQueries
	legacy.CharacterQueries = characterQueries
	legacy.QuestQueries = questQueries
	legacy.SiteQueries = siteQueries
	legacy.NotificationQueries = notificationQueries
	legacy.MemberCommands = memberCommands
	legacy.DocumentCommands = documentCommands
	legacy.SpatialCommands = spatialCommands
	legacy.CharacterCommands = characterCommands
	legacy.QuestCommands = questCommands
	legacy.SiteCommands = siteCommands
	legacy.NotificationCommands = notificationCommands
	return legacy, nil
}

func bindMemberCommandRepos(tx pgx.Tx, policy *auth.Policy, memberPool *member.PostgresStore, producer *notification.Producer) member.ProductCommandRepos {
	pg, _ := member.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	txStore, err := member.NewFromDBTX(tx, memberPool.ConfiguredOwnerID())
	if err != nil {
		panic("member command authority store: " + err.Error())
	}
	return member.ProductCommandRepos{
		Member:    pg,
		Reference: pg,
		Social:    pg,
		Policy:    policy,
		Authority: txStore.ResolveAuthority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notificationProducerRepos(tx),
		Audit:     audit,
	}
}

func bindCharacterCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver) character.ProductCommandRepos {
	pg, _ := character.NewProductPostgres(tx)
	memPG, _ := member.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	return character.ProductCommandRepos{
		Character:   pg,
		Reference:   pg,
		Assessments: memPG,
		Policy:      policy,
		Authority:   authority,
		Replay:      replay,
		Audit:       audit,
	}
}

func bindDocumentCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) document.ProductCommandRepos {
	pg, _ := document.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	return document.ProductCommandRepos{
		Document:  pg,
		Policy:    policy,
		Authority: authority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notificationProducerRepos(tx),
		Audit:     audit,
	}
}

func bindQuestCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) quest.ProductCommandRepos {
	pg, _ := quest.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	return quest.ProductCommandRepos{
		Arc:       pg,
		Quest:     pg,
		Policy:    policy,
		Authority: authority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notificationProducerRepos(tx),
		Audit:     audit,
	}
}

func bindSpatialCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) spatial.ProductCommandRepos {
	pg, _ := spatial.NewProductPostgres(tx)
	docPG, _ := document.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	return spatial.ProductCommandRepos{
		Map:         pg,
		Region:      pg,
		Time:        pg,
		Policy:      policy,
		Authority:   authority,
		Replay:      replay,
		Producer:    producer,
		Notice:      notificationProducerRepos(tx),
		Audit:       audit,
		Locations:   docPG,
		Containment: pg,
	}
}

func bindSiteCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) site.ProductCommandRepos {
	pg, _ := site.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	return site.ProductCommandRepos{
		Operations: pg,
		Site:       pg,
		Policy:     policy,
		Authority: authority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notificationProducerRepos(tx),
		Audit:     audit,
	}
}

func bindNotificationCommandRepos(tx pgx.Tx, policy *auth.Policy, memberPool *member.PostgresStore) notification.ProductCommandRepos {
	pg, _ := notification.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, _ := auth.NewOverrideRecorder(tx)
	txStore, err := member.NewFromDBTX(tx, memberPool.ConfiguredOwnerID())
	if err != nil {
		panic("notification command authority store: " + err.Error())
	}
	return notification.ProductCommandRepos{
		Notification: pg,
		Policy:       policy,
		Authority:    txStore.ResolveAuthority,
		Replay:       replay,
		Audit:        audit,
	}
}

func notificationProducerRepos(tx pgx.Tx) notification.ProducerRepos {
	pg, _ := notification.NewProductPostgres(tx)
	return notification.ProducerRepos{
		Writer:      pg,
		Preferences: pg,
		Recipients:  notification.RecipientComposition{},
	}
}
