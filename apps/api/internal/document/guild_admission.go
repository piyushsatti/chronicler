package document

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func (p *ProductPostgres) ValidateGuild(ctx context.Context, actor auth.Authority, documentID string) (GuildAdmission, error) {
	view, err := p.ReadCommandDocument(ctx, actor, documentID)
	if err != nil {
		return GuildAdmission{}, err
	}
	if view.DeletedAt != nil {
		return GuildAdmission{}, apierr.New(apierr.NotFound, "guild document not found")
	}
	if view.Kind != "codex_entry" {
		return GuildAdmission{}, apierr.New(apierr.Invalid, "guild must reference a Codex document")
	}
	return GuildAdmission{ID: view.Id, Category: view.Category}, nil
}

var _ GuildReader = (*ProductPostgres)(nil)
