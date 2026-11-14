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

func wireProductServices(pgxPool dbgen.DBTX, pool *db.Pool, memberPool *member.PostgresStore, jwtSecret []byte, legacy graph.Services, ddbClient character.DdbClient) (graph.Services, error) {
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
	if err := wireProductCommands(pool, memberPool, clock, ids, questQueries, &legacy, ddbClient); err != nil {
		return graph.Services{}, err
	}
	return legacy, nil
}

func wireProductCommands(pool *db.Pool, memberPool *member.PostgresStore, clock product.Clock, ids product.IDGenerator, questQueries *quest.ProductQueries, legacy *graph.Services, ddbClient character.DdbClient) error {
	producer := notification.NewProducer()
	ownerID := memberPool.ConfiguredOwnerID()
	if err := wireMemberCharacterDocumentCommands(pool, ownerID, producer, clock, ids, legacy, ddbClient); err != nil {
		return err
	}
	return wireQuestSpatialSiteNotificationCommands(pool, ownerID, producer, clock, ids, questQueries, legacy)
}

func wireMemberCharacterDocumentCommands(pool *db.Pool, ownerID string, producer *notification.Producer, clock product.Clock, ids product.IDGenerator, legacy *graph.Services, ddbClient character.DdbClient) error {
	memberRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (member.ProductCommandRepos, error) {
		return bindMemberCommandRepos(tx, ownerID, producer)
	})
	if err != nil {
		return err
	}
	memberCommands, err := member.NewProductCommands(memberRunner, clock, ids)
	if err != nil {
		return err
	}

	characterRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (character.ProductCommandRepos, error) {
		return bindCharacterCommandRepos(tx, ownerID, ddbClient)
	})
	if err != nil {
		return err
	}
	characterCommands, err := character.NewProductCommands(characterRunner, clock, ids)
	if err != nil {
		return err
	}
	characterCommands.Ddb = ddbClient

	documentRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (document.ProductCommandRepos, error) {
		return bindDocumentCommandRepos(tx, ownerID, producer)
	})
	if err != nil {
		return err
	}
	documentCommands, err := document.NewProductCommands(documentRunner, clock, ids)
	if err != nil {
		return err
	}

	legacy.MemberCommands = memberCommands
	legacy.CharacterCommands = characterCommands
	legacy.DocumentCommands = documentCommands
	return nil
}

func wireQuestSpatialSiteNotificationCommands(pool *db.Pool, ownerID string, producer *notification.Producer, clock product.Clock, ids product.IDGenerator, questQueries *quest.ProductQueries, legacy *graph.Services) error {
	questRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (quest.ProductCommandRepos, error) {
		return bindQuestCommandRepos(tx, ownerID, producer)
	})
	if err != nil {
		return err
	}
	questCommands, err := quest.NewProductCommands(questRunner, clock, ids)
	if err != nil {
		return err
	}
	questCommands.Queries = questQueries

	spatialRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (spatial.ProductCommandRepos, error) {
		return bindSpatialCommandRepos(tx, ownerID, producer)
	})
	if err != nil {
		return err
	}
	spatialCommands, err := spatial.NewProductCommands(spatialRunner, clock, ids)
	if err != nil {
		return err
	}

	siteRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (site.ProductCommandRepos, error) {
		return bindSiteCommandRepos(tx, ownerID, producer)
	})
	if err != nil {
		return err
	}
	siteCommands, err := site.NewProductCommands(siteRunner, clock, ids)
	if err != nil {
		return err
	}

	notificationRunner, err := db.NewProductRunner(pool, func(tx pgx.Tx) (notification.ProductCommandRepos, error) {
		return bindNotificationCommandRepos(tx, ownerID)
	})
	if err != nil {
		return err
	}
	notificationCommands, err := notification.NewProductCommands(notificationRunner, clock)
	if err != nil {
		return err
	}

	legacy.QuestCommands = questCommands
	legacy.SpatialCommands = spatialCommands
	legacy.SiteCommands = siteCommands
	legacy.NotificationCommands = notificationCommands
	return nil
}

type commandCore struct {
	Policy    *auth.Policy
	Authority auth.AuthorityResolver
	Replay    idempotency.Repository
	Audit     *auth.ReceiptOverrideRecorder
}

func bindCommandCore(tx pgx.Tx, ownerID string) (commandCore, error) {
	policy, err := auth.NewPoolPolicy(tx)
	if err != nil {
		return commandCore{}, err
	}
	txStore, err := member.NewFromDBTX(tx, ownerID)
	if err != nil {
		return commandCore{}, err
	}
	replay, err := idempotency.NewRepository(tx)
	if err != nil {
		return commandCore{}, err
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		return commandCore{}, err
	}
	return commandCore{
		Policy:    policy,
		Authority: txStore.ResolveAuthority,
		Replay:    replay,
		Audit:     audit,
	}, nil
}

func bindMemberCommandRepos(tx pgx.Tx, ownerID string, producer *notification.Producer) (member.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return member.ProductCommandRepos{}, err
	}
	pg, err := member.NewProductPostgres(tx)
	if err != nil {
		return member.ProductCommandRepos{}, err
	}
	notice, err := notificationProducerRepos(tx)
	if err != nil {
		return member.ProductCommandRepos{}, err
	}
	return member.ProductCommandRepos{
		Member:    pg,
		Reference: pg,
		Policy:    core.Policy,
		Authority: core.Authority,
		Replay:    core.Replay,
		Producer:  producer,
		Notice:    notice,
		Audit:     core.Audit,
	}, nil
}

func bindCharacterCommandRepos(tx pgx.Tx, ownerID string, ddbClient character.DdbClient) (character.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	pg, err := character.NewProductPostgres(tx)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	pg.Ddb = ddbClient
	memPG, err := member.NewProductPostgres(tx)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	docPG, err := document.NewProductPostgres(tx)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	questPG, err := quest.NewProductPostgres(tx)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	notice, replay, err := notification.NewCommandProducer(tx, core.Replay, notification.RecipientComposition{Character: pg, Document: docPG})
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		return character.ProductCommandRepos{}, err
	}
	return character.ProductCommandRepos{
		Character:   pg,
		Reference:   pg,
		Assessments: memPG,
		Policy:      core.Policy,
		Authority:   core.Authority,
		Replay:      replay,
		Producer:    notification.NewProducer(),
		Notice:      notice,
		Audit:       audit,
		Admissions:  pg,
		Guilds:      docPG,
		Withdrawals: questPG,
	}, nil
}

func bindDocumentCommandRepos(tx pgx.Tx, ownerID string, producer *notification.Producer) (document.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return document.ProductCommandRepos{}, err
	}
	pg, err := document.NewProductPostgres(tx)
	if err != nil {
		return document.ProductCommandRepos{}, err
	}
	notice, replay, err := notification.NewCommandProducer(tx, core.Replay, notification.RecipientComposition{Document: pg})
	if err != nil {
		return document.ProductCommandRepos{}, err
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		return document.ProductCommandRepos{}, err
	}
	return document.ProductCommandRepos{
		Document:  pg,
		Policy:    core.Policy,
		Authority: core.Authority,
		Replay:    replay,
		Producer:  producer,
		Notice:    notice,
		Audit:     audit,
		Mentions:  pg,
	}, nil
}

func bindQuestCommandRepos(tx pgx.Tx, ownerID string, producer *notification.Producer) (quest.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	pg, err := quest.NewProductPostgres(tx)
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	docPG, err := document.NewProductPostgres(tx)
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	charPG, err := character.NewProductPostgres(tx)
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	spatialPG, err := spatial.NewProductPostgres(tx)
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	notice, replay, err := notification.NewCommandProducer(tx, core.Replay, notification.RecipientComposition{Character: charPG, Document: docPG})
	if err != nil {
		return quest.ProductCommandRepos{}, err
	}
	audit, err := auth.NewOverrideRecorder(replay)
	if err != nil {
		return quest.ProductCommandRepos{}, err
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
		Policy:           core.Policy,
		Authority:        core.Authority,
		Replay:           replay,
		Producer:         producer,
		Notice:           notice,
		Audit:            audit,
	}, nil
}

func bindSpatialCommandRepos(tx pgx.Tx, ownerID string, producer *notification.Producer) (spatial.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return spatial.ProductCommandRepos{}, err
	}
	pg, err := spatial.NewProductPostgres(tx)
	if err != nil {
		return spatial.ProductCommandRepos{}, err
	}
	docPG, err := document.NewProductPostgres(tx)
	if err != nil {
		return spatial.ProductCommandRepos{}, err
	}
	notice, err := notificationProducerRepos(tx)
	if err != nil {
		return spatial.ProductCommandRepos{}, err
	}
	return spatial.ProductCommandRepos{
		Map:         pg,
		Region:      pg,
		Time:        pg,
		Policy:      core.Policy,
		Authority:   core.Authority,
		Replay:      core.Replay,
		Producer:    producer,
		Notice:      notice,
		Audit:       core.Audit,
		Locations:   docPG,
		Documents:   docPG,
		Containment: pg,
	}, nil
}

func bindSiteCommandRepos(tx pgx.Tx, ownerID string, producer *notification.Producer) (site.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return site.ProductCommandRepos{}, err
	}
	pg, err := site.NewProductPostgres(tx)
	if err != nil {
		return site.ProductCommandRepos{}, err
	}
	notice, err := notificationProducerRepos(tx)
	if err != nil {
		return site.ProductCommandRepos{}, err
	}
	return site.ProductCommandRepos{
		Operations: pg,
		Site:       pg,
		Policy:     core.Policy,
		Authority:  core.Authority,
		Replay:     core.Replay,
		Producer:   producer,
		Notice:     notice,
		Audit:      core.Audit,
	}, nil
}

func bindNotificationCommandRepos(tx pgx.Tx, ownerID string) (notification.ProductCommandRepos, error) {
	core, err := bindCommandCore(tx, ownerID)
	if err != nil {
		return notification.ProductCommandRepos{}, err
	}
	pg, err := notification.NewProductPostgres(tx)
	if err != nil {
		return notification.ProductCommandRepos{}, err
	}
	docPG, err := document.NewProductPostgres(tx)
	if err != nil {
		return notification.ProductCommandRepos{}, err
	}
	return notification.ProductCommandRepos{
		Notification:     pg,
		Batch:            pg,
		DocumentAudience: docPG,
		Policy:           core.Policy,
		Authority:        core.Authority,
		Replay:           core.Replay,
		Audit:            core.Audit,
	}, nil
}

func notificationProducerRepos(tx pgx.Tx) (notification.ProducerRepos, error) {
	pg, err := notification.NewProductPostgres(tx)
	if err != nil {
		return notification.ProducerRepos{}, err
	}
	return notification.ProducerRepos{
		Writer:      pg,
		Preferences: pg,
		Recipients:  notification.RecipientComposition{},
	}, nil
}
