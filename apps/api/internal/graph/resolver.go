package graph

import (
	"errors"

	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// Services holds product CQRS providers and transitional legacy read adapters.
type Services struct {
	MemberQueries        *member.ProductQueries
	DocumentQueries      *document.ProductQueries
	SpatialQueries       *spatial.ProductQueries
	CharacterQueries     *character.ProductQueries
	QuestQueries         *quest.ProductQueries
	SiteQueries          *site.ProductQueries
	NotificationQueries  *notification.ProductQueries
	MemberCommands       *member.ProductCommands
	DocumentCommands     *document.ProductCommands
	SpatialCommands      *spatial.ProductCommands
	CharacterCommands    *character.ProductCommands
	QuestCommands        *quest.ProductCommands
	SiteCommands         *site.ProductCommands
	NotificationCommands *notification.ProductCommands
}

type Resolver struct {
	Services       Services
	BatchProviders BatchProviders
}

func NewResolver(services Services) (*Resolver, error) {
	required := []any{
		services.MemberQueries,
		services.DocumentQueries,
		services.SpatialQueries,
		services.CharacterQueries,
		services.QuestQueries,
		services.SiteQueries,
		services.NotificationQueries,
		services.MemberCommands,
		services.DocumentCommands,
		services.SpatialCommands,
		services.CharacterCommands,
		services.QuestCommands,
		services.SiteCommands,
		services.NotificationCommands,
	}
	for _, dep := range required {
		if dep == nil {
			return nil, errors.New("product GraphQL services require all fourteen providers")
		}
	}
	return &Resolver{
		Services: services,
		BatchProviders: BatchProviders{
			Member:       services.MemberQueries,
			Document:     services.DocumentQueries,
			Quest:        services.QuestQueries,
			Notification: services.NotificationQueries,
			Site:         services.SiteQueries,
			Spatial:      services.SpatialQueries,
		},
	}, nil
}
