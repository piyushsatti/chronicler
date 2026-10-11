//go:build integration

package document

import (
	"context"
	"os"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
)

func TestNativeAudienceSpecificationParity(t *testing.T) {
	if os.Getenv("DATABASE_URL") != "" {
		t.Fatal("audience parity requires dbtest ephemeral Postgres; omit DATABASE_URL")
	}
	pool := dbtest.Pool(t)
	for _, tc := range policyConformanceCases() {
		t.Run(tc.name, func(t *testing.T) {
			docID, _ := db.ParseUUID(tc.doc.ID)
			authorID, _ := db.ParseUUID(tc.doc.AuthorID)
			viewer := SQLScope(tc.scope)
			var policy any
			if len(tc.doc.Policy) > 0 {
				policy = string(tc.doc.Policy)
			}
			var got bool
			err := pool.QueryRow(context.Background(), `SELECT document_readable($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::uuid,$7::text[],$8::text,$9::boolean,$10::boolean,$11::uuid[])`, docID, authorID, string(tc.doc.Status), string(tc.doc.Visibility), policy, viewer.ID, viewer.Roles, viewer.Handle, viewer.Admin, viewer.LiveDM, viewer.Readers).Scan(&got)
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want || got != tc.doc.Readable(tc.scope) {
				t.Fatalf("SQL=%v Go=%v want=%v", got, tc.doc.Readable(tc.scope), tc.want)
			}
		})
	}
}
