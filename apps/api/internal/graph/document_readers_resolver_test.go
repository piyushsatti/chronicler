package graph

import (
	"context"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDocumentReaderIdsUsesLoaderWhenProjectionAbsent(t *testing.T) {
	authorID := "10000000-0000-4000-8000-000000000001"
	docID := "10000000-0000-4000-8000-000000000015"
	readerID := "10000000-0000-4000-8000-000000000003"
	actor, err := auth.NewAuthority(authorID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	state, err := NewRequestState(auth.Claims{MemberID: authorID}, func(context.Context, string) (auth.Authority, error) {
		return actor, nil
	}, &actor)
	if err != nil {
		t.Fatal(err)
	}
	loader := newKeyedLoader(state, func(ctx context.Context, _ auth.Authority, keys []document.IDKey) ([]product.BatchResult[document.ReaderIDList], error) {
		out := make([]product.BatchResult[document.ReaderIDList], len(keys))
		for i, key := range keys {
			if key.ID != docID {
				t.Fatalf("unexpected key %s", key.ID)
			}
			out[i] = product.BatchResult[document.ReaderIDList]{Value: &document.ReaderIDList{Items: []string{readerID}}}
		}
		return out, nil
	})
	if err := state.InstallLoaders(&RequestLoaders{DocumentReaders: loader}); err != nil {
		t.Fatal(err)
	}
	ctx := WithRequestState(context.Background(), state)
	got, err := (&documentTypeResolver{}).ReaderIds(ctx, &DocumentType{ID: docID, AuthorID: authorID})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != readerID {
		t.Fatalf("got %#v", got)
	}
}

func TestDocumentReaderIdsPrefersParentProjection(t *testing.T) {
	authorID := "10000000-0000-4000-8000-000000000001"
	actor, err := auth.NewAuthority(authorID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	state, err := NewRequestState(auth.Claims{MemberID: authorID}, func(context.Context, string) (auth.Authority, error) {
		return actor, nil
	}, &actor)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithRequestState(context.Background(), state)
	want := []string{"10000000-0000-4000-8000-000000000003"}
	got, err := (&documentTypeResolver{}).ReaderIds(ctx, &DocumentType{
		ID: "10000000-0000-4000-8000-000000000015", AuthorID: authorID, ReaderIds: want,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != want[0] {
		t.Fatalf("got %#v", got)
	}
}

func TestDocumentReaderIdsNullWhenAudienceHidden(t *testing.T) {
	viewer, err := auth.NewAuthority("10000000-0000-4000-8000-000000000099", []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	state, err := NewRequestState(auth.Claims{MemberID: viewer.Claims().MemberID}, func(context.Context, string) (auth.Authority, error) {
		return viewer, nil
	}, &viewer)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithRequestState(context.Background(), state)
	got, err := (&documentTypeResolver{}).ReaderIds(ctx, &DocumentType{
		ID: "10000000-0000-4000-8000-000000000015", AuthorID: "10000000-0000-4000-8000-000000000001",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("got %#v, want nil", got)
	}
}
