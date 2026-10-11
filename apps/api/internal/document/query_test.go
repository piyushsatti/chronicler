package document

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type policyReadRepo struct {
	document Document
	readers  map[string]struct{}
}

func (r policyReadRepo) ByID(context.Context, string) (Document, error)   { return r.document, nil }
func (r policyReadRepo) BySlug(context.Context, string) (Document, error) { return r.document, nil }
func (r policyReadRepo) RevisionAuthor(context.Context, string) (string, error) {
	return r.document.AuthorID, nil
}
func (r policyReadRepo) List(_ context.Context, scope ViewerScope, _ ListFilter) ([]Document, int64, error) {
	if !r.document.Readable(scope) {
		return nil, 0, nil
	}
	return []Document{r.document}, 1, nil
}
func (r policyReadRepo) ReaderIDs(context.Context, string) (map[string]struct{}, error) {
	return r.readers, nil
}

func TestQueryPathsDenyAuthorlessDraft(t *testing.T) {
	q := Queries{Repo: policyReadRepo{document: Document{ID: "doc", Slug: "draft", Status: StatusDraft, Body: "private"}}}
	ctx := context.Background()
	if d, err := q.ByID(ctx, "doc"); err != ErrForbidden || d.Body != "" {
		t.Fatalf("ByID returned %+v, %v", d, err)
	}
	if d, err := q.BySlug(ctx, "draft"); err != ErrForbidden || d.Body != "" {
		t.Fatalf("BySlug returned %+v, %v", d, err)
	}
	rows, _, err := q.List(ctx, ListFilter{})
	if err != nil || len(rows) != 0 {
		t.Fatalf("List returned %+v, %v", rows, err)
	}
	// The repository boundary must filter before paging and counting.
}

func TestQueryRestrictedGrantUsesDocumentID(t *testing.T) {
	a, err := auth.NewAuthority("reader", []auth.Role{auth.DM}, "active", "approved")
	if err != nil {
		t.Fatal(err)
	}
	ctx := auth.WithAuthority(context.Background(), a)
	for _, grantedID := range []string{"doc", "author"} {
		q := Queries{Repo: policyReadRepo{document: Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityRestricted, Body: "restricted"}, readers: map[string]struct{}{grantedID: {}}}}
		d, err := q.ByID(ctx, "doc")
		if grantedID == "doc" {
			if err != nil || d.Body != "restricted" {
				t.Fatalf("document grant failed: %+v %v", d, err)
			}
		} else if err != ErrForbidden || d.Body != "" {
			t.Fatalf("author collision admitted: %+v %v", d, err)
		}
	}
}

func TestQueryDoesNotTrustTokenRolesOrIdentityForDrafts(t *testing.T) {
	ctx := auth.WithClaims(context.Background(), auth.Claims{MemberID: "author", Roles: []auth.Role{auth.Admin, auth.DM}})
	q := Queries{Repo: policyReadRepo{document: Document{ID: "doc", AuthorID: "author", Status: StatusDraft, Body: "private"}}}
	if d, err := q.ByID(ctx, "doc"); err != ErrForbidden || d.Body != "" {
		t.Fatalf("unverified identity admitted: %+v %v", d, err)
	}
}

func TestQueryRevokedDMApprovalCannotUseGrant(t *testing.T) {
	q := Queries{Repo: policyReadRepo{document: Document{ID: "doc", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityRestricted, Body: "private"}, readers: map[string]struct{}{"doc": {}}}}
	for _, status := range []string{"", "draft", "pending", "rejected"} {
		a, err := auth.NewAuthority("reader", []auth.Role{auth.DM}, "active", status)
		if err != nil {
			t.Fatal(err)
		}
		if d, err := q.ByID(auth.WithAuthority(context.Background(), a), "doc"); err != ErrForbidden || d.Body != "" {
			t.Fatalf("status %q admitted: %+v %v", status, d, err)
		}
	}
}

func TestBodyProjectionUsesCurrentAuthorityAcrossRequests(t *testing.T) {
	raw := "Visible\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!DM]\n> DM-SECRET"
	for _, policy := range []json.RawMessage{nil, json.RawMessage(`null`), json.RawMessage(`["role:player","role:dm","role:archon"]`)} {
		q := Queries{Repo: policyReadRepo{document: Document{ID: "doc", Slug: "fixture", AuthorID: "author", Status: StatusPublished, Visibility: VisibilityPublic, Body: raw, Policy: policy}}}
		for _, tc := range []struct {
			name, handle, want string
			roles              []auth.Role
		}{
			{"exact current handle", "Exact-Handle", "Visible\n> [!dm:@Exact-Handle]\n> HANDLE-SECRET\n\n> [!redacted]", []auth.Role{auth.Player}},
			{"renamed current handle", "Renamed-Handle", "Visible\n> [!redacted]\n\n> [!redacted]", []auth.Role{auth.Player}},
			{"current DM role", "Other", "Visible\n> [!redacted]\n\n> [!DM]\n> DM-SECRET", []auth.Role{auth.DM}},
			{"current archon role", "Other", "Visible\n> [!redacted]\n\n> [!redacted]", []auth.Role{auth.Role("archon")}},
		} {
			t.Run(string(policy)+"/"+tc.name, func(t *testing.T) {
				a, err := auth.NewAuthorityWithHandle("viewer", tc.roles, "active", "approved", tc.handle)
				if err != nil {
					t.Fatal(err)
				}
				// Each request starts a fresh scope cache; claims cannot restore
				// an old handle or role after the live authority changes.
				ctx := WithScopeCache(auth.WithAuthority(auth.WithClaims(context.Background(), auth.Claims{MemberID: "viewer", Roles: []auth.Role{auth.Admin, auth.DM}}), a))
				id, err := q.ByID(ctx, "doc")
				if err != nil || id.Body != tc.want {
					t.Fatalf("ID body=%q want=%q err=%v", id.Body, tc.want, err)
				}
				slug, err := q.BySlug(ctx, "fixture")
				if err != nil || slug.Body != tc.want {
					t.Fatalf("slug body=%q want=%q err=%v", slug.Body, tc.want, err)
				}
				rows, total, err := q.List(ctx, ListFilter{})
				if err != nil || total != 1 || len(rows) != 1 || rows[0].Body != tc.want {
					t.Fatalf("list=%+v total=%d err=%v", rows, total, err)
				}
				batch, err := (BatchLoader{Queries: q}).LoadMany(ctx, []string{"doc"})
				if err != nil || len(batch) != 1 || batch[0].Body != tc.want {
					t.Fatalf("batch=%+v err=%v", batch, err)
				}
			})
		}
	}
}
