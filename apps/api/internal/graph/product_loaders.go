package graph

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

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
	Participants         *Loader[quest.ParticipantsKey, quest.ParticipantList]
	QuestPointcrawlLinks *Loader[quest.QuestHexesKey, quest.HexList]
	Arcs                 *Loader[quest.IDKey, quest.QuestArcView]
	ArcQuests            *Loader[quest.ArcQuestsKey, quest.QuestList]
	Delivery             *Loader[quest.IDKey, quest.QuestDiscordDeliveryView]
	MapNodes             *Loader[spatial.MapNodesKey, spatial.NodeList]
	MapNodeEdges         *Loader[spatial.MapNodeEdgesKey, spatial.NodeEdgeList]
	NodeLinks            *Loader[spatial.NodeLinksKey, spatial.NodeLinkList]
	SummaryDerived       *Loader[document.IDKey, document.SummaryDerivedView]
	DocumentReaders      *Loader[document.IDKey, document.ReaderIDList]
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
	for _, clear := range []func(){
		loaderClear(l.Members),
		loaderClear(l.Documents),
		loaderClear(l.DmTables),
		loaderClear(l.Participants),
		loaderClear(l.QuestPointcrawlLinks),
		loaderClear(l.Arcs),
		loaderClear(l.ArcQuests),
		loaderClear(l.Delivery),
		loaderClear(l.MapNodes),
		loaderClear(l.MapNodeEdges),
		loaderClear(l.NodeLinks),
		loaderClear(l.SummaryDerived),
		loaderClear(l.DocumentReaders),
		loaderClear(l.NotificationSubjects),
		loaderClear(l.MemberVoiceChannels),
		loaderClear(l.MemberRecentSessions),
		loaderClear(l.MemberRecentWeeks),
		loaderClear(l.DocumentSubjects),
		loaderClear(l.ActiveAlerts),
	} {
		if clear != nil {
			clear()
		}
	}
}

func loaderClear[K comparable, V any](loader *Loader[K, V]) func() {
	if loader == nil {
		return nil
	}
	return loader.Clear
}

// BatchProviders exposes domain batch read entry points for request-scoped loaders (K1).
type BatchProviders struct {
	Member       *member.ProductQueries
	Document     *document.ProductQueries
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
		reg.DocumentReaders = newKeyedLoader(state, providers.Document.BatchReaderIds)
		reg.DocumentSubjects = newKeyedLoader(state, providers.Document.BatchDocumentSubjects)
	}
	if providers.Quest != nil {
		reg.Participants = newKeyedLoader(state, providers.Quest.BatchParticipants)
		reg.QuestPointcrawlLinks = newKeyedLoader(state, providers.Quest.BatchQuestPointcrawlLinks)
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

type loaderEntry[K comparable, V any] struct {
	key    K
	done   chan struct{}
	result product.BatchResult[V]
	err    error
}

type loaderBatch[K comparable, V any] struct {
	ctx     context.Context
	entries []*loaderEntry[K, V]
}

type keyedLoader[K comparable, V any] struct {
	state   *RequestState
	read    func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error)
	entries map[K]*loaderEntry[K, V]
	pending *loaderBatch[K, V]
	mu      sync.Mutex
}

func newKeyedLoader[K comparable, V any](state *RequestState, read func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error)) *Loader[K, V] {
	l := &keyedLoader[K, V]{state: state, read: read, entries: map[K]*loaderEntry[K, V]{}}
	return &Loader[K, V]{Load: l.load, LoadMany: l.loadMany, Clear: l.clear}
}

func (l *keyedLoader[K, V]) complete(items []*loaderEntry[K, V], results []product.BatchResult[V], err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for i, item := range items {
		item.err = err
		if err == nil {
			item.result = results[i]
		} else if l.entries[item.key] == item {
			delete(l.entries, item.key)
		}
		close(item.done)
	}
}

func (l *keyedLoader[K, V]) dispatch(work *loaderBatch[K, V]) {
	l.mu.Lock()
	if l.pending == work {
		l.pending = nil
	}
	l.mu.Unlock()
	// The batch runs on a timer goroutine, outside gqlgen's resolver recovery:
	// a panicking reader must fail its waiters, not the whole process.
	next := 0
	defer func() {
		if r := recover(); r != nil {
			slog.ErrorContext(work.ctx, "batch loader panic", "panic", r)
			l.complete(work.entries[next:], nil, errors.New("batch loader failed"))
		}
	}()
	actor, err := l.state.CurrentAuthority(work.ctx)
	if err != nil {
		l.complete(work.entries, nil, err)
		return
	}
	for start := 0; start < len(work.entries); start += loaderChunkSize {
		next = start
		items := work.entries[start:min(start+loaderChunkSize, len(work.entries))]
		keys := make([]K, len(items))
		for i, item := range items {
			keys[i] = item.key
		}
		results, err := l.read(work.ctx, actor, keys)
		if err == nil && len(results) != len(items) {
			err = errors.New("batch loader result length mismatch")
		}
		if err != nil {
			l.complete(work.entries[start:], nil, err)
			return
		}
		l.complete(items, results, nil)
	}
}

func (l *keyedLoader[K, V]) loadMany(ctx context.Context, keys []K) ([]product.BatchResult[V], error) {
	if len(keys) == 0 {
		return nil, nil
	}
	if _, err := l.state.CurrentAuthority(ctx); err != nil {
		return nil, err
	}
	waiters := make([]*loaderEntry[K, V], len(keys))
	l.mu.Lock()
	for i, key := range keys {
		item := l.entries[key]
		if item == nil {
			item = &loaderEntry[K, V]{key: key, done: make(chan struct{})}
			l.entries[key] = item
			if l.pending == nil {
				l.pending = &loaderBatch[K, V]{ctx: ctx}
				work := l.pending
				time.AfterFunc(2*time.Millisecond, func() { l.dispatch(work) })
			}
			l.pending.entries = append(l.pending.entries, item)
		}
		waiters[i] = item
	}
	l.mu.Unlock()
	out := make([]product.BatchResult[V], len(keys))
	for i, item := range waiters {
		select {
		case <-item.done:
			if item.err != nil {
				return nil, item.err
			}
			out[i] = item.result
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return out, nil
}

func (l *keyedLoader[K, V]) load(ctx context.Context, key K) (*V, error) {
	results, err := l.loadMany(ctx, []K{key})
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
}

func (l *keyedLoader[K, V]) clear() {
	l.mu.Lock()
	l.entries = map[K]*loaderEntry[K, V]{}
	l.pending = nil
	l.mu.Unlock()
}
