package quest

import (
	"context"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dep := range []any{reads.Quest, reads.Arc, reads.Batch, policy, clock, overrideReads} {
		if product.MissingDependency(dep) {
			return nil, apierr.New(apierr.Internal, "quest query dependencies required")
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func admittedBatch[K any, V any](s ProductQueries, ctx context.Context, actor auth.Authority, op auth.Operation, keys []K, read func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error)) ([]product.BatchResult[V], error) {
	observe, err := s.publicRead(ctx, actor, op, "")
	if err != nil {
		return nil, err
	}
	out, err := read(ctx, actor, keys)
	if err != nil {
		return nil, err
	}
	observe()
	return out, nil
}

func (s ProductQueries) BatchQuests(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[QuestView], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchQuests)
}

func (s ProductQueries) BatchParticipants(ctx context.Context, actor auth.Authority, keys []ParticipantsKey) ([]product.BatchResult[ParticipantList], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchParticipants)
}

func (s ProductQueries) BatchQuestHexes(ctx context.Context, actor auth.Authority, keys []QuestHexesKey) ([]product.BatchResult[HexList], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchQuestHexes)
}

// BatchQuestPointcrawlLinks is the N5-aligned loader name for quest↔pointcrawl batch reads.
func (s ProductQueries) BatchQuestPointcrawlLinks(ctx context.Context, actor auth.Authority, keys []QuestHexesKey) ([]product.BatchResult[HexList], error) {
	return s.BatchQuestHexes(ctx, actor, keys)
}

func (s ProductQueries) BatchQuestRegions(ctx context.Context, actor auth.Authority, keys []QuestRegionsKey) ([]product.BatchResult[RegionIDList], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchQuestRegions)
}

func (s ProductQueries) BatchArcs(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[QuestArcView], error) {
	return admittedBatch(s, ctx, actor, "Query.questArc", keys, s.Reads.Batch.ReadBatchArcs)
}

func (s ProductQueries) BatchArcQuests(ctx context.Context, actor auth.Authority, keys []ArcQuestsKey) ([]product.BatchResult[QuestList], error) {
	return admittedBatch(s, ctx, actor, "Query.questArc", keys, s.Reads.Batch.ReadBatchArcQuests)
}

func (s ProductQueries) BatchDelivery(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[QuestDiscordDeliveryView], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchDelivery)
}

func (s ProductQueries) BatchRewardEntitlements(ctx context.Context, actor auth.Authority, keys []RewardEntitlementsKey) ([]product.BatchResult[RewardList], error) {
	return admittedBatch(s, ctx, actor, "Query.quest", keys, s.Reads.Batch.ReadBatchRewardEntitlements)
}

func questQueryPage(limit, offset int32) error {
	if limit <= 0 || offset < 0 {
		return apierr.New(apierr.Invalid, "invalid quest page")
	}
	return nil
}

func (s ProductQueries) authorizeRead(ctx context.Context, actor auth.Authority, request auth.Request, subject string) (func(), error) {
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return nil, err
	}
	if !decision.Allowed {
		return nil, apierr.New(apierr.Forbidden, "quest read forbidden")
	}
	if !decision.UsedOverride {
		return func() {}, nil
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return nil, err
	}
	fact := auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "quest", SubjectID: subject, RuleCode: decision.RuleCode, At: at}
	return func() { s.OverrideReads.Observe(ctx, fact) }, nil
}

func (s ProductQueries) publicRead(ctx context.Context, actor auth.Authority, op auth.Operation, subject string) (func(), error) {
	request, err := auth.ForOperation(op)
	if err != nil {
		return nil, err
	}
	return s.authorizeRead(ctx, actor, request, subject)
}

func (s ProductQueries) questAsOf(value time.Time) (time.Time, error) {
	if !value.IsZero() {
		return value, nil
	}
	return product.UTCNow(s.Clock)
}

func (s ProductQueries) MyQuestSignups(ctx context.Context, actor auth.Authority, spec MyQuestSignupsSpec) (ParticipationPage, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return ParticipationPage{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return ParticipationPage{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.myQuestSignups", actor.Claims().MemberID)
	if err != nil {
		return ParticipationPage{}, err
	}
	value, err := s.Reads.Quest.ReadMyQuestSignups(ctx, actor, spec)
	if err != nil {
		return ParticipationPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) QuestGenreOptions(ctx context.Context, actor auth.Authority, spec QuestGenreOptionsSpec) ([]string, error) {
	observe, err := s.publicRead(ctx, actor, "Query.questGenreOptions", "")
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Quest.ReadQuestGenreOptions(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) OpenQuestSeats(ctx context.Context, actor auth.Authority, spec OpenQuestSeatsSpec) (OpenQuestSeatsResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return OpenQuestSeatsResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return OpenQuestSeatsResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.openQuestSeats", "")
	if err != nil {
		return OpenQuestSeatsResult{}, err
	}
	value, err := s.Reads.Quest.ReadOpenQuestSeats(ctx, actor, spec)
	if err != nil {
		return OpenQuestSeatsResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Quest(ctx context.Context, actor auth.Authority, spec QuestSpec) (*QuestView, error) {
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return nil, err
	}
	spec.AsOf = asOf
	subject := ""
	if spec.Id != nil {
		subject = *spec.Id
	}
	observe, err := s.publicRead(ctx, actor, "Query.quest", subject)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Quest.ReadQuest(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Quests(ctx context.Context, actor auth.Authority, spec QuestsSpec) (QuestListResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return QuestListResult{}, err
	}
	if filters := spec.Filters; filters != nil && filters.ScheduledFrom != nil && filters.ScheduledTo != nil && !filters.ScheduledFrom.Before(*filters.ScheduledTo) {
		return QuestListResult{}, apierr.New(apierr.Invalid, "scheduledFrom must be before scheduledTo")
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return QuestListResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.quests", "")
	if err != nil {
		return QuestListResult{}, err
	}
	value, err := s.Reads.Quest.ReadQuests(ctx, actor, spec)
	if err != nil {
		return QuestListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) QuestBoard(ctx context.Context, actor auth.Authority, spec QuestBoardSpec) (QuestListResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return QuestListResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return QuestListResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.questBoard", "")
	if err != nil {
		return QuestListResult{}, err
	}
	value, err := s.Reads.Quest.ReadQuestBoard(ctx, actor, spec)
	if err != nil {
		return QuestListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) RecentlyClosedQuests(ctx context.Context, actor auth.Authority, spec RecentlyClosedQuestsSpec) (QuestListResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return QuestListResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return QuestListResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.recentlyClosedQuests", "")
	if err != nil {
		return QuestListResult{}, err
	}
	value, err := s.Reads.Quest.ReadRecentlyClosedQuests(ctx, actor, spec)
	if err != nil {
		return QuestListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) QuestStateCounts(ctx context.Context, actor auth.Authority, spec QuestStateCountsSpec) ([]QuestStateCountView, error) {
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return nil, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.questStateCounts", "")
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Quest.ReadQuestStateCounts(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) QuestArc(ctx context.Context, actor auth.Authority, spec QuestArcSpec) (*QuestArcView, error) {
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return nil, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.questArc", spec.Id)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Arc.ReadQuestArc(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) QuestArcs(ctx context.Context, actor auth.Authority, spec QuestArcsSpec) (QuestArcListResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return QuestArcListResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return QuestArcListResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.questArcs", "")
	if err != nil {
		return QuestArcListResult{}, err
	}
	value, err := s.Reads.Arc.ReadQuestArcs(ctx, actor, spec)
	if err != nil {
		return QuestArcListResult{}, err
	}
	observe()
	return value, nil
}

func dmSummariesSubject(spec DmSummariesSpec) string {
	if spec.Filters != nil && spec.Filters.QuestId != nil {
		return *spec.Filters.QuestId
	}
	return ""
}

func (s ProductQueries) QuestSummaries(ctx context.Context, actor auth.Authority, spec QuestSummariesSpec) (QuestSummariesResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return QuestSummariesResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return QuestSummariesResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.questSummaries", spec.QuestId)
	if err != nil {
		return QuestSummariesResult{}, err
	}
	value, err := s.Reads.Quest.ReadQuestSummaries(ctx, actor, spec)
	if err != nil {
		return QuestSummariesResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DmStats(ctx context.Context, actor auth.Authority, spec DmStatsSpec) (*DmStatsView, error) {
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return nil, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.dmStats", spec.MemberId)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Quest.ReadDmStats(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DmSessionHistory(ctx context.Context, actor auth.Authority, spec DmSessionHistorySpec) (DmSessionHistoryResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return DmSessionHistoryResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return DmSessionHistoryResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.dmSessionHistory", spec.MemberId)
	if err != nil {
		return DmSessionHistoryResult{}, err
	}
	value, err := s.Reads.Quest.ReadDmSessionHistory(ctx, actor, spec)
	if err != nil {
		return DmSessionHistoryResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DmSummaries(ctx context.Context, actor auth.Authority, spec DmSummariesSpec) (document.DocumentListResult, error) {
	if err := questQueryPage(spec.Limit, spec.Offset); err != nil {
		return document.DocumentListResult{}, err
	}
	asOf, err := s.questAsOf(spec.AsOf)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	spec.AsOf = asOf
	observe, err := s.publicRead(ctx, actor, "Query.dmSummaries", dmSummariesSubject(spec))
	if err != nil {
		return document.DocumentListResult{}, err
	}
	value, err := s.Reads.Quest.ReadDmSummaries(ctx, actor, spec)
	if err != nil {
		return document.DocumentListResult{}, err
	}
	observe()
	return value, nil
}
