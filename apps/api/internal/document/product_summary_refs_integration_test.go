//go:build integration

package document

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func TestSummaryQuestRefsUseAuthoritativeLinksAndCurrentBriefAudience(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player','dm'] WHERE public_id=ANY($1::uuid[])`, []string{frontendReader, frontendArchon}); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=ANY($1::uuid[])`, []string{frontendReader, frontendArchon}); err != nil {
		t.Fatal(err)
	}
	summaryID, emptyID := uuid.NewString(), uuid.NewString()
	for _, id := range []string{summaryID, emptyID} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id,version) SELECT $1::uuid,'summary',($1::uuid)::text,'Linked summary','published','public','Body',id,1 FROM members WHERE public_id=$2`, id, frontendAuthor); err != nil {
			t.Fatal(err)
		}
	}
	quests, briefs := []string{}, []string{}
	base := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	for i, visibility := range []string{"restricted", "public", "public"} {
		questID, briefID := uuid.NewString(), uuid.NewString()
		quests, briefs = append(quests, questID), append(briefs, briefID)
		var policy *string
		if i == 1 {
			deny := "[]"
			policy = &deny
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,policy,body,author_id,version) SELECT $1::uuid,'quest_brief',($1::uuid)::text,$2,'published',$3,$4,'Brief',id,1 FROM members WHERE public_id=$5`, briefID, fmt.Sprintf("Brief %d", i), visibility, policy, frontendAuthor); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,dm_id,document_id,scheduled_at,created_by) SELECT $1,$2,ARRAY['standard'],m.id,d.id,$3,m.id FROM members m,documents d WHERE m.public_id=$4 AND d.public_id=$5`, questID, fmt.Sprintf("QR%d", i), base.Add(time.Duration(i)*time.Hour), frontendAuthor, briefID); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_links(source_id,quest_target_id,relation) SELECT d.id,q.id,'summarizes' FROM documents d,quests q WHERE d.public_id=$1 AND q.public_id=$2`, summaryID, questID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO document_readers(document_id,member_id) SELECT d.id,m.id FROM documents d,members m WHERE d.public_id=$1 AND m.public_id=$2`, briefs[0], frontendReader); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO quest_regions(quest_id,region_id) SELECT q.id,r.id FROM quests q,regions r WHERE q.public_id=$1 AND r.public_id=$2`, quests[0], frontendRegion); err != nil {
		t.Fatal(err)
	}
	repo, _ := NewProductPostgres(fixture.Pool)
	reader, _ := resolve(ctx, frontendReader)
	unrelated, _ := resolve(ctx, frontendArchon)
	for _, item := range []struct {
		actor   auth.Authority
		allowed bool
	}{{reader, true}, {unrelated, false}} {
		view, err := repo.ReadDocumentById(ctx, item.actor, DocumentByIdSpec{Id: briefs[0]})
		if item.allowed {
			if err != nil || view.Title != "Brief 0" {
				t.Fatalf("named reader direct=%+v err=%v", view, err)
			}
		} else {
			frontendErrorCode(t, err, apierr.Forbidden)
		}
		list, err := repo.ReadDocuments(ctx, item.actor, DocumentsSpec{Limit: 50})
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, entry := range list.Items {
			found = found || entry.Id == briefs[0]
		}
		if found != item.allowed {
			t.Fatalf("named reader list found=%v want%v", found, item.allowed)
		}
		derived, err := repo.ReadBatchSummaryDerived(ctx, item.actor, []IDKey{{ID: summaryID}, {ID: emptyID}})
		if err != nil || len(derived) != 2 || derived[0].Err != nil || derived[0].Value == nil {
			t.Fatalf("derived=%+v err=%v", derived, err)
		}
		got := derived[0].Value
		if len(got.Quests) != 3 || got.Quests[0].Id != quests[0] || got.Quests[1].Id != quests[1] || got.Quests[2].Id != quests[2] || got.Quests[0].ShortCode != "QR0" || got.Quests[1].Title != nil || got.Quests[2].Title == nil || *got.Quests[2].Title != "Brief 2" {
			t.Fatalf("authoritative ordered refs=%+v", got.Quests)
		}
		if (got.Quests[0].Title != nil) != item.allowed || (len(got.Regions) == 1) != item.allowed {
			t.Fatalf("restricted title/places crossed audience: %+v %+v", got.Quests, got.Regions)
		}
		wantAt := base.Add(2 * time.Hour)
		if item.allowed {
			wantAt = base
		}
		if got.OccurredAt == nil || !got.OccurredAt.Equal(wantAt) {
			t.Fatalf("hidden schedule affected derived time: %v want %v", got.OccurredAt, wantAt)
		}
		if derived[1].Value == nil || derived[1].Value.Quests == nil || len(derived[1].Value.Quests) != 0 {
			t.Fatalf("empty refs must be []: %+v", derived[1])
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `DELETE FROM document_readers WHERE document_id=(SELECT id FROM documents WHERE public_id=$1)`, briefs[0]); err != nil {
		t.Fatal(err)
	}
	derived, err := repo.ReadBatchSummaryDerived(ctx, reader, []IDKey{{ID: summaryID}})
	if err != nil || derived[0].Value.Quests[0].Title != nil || len(derived[0].Value.Regions) != 0 {
		t.Fatalf("revoked grant retained title/places: %+v err=%v", derived, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player'] WHERE public_id=$1`, frontendReader); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `UPDATE documents SET policy=jsonb_build_array('member:' || $2::text) WHERE public_id=$1`, briefs[0], frontendReader); err != nil {
		t.Fatal(err)
	}
	ordinaryNamed, _ := resolve(ctx, frontendReader)
	view, err := repo.ReadDocumentById(ctx, ordinaryNamed, DocumentByIdSpec{Id: briefs[0]})
	if err != nil || view.Title != "Brief 0" {
		t.Fatalf("explicit Member policy failed for ordinary player: %+v %v", view, err)
	}
	derived, err = repo.ReadBatchSummaryDerived(ctx, ordinaryNamed, []IDKey{{ID: summaryID}})
	if err != nil || derived[0].Value.Quests[0].Title == nil || len(derived[0].Value.Regions) != 1 {
		t.Fatalf("explicit Member summary projection=%+v err=%v", derived, err)
	}
}
