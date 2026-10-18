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
	QuestHexes           *Loader[quest.QuestHexesKey, quest.HexList]
	QuestRegions         *Loader[quest.QuestRegionsKey, quest.RegionIDList]
	Arcs                 *Loader[quest.IDKey, quest.QuestArcView]
	ArcQuests            *Loader[quest.ArcQuestsKey, quest.QuestList]
	Delivery             *Loader[quest.IDKey, quest.QuestDiscordDeliveryView]
	MapHexes             *Loader[spatial.MapHexesKey, spatial.HexList]
	MapEdges             *Loader[spatial.MapEdgesKey, spatial.EdgeList]
	MapNodes             *Loader[spatial.MapNodesKey, spatial.NodeList]
	MapNodeEdges         *Loader[spatial.MapNodeEdgesKey, spatial.NodeEdgeList]
	HexLinks             *Loader[spatial.HexLinksKey, spatial.HexLinkList]
	NodeLinks            *Loader[spatial.NodeLinksKey, spatial.NodeLinkList]
	POIs                 *Loader[spatial.POIsKey, spatial.PoiList]
	SummaryDerived       *Loader[document.IDKey, document.SummaryDerivedView]
	NotificationSubjects *Loader[notification.SubjectKey, notification.SubjectProjection]
	RewardEntitlements   *Loader[quest.RewardEntitlementsKey, quest.RewardList]
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
	if l.Members != nil && l.Members.Clear != nil {
		l.Members.Clear()
	}
	if l.Documents != nil && l.Documents.Clear != nil {
		l.Documents.Clear()
	}
	if l.DmTables != nil && l.DmTables.Clear != nil {
		l.DmTables.Clear()
	}
	if l.Characters != nil && l.Characters.Clear != nil {
		l.Characters.Clear()
	}
	if l.Quests != nil && l.Quests.Clear != nil {
		l.Quests.Clear()
	}
	if l.Participants != nil && l.Participants.Clear != nil {
		l.Participants.Clear()
	}
	if l.QuestHexes != nil && l.QuestHexes.Clear != nil {
		l.QuestHexes.Clear()
	}
	if l.QuestRegions != nil && l.QuestRegions.Clear != nil {
		l.QuestRegions.Clear()
	}
	if l.Arcs != nil && l.Arcs.Clear != nil {
		l.Arcs.Clear()
	}
	if l.ArcQuests != nil && l.ArcQuests.Clear != nil {
		l.ArcQuests.Clear()
	}
	if l.Delivery != nil && l.Delivery.Clear != nil {
		l.Delivery.Clear()
	}
	if l.MapHexes != nil && l.MapHexes.Clear != nil {
		l.MapHexes.Clear()
	}
	if l.MapEdges != nil && l.MapEdges.Clear != nil {
		l.MapEdges.Clear()
	}
	if l.MapNodes != nil && l.MapNodes.Clear != nil {
		l.MapNodes.Clear()
	}
	if l.MapNodeEdges != nil && l.MapNodeEdges.Clear != nil {
		l.MapNodeEdges.Clear()
	}
	if l.HexLinks != nil && l.HexLinks.Clear != nil {
		l.HexLinks.Clear()
	}
	if l.NodeLinks != nil && l.NodeLinks.Clear != nil {
		l.NodeLinks.Clear()
	}
	if l.POIs != nil && l.POIs.Clear != nil {
		l.POIs.Clear()
	}
	if l.SummaryDerived != nil && l.SummaryDerived.Clear != nil {
		l.SummaryDerived.Clear()
	}
	if l.NotificationSubjects != nil && l.NotificationSubjects.Clear != nil {
		l.NotificationSubjects.Clear()
	}
	if l.RewardEntitlements != nil && l.RewardEntitlements.Clear != nil {
		l.RewardEntitlements.Clear()
	}
	if l.MemberVoiceChannels != nil && l.MemberVoiceChannels.Clear != nil {
		l.MemberVoiceChannels.Clear()
	}
	if l.MemberRecentSessions != nil && l.MemberRecentSessions.Clear != nil {
		l.MemberRecentSessions.Clear()
	}
	if l.MemberRecentWeeks != nil && l.MemberRecentWeeks.Clear != nil {
		l.MemberRecentWeeks.Clear()
	}
	if l.DocumentSubjects != nil && l.DocumentSubjects.Clear != nil {
		l.DocumentSubjects.Clear()
	}
	if l.ActiveAlerts != nil && l.ActiveAlerts.Clear != nil {
		l.ActiveAlerts.Clear()
	}
}

// BatchProviders exposes domain batch read entry points for request-scoped loaders (K1).
type BatchProviders struct {
	Member         *member.ProductQueries
	Document       *document.ProductQueries
	Character      *character.ProductQueries
	Quest          *quest.ProductQueries
	Notification   *notification.ProductQueries
	Site           *site.ProductQueries
	Spatial        *spatial.ProductQueries
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
		reg.Members = newEntityLoader(state, providers.Member.BatchMembers)
		reg.MemberVoiceChannels = newEntityLoader(state, providers.Member.BatchMemberVoiceChannels)
		reg.MemberRecentSessions = newEntityLoader(state, providers.Member.BatchMemberRecentSessions)
		reg.MemberRecentWeeks = newEntityLoader(state, providers.Member.BatchMemberRecentWeeks)
	}
	if providers.Character != nil {
		reg.Characters = newEntityLoader(state, providers.Character.BatchCharacters)
	}
	if providers.Notification != nil {
		reg.NotificationSubjects = newEntityLoader(state, providers.Notification.BatchNotificationSubjects)
	}
	if providers.Site != nil {
		reg.ActiveAlerts = newEntityLoader(state, providers.Site.BatchActiveAlerts)
	}
	return reg, nil
}

func newEntityLoader[K comparable, V any](
	state *RequestState,
	batch func(context.Context, auth.Authority, []K) ([]product.BatchResult[V], error),
) *Loader[K, V] {
	cache := map[K]*V{}
	var mu sync.Mutex
	loader := &Loader[K, V]{}
	loader.Load = func(ctx context.Context, key K) (*V, error) {
		mu.Lock()
		if v, ok := cache[key]; ok {
			mu.Unlock()
			return v, nil
		}
		mu.Unlock()
		actor, err := state.CurrentAuthority(ctx)
		if err != nil {
			return nil, err
		}
		results, err := batch(ctx, actor, []K{key})
		if err != nil {
			return nil, err
		}
		if len(results) != 1 {
			return nil, errors.New("batch loader correspondence failed")
		}
		if results[0].Err != nil {
			return nil, results[0].Err
		}
		mu.Lock()
		cache[key] = results[0].Value
		mu.Unlock()
		return results[0].Value, nil
	}
	loader.LoadMany = func(ctx context.Context, keys []K) ([]product.BatchResult[V], error) {
		actor, err := state.CurrentAuthority(ctx)
		if err != nil {
			return nil, err
		}
		return batch(ctx, actor, keys)
	}
	loader.Clear = func() {
		mu.Lock()
		clear(cache)
		mu.Unlock()
	}
	return loader
}
