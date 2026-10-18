package graph

import (
	"context"
	"errors"
	"sync"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

const loaderChunkSize = 100

type Loader[K comparable, V any] struct {
	Load     func(context.Context, K) (*V, error)
	LoadMany func(context.Context, []K) ([]product.BatchResult[V], error)
	Clear    func()
}

type RequestLoaders struct {
	Members              *Loader[member.IDKey, member.MemberView]
	Documents            *Loader[document.DocumentKey, document.DocumentView]
	DmTables             *Loader[document.IDKey, document.DocumentView]
	Characters           *Loader[character.IDKey, character.CharacterView]
	Quests               *Loader[quest.IDKey, quest.QuestView]
	Participants         *Loader[quest.ParticipantsKey, quest.ParticipantList]
	QuestPointcrawlLinks *Loader[quest.QuestHexesKey, quest.HexList]
	QuestRegions         *Loader[quest.QuestRegionsKey, quest.RegionIDList]
	Arcs                 *Loader[quest.IDKey, quest.QuestArcView]
	ArcQuests            *Loader[quest.ArcQuestsKey, quest.QuestList]
	Delivery             *Loader[quest.IDKey, quest.QuestDiscordDeliveryView]
	MapNodes             *Loader[spatial.MapNodesKey, spatial.NodeList]
	MapNodeEdges         *Loader[spatial.MapNodeEdgesKey, spatial.NodeEdgeList]
	NodeLinks            *Loader[spatial.NodeLinksKey, spatial.NodeLinkList]
	SummaryDerived       *Loader[document.IDKey, document.SummaryDerivedView]
	NotificationSubjects *Loader[notification.SubjectKey, notification.SubjectProjection]
	MemberVoiceChannels  *Loader[member.MemberVoiceChannelsKey, member.VoiceChannelList]
	MemberRecentSessions *Loader[member.MemberRecentSessionsKey, member.ActivityEventList]
	MemberRecentWeeks    *Loader[member.MemberRecentWeeksKey, member.WeekActivityList]
	DocumentSubjects     *Loader[document.DocumentSubjectsKey, document.SubjectLinkList]
	ActiveAlerts         *Loader[site.ActiveAlertsKey, site.AlertList]
}

func (l *RequestLoaders) clear() {
	if l == nil {
		return
	}
	clearOne := func(c func()) {
		if c != nil {
			c()
		}
	}
	if l.Members != nil {
		clearOne(l.Members.Clear)
	}
	if l.Documents != nil {
		clearOne(l.Documents.Clear)
	}
	if l.DmTables != nil {
		clearOne(l.DmTables.Clear)
	}
	if l.Characters != nil {
		clearOne(l.Characters.Clear)
	}
	if l.Quests != nil {
		clearOne(l.Quests.Clear)
	}
	if l.Participants != nil {
		clearOne(l.Participants.Clear)
	}
	if l.QuestPointcrawlLinks != nil {
		clearOne(l.QuestPointcrawlLinks.Clear)
	}
	if l.QuestRegions != nil {
		clearOne(l.QuestRegions.Clear)
	}
	if l.Arcs != nil {
		clearOne(l.Arcs.Clear)
	}
	if l.ArcQuests != nil {
		clearOne(l.ArcQuests.Clear)
	}
	if l.Delivery != nil {
		clearOne(l.Delivery.Clear)
	}
	if l.MapNodes != nil {
		clearOne(l.MapNodes.Clear)
	}
	if l.MapNodeEdges != nil {
		clearOne(l.MapNodeEdges.Clear)
	}
	if l.NodeLinks != nil {
		clearOne(l.NodeLinks.Clear)
	}
	if l.SummaryDerived != nil {
		clearOne(l.SummaryDerived.Clear)
	}
	if l.NotificationSubjects != nil {
		clearOne(l.NotificationSubjects.Clear)
	}
	if l.MemberVoiceChannels != nil {
		clearOne(l.MemberVoiceChannels.Clear)
	}
	if l.MemberRecentSessions != nil {
		clearOne(l.MemberRecentSessions.Clear)
	}
	if l.MemberRecentWeeks != nil {
		clearOne(l.MemberRecentWeeks.Clear)
	}
	if l.DocumentSubjects != nil {
		clearOne(l.DocumentSubjects.Clear)
	}
	if l.ActiveAlerts != nil {
		clearOne(l.ActiveAlerts.Clear)
	}
}

// BatchProviders exposes domain batch read entry points for request-scoped loaders (K1).
type BatchProviders struct {
	Member       *member.ProductQueries
	Document     *document.ProductQueries
	Character    *character.ProductQueries
	Quest        *quest.ProductQueries
	Notification *notification.ProductQueries
	Site         *site.ProductQueries
	Spatial      *spatial.ProductQueries
}

// LoaderRegistry is the request-scoped loader bundle installed before GraphQL execution.
type LoaderRegistry struct {
	State   *RequestState
	Loaders *RequestLoaders
}

func NewLoaderRegistry(providers BatchProviders, state *RequestState) (*LoaderRegistry, error) {
	loaders, err := NewRequestLoaders(providers, state)
	if err != nil {
		return nil, err
	}
	if err := state.InstallLoaders(loaders); err != nil {
		return nil, err
	}
	return &LoaderRegistry{State: state, Loaders: loaders}, nil
}

func NewRequestLoaders(providers BatchProviders, state *RequestState) (*RequestLoaders, error) {
	if state == nil {
		return nil, errors.New("request state is required")
	}
	reg := &RequestLoaders{}
	if providers.Member != nil {
		reg.Members = newKeyedLoader(state, providers.Member.BatchMembers)
		reg.MemberVoiceChannels = newKeyedLoader(state, providers.Member.BatchMemberVoiceChannels)
		reg.MemberRecentSessions = newKeyedLoader(state, providers.Member.BatchMemberRecentSessions)
		reg.MemberRecentWeeks = newKeyedLoader(state, providers.Member.BatchMemberRecentWeeks)
	}
	if providers.Document != nil {
		reg.Documents = newKeyedLoader(state, providers.Document.BatchDocuments)
		reg.DmTables = newKeyedLoader(state, providers.Document.BatchDmTables)
		reg.SummaryDerived = newKeyedLoader(state, providers.Document.BatchSummaryDerived)
		reg.DocumentSubjects = newKeyedLoader(state, providers.Document.BatchDocumentSubjects)
	}
	if providers.Character != nil {
		reg.Characters = newKeyedLoader(state, providers.Character.BatchCharacters)
	}
	if providers.Quest != nil {
		reg.Quests = newKeyedLoader(state, providers.Quest.BatchQuests)
		reg.Participants = newKeyedLoader(state, providers.Quest.BatchParticipants)
		reg.QuestPointcrawlLinks = newKeyedLoader(state, providers.Quest.BatchQuestPointcrawlLinks)
		reg.QuestRegions = newKeyedLoader(state, providers.Quest.BatchQuestRegions)
		reg.Arcs = newKeyedLoader(state, providers.Quest.BatchArcs)
		reg.ArcQuests = newKeyedLoader(state, providers.Quest.BatchArcQuests)
		reg.Delivery = newKeyedLoader(state, providers.Quest.BatchDelivery)
	}
	if providers.Spatial != nil {
		reg.MapNodes = newKeyedLoader(state, providers.Spatial.BatchMapNodes)
		reg.MapNodeEdges = newKeyedLoader(state, providers.Spatial.BatchMapNodeEdges)
		reg.NodeLinks = newKeyedLoader(state, providers.Spatial.BatchNodeLinks)
	}
	if providers.Notification != nil {
		reg.NotificationSubjects = newKeyedLoader(state, providers.Notification.BatchNotificationSubjects)
	}
	if providers.Site != nil {
		reg.ActiveAlerts = newKeyedLoader(state, providers.Site.BatchActiveAlerts)
	}
	return reg, nil
}

func newKeyedLoader[K comparable, V any](state *RequestState, read func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error)) *Loader[K, V] {
	cache := map[K]product.BatchResult[V]{}
	var mu sync.Mutex
	clearFn := func() {
		mu.Lock()
		cache = map[K]product.BatchResult[V]{}
		mu.Unlock()
	}
	loadMany := func(ctx context.Context, keys []K) ([]product.BatchResult[V], error) {
		if len(keys) == 0 {
			return nil, nil
		}
		actor, err := state.CurrentAuthority(ctx)
		if err != nil {
			return nil, err
		}
		out := make([]product.BatchResult[V], len(keys))
		missing := make([]K, 0, len(keys))
		missingIdx := make([]int, 0, len(keys))
		mu.Lock()
		for i, key := range keys {
			if cached, ok := cache[key]; ok {
				out[i] = cached
				continue
			}
			missing = append(missing, key)
			missingIdx = append(missingIdx, i)
		}
		mu.Unlock()
		if len(missing) == 0 {
			return out, nil
		}
		for start := 0; start < len(missing); start += loaderChunkSize {
			end := start + loaderChunkSize
			if end > len(missing) {
				end = len(missing)
			}
			chunk := missing[start:end]
			chunkIdx := missingIdx[start:end]
			fetched, err := read(ctx, actor, chunk)
			if err != nil {
				return nil, err
			}
			if len(fetched) != len(chunk) {
				return nil, errors.New("batch loader result length mismatch")
			}
			mu.Lock()
			for i, key := range chunk {
				result := fetched[i]
				cache[key] = result
				out[chunkIdx[i]] = result
			}
			mu.Unlock()
		}
		return out, nil
	}
	return &Loader[K, V]{
		Load: func(ctx context.Context, key K) (*V, error) {
			results, err := loadMany(ctx, []K{key})
			if err != nil {
				return nil, err
			}
			if len(results) != 1 {
				return nil, errors.New("batch loader single key mismatch")
			}
			if results[0].Err != nil {
				return nil, results[0].Err
			}
			return results[0].Value, nil
		},
		LoadMany: loadMany,
		Clear:    clearFn,
	}
}
