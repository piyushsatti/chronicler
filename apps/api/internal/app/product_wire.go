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

type productReadStores struct {
	member       *member.ProductPostgres
	character    *character.ProductPostgres
	notification *notification.ProductPostgres
	site         *site.ProductPostgres
	document     *document.ProductPostgres
	quest        *quest.ProductPostgres
	spatial      *spatial.ProductPostgres
}

func newProductReadStores(pgxPool dbgen.DBTX) (productReadStores, error) {
	var stores productReadStores
	var err error
	if stores.member, err = member.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.character, err = character.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.notification, err = notification.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.site, err = site.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.document, err = document.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.quest, err = quest.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	if stores.spatial, err = spatial.NewProductPostgres(pgxPool); err != nil {
		return productReadStores{}, err
	}
	return stores, nil
}

func wireProductServices(pgxPool dbgen.DBTX, pool *db.Pool, memberPool *member.PostgresStore, jwtSecret []byte, legacy graph.Services) (graph.Services, error) {
	policy, err := auth.NewPoolPolicy(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}
	observer, err := auth.NewSafeOverrideObserver(slog.Default())
	if err != nil {
		return graph.Services{}, err
	}
	clock, ids := productClock(), productIDs()

	stores, err := newProductReadStores(pgxPool)
	if err != nil {
		return graph.Services{}, err
	}

	memberQueries, err := member.NewProductQueries(
		member.ProductReadRepos{Member: stores.member, Reference: stores.member, Batch: stores.member},
		policy, clock, observer, member.NewGrantReconciler(),
	)
	if err != nil {
		return graph.Services{}, err
	}
	characterQueries, err := character.NewProductQueries(
		character.ProductReadRepos{Character: stores.character, Reference: stores.character, DocumentAudience: stores.document},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	documentQueries, err := document.NewProductQueries(
		document.ProductReadRepos{Document: stores.document, Batch: stores.document},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	questQueries, err := quest.NewProductQueries(
		quest.ProductReadRepos{Quest: stores.quest, Arc: stores.quest, Batch: stores.quest, DocumentAudience: stores.document, RewardCoverage: stores.quest},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	spatialQueries, err := spatial.NewProductQueries(
		spatial.ProductReadRepos{Map: stores.spatial, Region: stores.spatial, Time: stores.spatial, Batch: stores.spatial},
		policy, clock, observer,
	)
	if err != nil {
		return graph.Services{}, err
	}
	siteQueries, err := site.NewProductQueries(
		site.ProductReadRepos{Operations: stores.site, Site: stores.site, Batch: stores.site},
		policy, clock, observer, stores.document,
	)
	if err != nil {
		return graph.Services{}, err
	}
	cursorCodec, err := notification.NewCursorCodec(jwtSecret)
	if err != nil {
		return graph.Services{}, err
	}
	notificationQueries, err := notification.NewProductQueries(
		notification.ProductReadRepos{Notification: stores.notification, Batch: stores.notification, DocumentAudience: stores.document},
		policy, clock, observer, cursorCodec,
	)
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
	if err := wireProductCommands(pool, memberPool, policy, memberPool.ResolveAuthority, clock, ids, questQueries, &legacy); err != nil {
		return graph.Services{}, err
	}
	return legacy, nil
}

func wireProductCommands(pool *db.Pool, memberPool *member.PostgresStore, policy *auth.Policy, authority auth.AuthorityResolver, clock product.Clock, ids product.IDGenerator, questQueries *quest.ProductQueries, legacy *graph.Services) error {
	producer := notification.NewProducer()
	memberRunner := db.NewRunner(pool, func(tx pgx.Tx) member.ProductCommandRepos {
		return bindMemberCommandRepos(tx, policy, memberPool, producer)
	})
	memberCommands, err := member.NewProductCommands(memberRunner, clock, ids)
	if err != nil {
		return err
	}

	characterRunner := db.NewRunner(pool, func(tx pgx.Tx) character.ProductCommandRepos {
		return bindCharacterCommandRepos(tx, policy, memberPool)
	})
	characterCommands, err := character.NewProductCommands(characterRunner, clock, ids)
	if err != nil {
		return err
	}

	documentRunner := db.NewRunner(pool, func(tx pgx.Tx) document.ProductCommandRepos {
		return bindDocumentCommandRepos(tx, policy, authority, producer)
	})
	documentCommands, err := document.NewProductCommands(documentRunner, clock, ids)
	if err != nil {
		return err
	}

	questRunner := db.NewRunner(pool, func(tx pgx.Tx) quest.ProductCommandRepos {
		return bindQuestCommandRepos(tx, policy, authority, producer)
	})
	questCommands, err := quest.NewProductCommands(questRunner, clock, ids)
	if err != nil {
		return err
	}
	questCommands.Queries = questQueries

	spatialRunner := db.NewRunner(pool, func(tx pgx.Tx) spatial.ProductCommandRepos {
		return bindSpatialCommandRepos(tx, policy, authority, producer)
	})
	spatialCommands, err := spatial.NewProductCommands(spatialRunner, clock, ids)
	if err != nil {
		return err
	}

	siteRunner := db.NewRunner(pool, func(tx pgx.Tx) site.ProductCommandRepos {
		return bindSiteCommandRepos(tx, policy, authority, producer)
	})
	siteCommands, err := site.NewProductCommands(siteRunner, clock, ids)
	if err != nil {
		return err
	}

	notificationRunner := db.NewRunner(pool, func(tx pgx.Tx) notification.ProductCommandRepos {
		return bindNotificationCommandRepos(tx, policy, memberPool)
	})
	notificationCommands, err := notification.NewProductCommands(notificationRunner, clock)
	if err != nil {
		return err
	}

	legacy.MemberCommands = memberCommands
	legacy.DocumentCommands = documentCommands
	legacy.SpatialCommands = spatialCommands
	legacy.CharacterCommands = characterCommands
	legacy.QuestCommands = questCommands
	legacy.SiteCommands = siteCommands
	legacy.NotificationCommands = notificationCommands
	return nil
}

func bindMemberCommandRepos(tx pgx.Tx, policy *auth.Policy, memberPool *member.PostgresStore, producer *notification.Producer) member.ProductCommandRepos {
	pg, _ := member.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	txStore, err := member.NewFromDBTX(tx, memberPool.ConfiguredOwnerID())
	if err != nil {
		panic("member command authority store: " + err.Error())
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("member command override binding: " + err.Error())
	}
	return member.ProductCommandRepos{
		Member:    pg,
		Reference: pg,
		Policy:    policy,
		Authority: txStore.ResolveAuthority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notificationProducerRepos(tx),
		Audit:     audit,
	}
}

func bindCharacterCommandRepos(tx pgx.Tx, policy *auth.Policy, memberPool *member.PostgresStore) character.ProductCommandRepos {
	pg, _ := character.NewProductPostgres(tx)
	memPG, _ := member.NewProductPostgres(tx)
	docPG, _ := document.NewProductPostgres(tx)
	questPG, _ := quest.NewProductPostgres(tx)
	txStore, err := member.NewFromDBTX(tx, memberPool.ConfiguredOwnerID())
	if err != nil {
		panic("character command authority store: " + err.Error())
	}
	replay, _ := idempotency.NewRepository(tx)
	notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: pg, Document: docPG})
	if err != nil {
		panic("character command notification binding: " + err.Error())
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("character command override binding: " + err.Error())
	}
	return character.ProductCommandRepos{
		Character:   pg,
		Reference:   pg,
		Assessments: memPG,
		Policy:      policy,
		Authority:   txStore.ResolveAuthority,
		Replay:      replay,
		Producer:    notification.NewProducer(),
		Notice:      notice,
		Audit:       audit,
		Admissions:  pg,
		Guilds:      docPG,
		Withdrawals: questPG,
	}
}

func bindDocumentCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) document.ProductCommandRepos {
	pg, _ := document.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	notice, replay, _ := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Document: pg})
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("document command override binding: " + err.Error())
	}
	return document.ProductCommandRepos{
		Document:  pg,
		Policy:    policy,
		Authority: authority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notice,
		Audit:     audit,
		Mentions:  pg,
	}
}

func bindQuestCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) quest.ProductCommandRepos {
	pg, _ := quest.NewProductPostgres(tx)
	docPG, _ := document.NewProductPostgres(tx)
	charPG, _ := character.NewProductPostgres(tx)
	spatialPG, _ := spatial.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	notice, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: charPG, Document: docPG})
	if err != nil {
		panic("quest command notification binding: " + err.Error())
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("quest command override binding: " + err.Error())
	}
	return quest.ProductCommandRepos{
		Arc:              pg,
		Quest:            pg,
		Brief:            docPG,
		Summaries:        docPG,
		SummaryDocuments: docPG,
		Rewards:          charPG,
		Characters:       charPG,
		Places:           spatialPG,
		Withdrawals:      pg,
		Policy:           policy,
		Authority:        authority,
		Replay:           replay,
		Producer:         producer,
		Notice:           notice,
		Audit:            audit,
	}
}

func bindSpatialCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) spatial.ProductCommandRepos {
	pg, _ := spatial.NewProductPostgres(tx)
	docPG, _ := document.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("spatial command override binding: " + err.Error())
	}
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
		Documents:   docPG,
		Containment: pg,
	}
}

func bindSiteCommandRepos(tx pgx.Tx, policy *auth.Policy, authority auth.AuthorityResolver, producer *notification.Producer) site.ProductCommandRepos {
	pg, _ := site.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("site command override binding: " + err.Error())
	}
	return site.ProductCommandRepos{
		Operations: pg,
		Site:       pg,
		Policy:     policy,
		Authority:  authority,
		Replay:     replay,
		Producer:   producer,
		Notice:     notificationProducerRepos(tx),
		Audit:      audit,
	}
}

func bindNotificationCommandRepos(tx pgx.Tx, policy *auth.Policy, memberPool *member.PostgresStore) notification.ProductCommandRepos {
	pg, _ := notification.NewProductPostgres(tx)
	docPG, _ := document.NewProductPostgres(tx)
	replay, _ := idempotency.NewRepository(tx)
	txStore, err := member.NewFromDBTX(tx, memberPool.ConfiguredOwnerID())
	if err != nil {
		panic("notification command authority store: " + err.Error())
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		panic("notification command override binding: " + err.Error())
	}
	return notification.ProductCommandRepos{
		Notification:     pg,
		Batch:            pg,
		DocumentAudience: docPG,
		Policy:           policy,
		Authority:        txStore.ResolveAuthority,
		Replay:           replay,
		Audit:            audit,
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
