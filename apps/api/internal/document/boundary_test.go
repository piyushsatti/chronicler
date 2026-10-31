package document

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func verifiedContext(t *testing.T, id string, roles []auth.Role) context.Context {
	t.Helper()
	a, err := auth.NewAuthorityWithHandle(id, roles, "active", "approved", "Exact-Handle")
	if err != nil {
		t.Fatal(err)
	}
	return auth.WithAuthority(context.Background(), a)
}

type revisionAuthorRepo struct{ authorID string }

func (r revisionAuthorRepo) RevisionAuthor(context.Context, string) (string, error) {
	return r.authorID, nil
}

func TestPrivilegedCallbacksAreGatedBeforeDelegation(t *testing.T) {
	var revisions, trash int
	q := Queries{Repo: revisionAuthorRepo{authorID: "author"},
		Revisions: func(context.Context, string, int, int) ([]Revision, error) {
			revisions++
			return []Revision{{Title: "raw revision"}}, nil
		},
		Trash: func(context.Context, int, int) ([]TrashItem, error) { trash++; return nil, nil }}
	for _, tc := range []struct {
		name             string
		ctx              context.Context
		revisions, trash bool
		code             apierr.Code
	}{
		{"anonymous", context.Background(), false, false, apierr.Unauthenticated},
		{"token-only admin", auth.WithClaims(context.Background(), auth.Claims{MemberID: "admin", Roles: []auth.Role{auth.Admin}}), false, false, apierr.Unauthenticated},
		{"player", verifiedContext(t, "other", []auth.Role{auth.Player}), false, false, apierr.Forbidden},
		{"DM", verifiedContext(t, "other", []auth.Role{auth.DM}), false, false, apierr.Forbidden},
		{"verifier", verifiedContext(t, "other", []auth.Role{auth.Role("verifier")}), false, false, apierr.Forbidden},
		{"author", verifiedContext(t, "author", []auth.Role{auth.Player}), true, false, apierr.Forbidden},
		{"admin", verifiedContext(t, "admin", []auth.Role{auth.Admin}), true, true, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := revisions
			_, err := q.ListRevisions(tc.ctx, "doc", 50, 0)
			if tc.revisions {
				if err != nil || revisions != before+1 {
					t.Fatalf("author/admin revision err=%v callbacks=%d", err, revisions)
				}
			} else {
				assertBoundaryError(t, err, tc.code)
				if revisions != before {
					t.Fatal("denied revisions delegated")
				}
			}
			before = trash
			_, err = q.ListTrash(tc.ctx, 50, 0)
			if tc.trash {
				if err != nil || trash != before+1 {
					t.Fatalf("admin trash err=%v callbacks=%d", err, trash)
				}
			} else {
				assertBoundaryError(t, err, tc.code)
				if trash != before {
					t.Fatal("denied trash delegated")
				}
			}
		})
	}
}

func assertBoundaryError(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	expected, ok := errors.AsType[*apierr.Error](err)
	if !ok || expected.Code != code {
		t.Fatalf("err=%v want=%s", err, code)
	}
}
