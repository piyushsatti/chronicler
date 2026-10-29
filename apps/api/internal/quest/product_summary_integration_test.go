//go:build integration

package quest

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (f questCloseFixture) summaryInput() UpsertQuestSummarySpec {
	return UpsertQuestSummarySpec{Input: QuestSummaryFields{QuestIds: []string{f.questID}, Title: "The expedition", Body: "We returned safely.", Visibility: "public", Frontmatter: json.RawMessage(`{}`)}}
}

func TestFrontendQuestSummaryUsesActualRelationshipsAndAuthor(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	input := f.summaryInput()
	created, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || created.Kind != "summary" || created.Status != "draft" || created.AuthorId != f.actor.Claims().MemberID {
		t.Fatalf("created=%+v err=%v", created, err)
	}
	var revisions, links int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM document_revisions r WHERE r.document_id=d.id),
		(SELECT count(*) FROM document_links l WHERE l.source_id=d.id AND l.quest_target_id IS NOT NULL)
		FROM documents d WHERE d.public_id=$1`, created.Id).Scan(&revisions, &links); err != nil {
		t.Fatal(err)
	}
	if revisions != 1 || links != 1 {
		t.Fatalf("revisions=%d links=%d", revisions, links)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE documents SET status='published',published_at=now() WHERE public_id=$1`, created.Id); err != nil {
		t.Fatal(err)
	}
	input.Input.DocumentId = &created.Id
	input.Input.ExpectedRevision = &created.Version
	input.Input.Title = "Edited expedition"
	updated, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || updated.Status != "published" || updated.Title != input.Input.Title || updated.Version != created.Version+1 {
		t.Fatalf("updated=%+v err=%v", updated, err)
	}
	commands, members := newQuestCommandHarness(t, f.fixture)
	var ownerID string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT m.public_id::text FROM characters c JOIN members m ON m.id=c.owner_id WHERE c.public_id=$1`, f.characterID).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	player, err := members.ResolveAuthority(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	input.Input.CharacterId = &f.characterID
	_, err = commands.UpsertQuestSummary(ctx, player, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	input.Input.DocumentId = nil
	input.Input.ExpectedRevision = nil
	playerSummary, err := commands.UpsertQuestSummary(ctx, player, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil || playerSummary.AuthorId != ownerID {
		t.Fatalf("player summary=%+v err=%v", playerSummary, err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE quest_participants SET status='withdrawn' WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)`, f.characterID); err != nil {
		t.Fatal(err)
	}
	_, err = commands.UpsertQuestSummary(ctx, player, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
	input.Input.CharacterId = nil
	_, err = commands.UpsertQuestSummary(ctx, player, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
}

func TestFrontendQuestSummaryDisclosesAndValidatesIdentifiedDocument(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	var brief string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT d.public_id::text FROM quests q JOIN documents d ON d.id=q.document_id WHERE q.public_id=$1`, f.questID).Scan(&brief); err != nil {
		t.Fatal(err)
	}
	input := f.summaryInput()
	revision := int32(1)
	input.Input.ExpectedRevision = &revision
	input.Input.DocumentId = &brief
	_, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Invalid)
	missing := uuid.NewString()
	input.Input.DocumentId = &missing
	_, err = f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.NotFound)
	var ownerID string
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT m.public_id::text FROM characters c JOIN members m ON m.id=c.owner_id WHERE c.public_id=$1`, f.characterID).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	private := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id)
		SELECT $1,'summary','private-summary','Private','draft','restricted','Secret',id FROM members WHERE public_id=$2`, private, ownerID); err != nil {
		t.Fatal(err)
	}
	input.Input.DocumentId = &private
	_, err = f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Forbidden)
}

func TestFrontendQuestSummaryReversedLinkEditsUseOneQuestLockOrder(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	other := uuid.NewString()
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,document_id,created_by)
		SELECT $1,'Q-SUMMARY-OTHER',kinds,status,dm_id,scheduled_at,document_id,created_by FROM quests WHERE public_id=$2`, other, f.questID); err != nil {
		t.Fatal(err)
	}
	input := f.summaryInput()
	a, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	input.Input.QuestIds = []string{other}
	b, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	for _, change := range []struct {
		id     string
		quests []string
	}{{a.Id, []string{other, f.questID}}, {b.Id, []string{f.questID, other}}} {
		go func(id string, quests []string) {
			input := f.summaryInput()
			input.Input.DocumentId = &id
			revision := int32(1)
			input.Input.ExpectedRevision = &revision
			input.Input.QuestIds = quests
			_, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
			results <- err
		}(change.id, change.quests)
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := f.fixture.Pool.QueryRow(ctx, `SELECT count(*) FROM document_links l JOIN documents d ON d.id=l.source_id WHERE d.public_id=ANY($1::uuid[]) AND l.quest_target_id IS NOT NULL`, []string{a.Id, b.Id}).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatalf("summary quest links=%d", count)
	}
}

func summarySnapshot(t *testing.T, f questCloseFixture, id string) string {
	t.Helper()
	var state string
	err := f.fixture.Pool.QueryRow(context.Background(), `SELECT jsonb_build_object('document',to_jsonb(d),
		'revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM document_revisions r WHERE r.document_id=d.id),
		'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.target_type,l.target_id,l.relation) FROM document_links l WHERE l.source_id=d.id),
		'receipts',(SELECT jsonb_agg(to_jsonb(receipt) ORDER BY receipt.key) FROM idempotency_keys receipt))::text
		FROM documents d WHERE d.public_id=$1`, id).Scan(&state)
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestFrontendQuestSummaryRevisionConflictAndSafeReplay(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	input := f.summaryInput()
	created, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	input.Input.DocumentId = &created.Id
	input.Input.ExpectedRevision = &created.Version
	input.Input.Body = "First accepted update"
	meta := product.CommandMeta{IdempotencyKey: uuid.NewString()}
	updated, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, meta)
	if err != nil || updated.Version != created.Version+1 {
		t.Fatalf("update=%+v err=%v", updated, err)
	}
	before := summarySnapshot(t, f, created.Id)
	stale := input
	stale.Input.Body = "Stale replacement"
	_, err = f.commands.UpsertQuestSummary(ctx, f.actor, stale, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Conflict)
	if summarySnapshot(t, f, created.Id) != before {
		t.Fatal("stale update changed Document, revisions, links or receipt")
	}
	replay, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, meta)
	if err != nil || replay.Version != updated.Version || replay.EffectiveBody == nil || *replay.EffectiveBody != input.Input.Body {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	if summarySnapshot(t, f, created.Id) != before {
		t.Fatal("replay reran summary effects")
	}
	input.Input.ExpectedRevision = nil
	_, err = f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	assertQuestCloseCode(t, err, apierr.Invalid)
	if summarySnapshot(t, f, created.Id) != before {
		t.Fatal("missing revision changed persisted state")
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE documents SET body='Current authorized projection' WHERE public_id=$1`, created.Id); err != nil {
		t.Fatal(err)
	}
	input.Input.ExpectedRevision = &created.Version
	replay, err = f.commands.UpsertQuestSummary(ctx, f.actor, input, meta)
	if err != nil || replay.EffectiveBody == nil || *replay.EffectiveBody != "Current authorized projection" {
		t.Fatalf("replay did not use current Document projection: %+v %v", replay, err)
	}
}

func TestQuestSummaryReadsProjectBodyForEveryViewer(t *testing.T) {
	f := newQuestCloseFixture(t)
	ctx := context.Background()
	seedViewer := func(handle string, roles []auth.Role, dmStatus string) auth.Authority {
		t.Helper()
		id := uuid.NewString()
		roleNames := make([]string, len(roles))
		for i, role := range roles {
			roleNames[i] = string(role)
		}
		if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles)
			VALUES($1,$2,$2,$2,$3::text[])`, id, handle, roleNames); err != nil {
			t.Fatal(err)
		}
		actor, err := auth.NewAuthorityWithHandle(id, roles, "active", dmStatus, handle)
		if err != nil {
			t.Fatal(err)
		}
		return actor
	}
	member := seedViewer("summary-member", []auth.Role{auth.Player}, "")
	unrelated := seedViewer("summary-unrelated", []auth.Role{auth.Player}, "")
	dm := seedViewer("summary-reader", []auth.Role{auth.DM}, "approved")
	otherDM := seedViewer("summary-other-dm", []auth.Role{auth.DM}, "approved")
	admin := seedViewer("summary-admin", []auth.Role{auth.Admin}, "")
	input := f.summaryInput()
	input.Input.Body = "Public recap.\n\n> [!dm]\n> DM_SENTINEL\n\n> [!dm:@summary-member]\n> MEMBER_SENTINEL"
	public, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	input.Input.Title = "Restricted recap"
	input.Input.Visibility = "restricted"
	input.Input.Body = "READER_SENTINEL"
	restricted, err := f.commands.UpsertQuestSummary(ctx, f.actor, input, product.CommandMeta{IdempotencyKey: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `UPDATE documents SET status='published',published_at=now() WHERE public_id=ANY($1::uuid[])`, []string{public.Id, restricted.Id}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fixture.Pool.Exec(ctx, `INSERT INTO document_readers(document_id,member_id)
		SELECT d.id,m.id FROM documents d,members m WHERE d.public_id=$1 AND m.public_id=$2`, restricted.Id, dm.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	reader, err := NewProductPostgres(f.fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	for _, viewer := range []struct {
		name                   string
		actor                  auth.Authority
		dm, member, restricted bool
	}{
		{"anonymous", auth.Authority{}, false, false, false},
		{"unrelated player", unrelated, false, false, false},
		{"addressed member", member, false, true, false},
		{"approved DM with reader grant", dm, true, false, true},
		{"approved DM without reader grant", otherDM, true, false, false},
		{"author", f.actor, true, true, true},
		{"admin", admin, true, true, true},
	} {
		t.Run(viewer.name, func(t *testing.T) {
			for _, surface := range []string{"questSummaries", "dmSummaries"} {
				t.Run(surface, func(t *testing.T) {
					var items []document.DocumentView
					if surface == "questSummaries" {
						page, err := reader.ReadQuestSummaries(ctx, viewer.actor, QuestSummariesSpec{QuestId: f.questID, Limit: 50, AsOf: time.Now()})
						if err != nil {
							t.Fatal(err)
						}
						items = page.Summaries
					} else {
						page, err := reader.ReadDmSummaries(ctx, viewer.actor, DmSummariesSpec{Filters: &DmSummaryFiltersFields{QuestId: &f.questID}, Limit: 50, AsOf: time.Now()})
						if err != nil {
							t.Fatal(err)
						}
						items = page.Items
						wantTotal := int32(1)
						if viewer.restricted {
							wantTotal++
						}
						if page.Total != wantTotal {
							t.Fatalf("total=%d want=%d", page.Total, wantTotal)
						}
					}
					foundPublic, foundRestricted := false, false
					for _, item := range items {
						if item.EffectiveBody == nil {
							t.Fatalf("summary %s has no projected body", item.Id)
						}
						switch item.Id {
						case public.Id:
							foundPublic = true
							body := *item.EffectiveBody
							if !strings.Contains(body, "Public recap.") || strings.Contains(body, "DM_SENTINEL") != viewer.dm || strings.Contains(body, "MEMBER_SENTINEL") != viewer.member {
								t.Fatalf("body=%q want DM=%t member=%t", body, viewer.dm, viewer.member)
							}
							if item.BodyComplete != (viewer.dm && viewer.member) {
								t.Fatalf("BodyComplete=%t", item.BodyComplete)
							}
						case restricted.Id:
							foundRestricted = true
							if *item.EffectiveBody != "READER_SENTINEL" {
								t.Fatalf("restricted body=%q", *item.EffectiveBody)
							}
						default:
							t.Fatalf("unexpected summary %s", item.Id)
						}
					}
					if !foundPublic || foundRestricted != viewer.restricted {
						t.Fatalf("public=%t restricted=%t want restricted=%t", foundPublic, foundRestricted, viewer.restricted)
					}
				})
			}
		})
	}
}
