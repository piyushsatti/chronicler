package graph

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

func loadDocumentByID(ctx context.Context, id string) (*document.DocumentView, error) {
	loaders, err := requestLoaders(ctx)
	if err != nil {
		return nil, err
	}
	loader, err := requireLoader(loaders.Documents, "documents")
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, document.DocumentKey{ID: id})
}

func readableDocumentID(ctx context.Context, id *string) (*string, error) {
	if id == nil || *id == "" {
		return nil, nil
	}
	view, err := loadDocumentByID(ctx, *id)
	if err != nil || view == nil {
		return nil, err
	}
	return &view.Id, nil
}
