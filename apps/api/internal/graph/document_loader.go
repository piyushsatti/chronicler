package graph

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

func loadDocumentByID(ctx context.Context, id string) (*document.DocumentView, error) {
	return loadOne(ctx, func(l *RequestLoaders) *Loader[document.DocumentKey, document.DocumentView] {
		return l.Documents
	}, "documents", document.DocumentKey{ID: id})
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
