package document

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type previewNoDB struct{}

func (previewNoDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("preview must not execute SQL")
}
func (previewNoDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("preview must not execute SQL")
}
func (previewNoDB) QueryRow(context.Context, string, ...any) pgx.Row {
	panic("preview must not execute SQL")
}

func TestPreviewUsesSelectedAudienceWithoutDatabaseOrPrivilegedBodyBypass(t *testing.T) {
	const self = "10000000-0000-4000-8000-000000000001"
	foreign := "10000000-0000-4000-8000-000000000002"
	selfAuthor := self
	body := "PUBLIC\n> [!DM]\n> DM SECRET\n\n> [!dm:@Current]\n> CURRENT SECRET\n\n> [!dm:@Other]\n> FOREIGN SECRET\n\n> [!dm:]\n> MALFORMED SECRET\n\n> [!note]\n> NOTE"
	playerBody := "PUBLIC\n> [!redacted]\n\n> [!dm:@Current]\n> CURRENT SECRET\n\n> [!redacted]\n\n> [!redacted]\n\n> [!note]\n> NOTE"
	dmBody := "PUBLIC\n> [!DM]\n> DM SECRET\n\n> [!dm:@Current]\n> CURRENT SECRET\n\n> [!redacted]\n\n> [!redacted]\n\n> [!note]\n> NOTE"
	actor := func(roles []auth.Role, dmStatus string) auth.Authority {
		t.Helper()
		value, err := auth.NewAuthorityWithHandle(self, roles, "active", dmStatus, "Current")
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	player := actor([]auth.Role{auth.Player}, "")
	verifier := actor([]auth.Role{auth.Player, auth.Verifier}, "")
	dm := actor([]auth.Role{auth.Player, auth.DM}, "approved")
	heldDM := actor([]auth.Role{auth.Player, auth.DM}, "draft")
	admin := actor([]auth.Role{auth.Player, auth.Admin}, "")
	archon := actor([]auth.Role{auth.Player, auth.Archon}, "")
	db := previewNoDB{}
	repo, err := NewProductPostgres(db)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(db)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := auth.NewSafeOverrideObserver(slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	queries, err := NewProductQueries(ProductReadRepos{Document: repo, Batch: repo}, policy, time.Now, observer)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name     string
		actor    auth.Authority
		audience PreviewAudience
		authorID *string
		body     string
		want     string
		code     apierr.Code
	}{
		{name: "verifier plain PLAYER", actor: verifier, audience: PreviewAudiencePlayer, body: "Guide browser current body **safe emphasis**", want: "Guide browser current body **safe emphasis**"},
		{name: "player PLAYER", actor: player, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "verifier PLAYER", actor: verifier, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "DM simulates PLAYER", actor: dm, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "held DM simulates PLAYER", actor: heldDM, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "admin simulates PLAYER", actor: admin, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "archon simulates PLAYER", actor: archon, audience: PreviewAudiencePlayer, body: body, want: playerBody},
		{name: "self author remains PLAYER", actor: player, audience: PreviewAudiencePlayer, authorID: &selfAuthor, body: body, want: playerBody},
		{name: "DM simulates DM", actor: dm, audience: PreviewAudienceDM, body: body, want: dmBody},
		{name: "held DM simulates DM", actor: heldDM, audience: PreviewAudienceDM, body: body, want: dmBody},
		{name: "admin simulates DM", actor: admin, audience: PreviewAudienceDM, body: body, want: dmBody},
		{name: "admin foreign author plaintext", actor: admin, audience: PreviewAudiencePlayer, authorID: &foreign, body: "Plain text", want: "Plain text"},
		{name: "empty body", actor: player, audience: PreviewAudiencePlayer},
		{name: "maximum body", actor: player, audience: PreviewAudiencePlayer, body: strings.Repeat("x", 128*1024), want: strings.Repeat("x", 128*1024)},
		{name: "ordinary unknown callout", actor: player, audience: PreviewAudiencePlayer, body: "> [!unknown-callout]\n> ORDINARY VISIBLE", want: "> [!unknown-callout]\n> ORDINARY VISIBLE"},
		{name: "malformed audience", actor: player, audience: PreviewAudiencePlayer, body: "> [!audience:unknown]\n> HIDDEN", want: "> [!redacted]"},
		{name: "guest domain denied", audience: PreviewAudiencePlayer, body: body, code: apierr.Forbidden},
		{name: "player DM denied", actor: player, audience: PreviewAudienceDM, body: body, code: apierr.Forbidden},
		{name: "verifier DM denied", actor: verifier, audience: PreviewAudienceDM, body: body, code: apierr.Forbidden},
		{name: "archon DM denied", actor: archon, audience: PreviewAudienceDM, body: body, code: apierr.Forbidden},
		{name: "foreign author denied", actor: player, audience: PreviewAudiencePlayer, authorID: &foreign, body: body, code: apierr.Forbidden},
		{name: "oversized body denied", actor: player, audience: PreviewAudiencePlayer, body: strings.Repeat("x", 128*1024+1), code: apierr.Invalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := queries.PreviewBody(t.Context(), tc.actor, PreviewBodySpec{Body: tc.body, Audience: tc.audience, AuthorId: tc.authorID})
			if tc.code != "" {
				failure, ok := errors.AsType[*apierr.Error](err)
				if !ok || failure.Code != tc.code || actual != "" {
					t.Fatalf("body length=%d err=%v, want %s without body", len(actual), err, tc.code)
				}
				return
			}
			if err != nil || actual != tc.want {
				t.Fatalf("body length=%d want length=%d err=%v", len(actual), len(tc.want), err)
			}
		})
	}
}
