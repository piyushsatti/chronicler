//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestProductionChainLegacyArchonAuthorityWithoutDMProfile(t *testing.T) {
	f := newAuthorityDBFixture(t)
	archon := f.member(t, auth.Role("archon"))
	author := f.member(t, auth.Player)
	dmOnly := f.doc(t, "", &author, document.StatusPublished, document.VisibilityDMOnly)
	restricted := f.doc(t, "", &author, document.StatusPublished, document.VisibilityRestricted)
	explicitDM := f.doc(t, "", &author, document.StatusPublished, document.VisibilityPublic)
	prefix := "archon-compatibility-" + uuid.NewString()
	for _, d := range []authorityDBDocument{dmOnly, restricted, explicitDM} {
		f.exec(t, `UPDATE documents SET title=$2 WHERE id=$1`, d.rowID, prefix)
	}
	f.exec(t, `UPDATE documents SET policy='["role:dm"]'::jsonb WHERE id=$1`, explicitDM.rowID)
	token := f.token(t, archon.publicID, auth.Admin, auth.DM)
	a, err := f.runtime.Authority(context.Background(), archon.publicID)
	if err != nil || a.LiveDM() || !a.Claims().Has(auth.Role("archon")) {
		t.Fatalf("archon became global DM authority: claims=%+v liveDM=%v err=%v", a.Claims(), a.LiveDM(), err)
	}
	for _, policy := range []string{"", "null"} {
		t.Run("nullable legacy "+policy, func(t *testing.T) {
			for _, d := range []authorityDBDocument{dmOnly, restricted} {
				if policy == "" {
					f.exec(t, `UPDATE documents SET policy=NULL WHERE id=$1`, d.rowID)
				} else {
					f.exec(t, `UPDATE documents SET policy='null'::jsonb WHERE id=$1`, d.rowID)
				}
			}
			f.assertDocument(t, token, dmOnly, true)
			f.assertDocument(t, token, restricted, false)
			f.assertDocument(t, token, explicitDM, false) // Exact role:dm is not an archon hierarchy.
			f.exec(t, `INSERT INTO document_readers(document_id,member_id) VALUES($1,$2)`, restricted.rowID, archon.rowID)
			f.assertDocument(t, token, restricted, true)
			assertArchonSQLProjection(t, f, token, prefix, []string{dmOnly.publicID, restricted.publicID})
			f.exec(t, `UPDATE members SET roles=ARRAY['player'] WHERE id=$1`, archon.rowID)
			f.assertDocument(t, token, dmOnly, false)
			f.assertDocument(t, token, restricted, false)
			assertArchonSQLProjection(t, f, token, prefix, nil)
			f.exec(t, `UPDATE members SET roles=ARRAY['archon'] WHERE id=$1`, archon.rowID)
			f.assertDocument(t, token, dmOnly, true)
			f.assertDocument(t, token, restricted, true)
			f.exec(t, `DELETE FROM document_readers WHERE document_id=$1 AND member_id=$2`, restricted.rowID, archon.rowID)
			f.assertDocument(t, token, restricted, false)
			assertArchonSQLProjection(t, f, token, prefix, []string{dmOnly.publicID})
			f.assertDocument(t, "", dmOnly, false)
			f.assertDocument(t, "", restricted, false)
		})
	}
	f.exec(t, `UPDATE members SET status='inactive' WHERE id=$1`, archon.rowID)
	w := authorityDBRequest(f.handler, http.MethodGet, "/v1/members/me", token, nil)
	assertAuthorityDBProblem(t, w, 403, "FORBIDDEN")
}

func assertArchonSQLProjection(t *testing.T, f *authorityDBFixture, token, prefix string, want []string) {
	t.Helper()
	data, response := audienceGraph(t, f, token, `query($search:String!){documents(filters:{search:$search},limit:50){total items{id}} search(query:$search,limit:50){documentTotal documents{id}}}`, map[string]any{"search": prefix})
	var docs struct {
		Total int `json:"total"`
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	var search struct {
		Total int `json:"documentTotal"`
		Items []struct {
			ID string `json:"id"`
		} `json:"documents"`
	}
	if err := json.Unmarshal(data["documents"], &docs); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data["search"], &search); err != nil {
		t.Fatal(err)
	}
	ids, hits := []string{}, []string{}
	for _, d := range docs.Items {
		ids = append(ids, d.ID)
	}
	for _, d := range search.Items {
		hits = append(hits, d.ID)
	}
	expected := slices.Clone(want)
	slices.Sort(ids)
	slices.Sort(hits)
	slices.Sort(expected)
	if docs.Total != len(want) || search.Total != len(want) || !slices.Equal(ids, expected) || !slices.Equal(hits, expected) {
		t.Fatalf("legacy archon SQL enumeration/counts differ: %s want=%v", response, want)
	}
}
