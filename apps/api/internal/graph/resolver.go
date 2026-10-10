package graph

import (
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
	"github.com/piyushsatti/chronicler/apps/api/internal/site"
	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// Services holds read models and commands for GraphQL resolvers.
type Services struct {
	Documents  document.Queries
	Quests     quest.Queries
	Members    member.Queries
	Site       site.Queries
	Spatial    spatial.Queries
	Characters character.Queries
	QuestCmd   quest.Commands
}

type Resolver struct {
	Services Services
}
