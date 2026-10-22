//go:build integration

package document

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestFrontendGuildAdmissionUsesReadableCodex(t *testing.T) {
	f := dbtest.NewProductFixture(t)
	ctx := context.Background()
	readerID, authorID := uuid.NewString(), uuid.NewString()
	if _, err := f.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name) VALUES($1,'guild-reader','guild-reader','Reader'),($2,'guild-author','guild-author','Author')`, readerID, authorID); err != nil {
		t.Fatal(err)
	}
	actor, err := auth.NewAuthority(readerID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	pg, _ := NewProductPostgres(f.Pool)
	for _, test := range []struct {
		name, kind, visibility string
		category               *string
		deleted, allowed       bool
	}{
		{name: "ordinary Codex", kind: "codex_entry", visibility: "public", allowed: true},
		{name: "legacy guild category", kind: "codex_entry", visibility: "public", category: guildString("Guilds"), allowed: true},
		{name: "hidden", kind: "codex_entry", visibility: "restricted"},
		{name: "wrong kind", kind: "summary", visibility: "public"},
		{name: "tombstone", kind: "codex_entry", visibility: "public", deleted: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			id := uuid.NewString()
			_, err := f.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,category,deleted_at)
          SELECT $1,$2,$3,$3,'published',$4,'Readable body',id,$5,CASE WHEN $6 THEN now() ELSE NULL END FROM members WHERE public_id=$7`, id, test.kind, "guild-"+id, test.visibility, test.category, test.deleted, authorID)
			if err != nil {
				t.Fatal(err)
			}
			admission, err := pg.ValidateGuild(ctx, actor, id)
			if test.allowed {
				if err != nil || admission.ID != id {
					t.Fatalf("admission=%+v err=%v", admission, err)
				}
			} else if err == nil {
				t.Fatalf("accepted invalid guild=%+v", admission)
			}
		})
	}
}
func guildString(s string) *string { return &s }
