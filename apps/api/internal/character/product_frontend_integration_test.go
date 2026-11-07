//go:build integration

package character_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"slices"

	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/piyushsatti/chronicler/apps/api/internal/character"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

type frontendCharacterFixture struct {
	db                     *dbtest.ProductFixture
	owner, verifier, admin auth.Authority
	commands               *character.ProductCommands
	ddb                    character.DdbClient
	configuredOwner        string
	region, backstory      string
	decorate               func(character.ProductCommandRepos) character.ProductCommandRepos
}

func newFrontendCharacterFixture(t *testing.T) *frontendCharacterFixture {
	t.Helper()
	f := &frontendCharacterFixture{db: dbtest.NewProductFixture(t)}
	ctx := context.Background()
	for _, who := range []struct {
		handle, role string
		target       *auth.Authority
	}{{"character-owner", "player", &f.owner}, {"character-verifier", "verifier", &f.verifier}, {"character-admin", "admin", &f.admin}} {
		id := uuid.NewString()
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$2,$2,ARRAY[$3]::text[])`, id, who.handle, who.role); err != nil {
			t.Fatal(err)
		}
		a, err := auth.NewAuthority(id, []auth.Role{auth.Role(who.role)}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		*who.target = a
	}
	// Create requires a region and a backstory.
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO regions(name,kind) VALUES('Fixture Region','server') RETURNING public_id::text`).Scan(&f.region); err != nil {
		t.Fatal(err)
	}
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO backstories(name,lore) VALUES('Fixture Backstory','Lore') RETURNING public_id::text`).Scan(&f.backstory); err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPoolPolicy(f.db.Pool)
	if err != nil {
		t.Fatal(err)
	}
	runner := db.NewRunner(f.db.Pool, func(tx pgx.Tx) character.ProductCommandRepos {
		pg, _ := character.NewProductPostgres(tx)
		pg.Ddb = f.ddb
		doc, _ := document.NewProductPostgres(tx)
		quests, _ := quest.NewProductPostgres(tx)
		assessments, _ := member.NewProductPostgres(tx)
		store, _ := member.NewFromDBTX(tx, f.configuredOwner)
		replay, _ := idempotency.NewRepository(tx)
		notices, replay, err := notification.NewCommandProducer(tx, replay, notification.RecipientComposition{Character: pg, Document: doc})
		if err != nil {
			t.Fatal(err)
		}
		audit, _ := auth.NewOverrideRecorder(replay)
		repos := character.ProductCommandRepos{Character: pg, Reference: pg, Policy: policy, Authority: store.ResolveAuthority, Replay: replay, Producer: notification.NewProducer(), Notice: notices, Audit: audit, Guilds: doc, Admissions: pg, Assessments: assessments, Withdrawals: quests}
		if f.decorate != nil {
			repos = f.decorate(repos)
		}
		return repos
	})
	f.commands, err = character.NewProductCommands(runner, time.Now, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	// Submission sync uses this client. Nil stays a fast failure instead of calling D&D Beyond.
	f.commands.Ddb = fixtureDdbSource{current: &f.ddb}
	return f
}

type fixtureDdbSource struct{ current *character.DdbClient }

func (s fixtureDdbSource) Fetch(ctx context.Context, rawURL string) (character.DdbSnapshot, character.DdbProvenance, error) {
	if s.current == nil || *s.current == nil {
		return character.DdbSnapshot{}, character.DdbProvenance{}, character.DdbError{Code: character.DdbErrorUnavailable}
	}
	return (*s.current).Fetch(ctx, rawURL)
}

func commandMeta() product.CommandMeta { return product.CommandMeta{IdempotencyKey: uuid.NewString()} }
func str(s string) *string             { return &s }
func wantCode(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	var expected *apierr.Error
	if !errors.As(err, &expected) || expected.Code != code {
		t.Fatalf("error=%v want=%s", err, code)
	}
}
func (f *frontendCharacterFixture) create(t *testing.T) character.CharacterView {
	t.Helper()
	value, err := f.commands.CreateCharacter(context.Background(), f.owner, character.CreateCharacterSpec{Input: character.CreateCharacterFields{Name: "Frontend Hero", Description: str("Description"), BackgroundText: str("Background"), DdbUrl: str("https://www.dndbeyond.com/characters/152579009"), RegionId: str(f.region), BackstoryId: str(f.backstory)}}, commandMeta())
	if err != nil {
		t.Fatal(err)
	}
	return value
}
func (f *frontendCharacterFixture) snapshot(t *testing.T) string {
	t.Helper()
	var value string
	err := f.db.Pool.QueryRow(context.Background(), `SELECT jsonb_build_object(
      'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM members m),
      'role_changes',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM role_changes r),
      'characters',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM characters c),
      'quests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM quests q),
      'participants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.quest_id,p.character_id) FROM quest_participants p),
      'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM character_progression_ledger l),
      'mirrors',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.character_id) FROM character_ddb_mirrors m),
      'verifications',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM verifications v),
      'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM notifications n),
      'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM background_jobs j),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.key) FROM idempotency_keys r))::text`).Scan(&value)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestApprovedCharacterPromotesGuestAtomically(t *testing.T) {
	ctx := context.Background()
	guestFixture := func(t *testing.T) *frontendCharacterFixture {
		t.Helper()
		f := newFrontendCharacterFixture(t)
		if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['guest','archon'] WHERE public_id=$1::uuid`, f.owner.Claims().MemberID); err != nil {
			t.Fatal(err)
		}
		var err error
		f.owner, err = auth.NewAuthority(f.owner.Claims().MemberID, []auth.Role{auth.Role("guest"), auth.Archon}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	submit := func(t *testing.T, f *frontendCharacterFixture) character.CharacterView {
		t.Helper()
		hero := f.create(t)
		value, err := f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
		if err != nil || value.VerificationSubmittedAt == nil {
			t.Fatalf("submission=%+v err=%v", value, err)
		}
		return value
	}
	assertPromotion := func(t *testing.T, f *frontendCharacterFixture) {
		t.Helper()
		var roles, oldRoles, newRoles []string
		var histories int
		var actor string
		err := f.db.Pool.QueryRow(ctx, `SELECT m.roles,(SELECT count(*) FROM role_changes r WHERE r.member_id=m.id),r.old_roles,r.new_roles,a.public_id::text FROM members m JOIN role_changes r ON r.member_id=m.id JOIN members a ON a.id=r.changed_by WHERE m.public_id=$1::uuid`, f.owner.Claims().MemberID).Scan(&roles, &histories, &oldRoles, &newRoles, &actor)
		if err != nil || !slices.Equal(roles, []string{"archon", "player"}) || histories != 1 || !slices.Equal(oldRoles, []string{"guest", "archon"}) || !slices.Equal(newRoles, roles) || actor != f.verifier.Claims().MemberID {
			t.Fatalf("roles=%v histories=%d old=%v new=%v actor=%s err=%v", roles, histories, oldRoles, newRoles, actor, err)
		}
	}
	t.Run("rejection then approval replay and retirement", func(t *testing.T) {
		f := guestFixture(t)
		hero := submit(t, f)
		spec := character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *hero.VerificationSubmittedAt, Verdict: member.VerificationVerdictRejected}
		if _, err := f.commands.DecideVerification(ctx, f.verifier, spec, commandMeta()); err != nil {
			t.Fatal(err)
		}
		var roles []string
		var histories int
		if err := f.db.Pool.QueryRow(ctx, `SELECT roles,(SELECT count(*) FROM role_changes) FROM members WHERE public_id=$1::uuid`, f.owner.Claims().MemberID).Scan(&roles, &histories); err != nil || !slices.Equal(roles, []string{"guest", "archon"}) || histories != 0 {
			t.Fatalf("rejection roles=%v history=%d err=%v", roles, histories, err)
		}
		reader, _ := character.NewProductPostgres(f.db.Pool)
		current, err := reader.ReadCharacter(ctx, f.owner, character.CharacterSpec{Id: &hero.Id})
		if err != nil {
			t.Fatal(err)
		}
		hero, err = f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: current.UpdatedAt}, commandMeta())
		if err != nil {
			t.Fatal(err)
		}
		spec.ExpectedSubmittedAt, spec.Verdict = *hero.VerificationSubmittedAt, member.VerificationVerdictApproved
		meta := commandMeta()
		approved, err := f.commands.DecideVerification(ctx, f.verifier, spec, meta)
		if err != nil {
			t.Fatal(err)
		}
		assertPromotion(t, f)
		before := f.snapshot(t)
		replay, err := f.commands.DecideVerification(ctx, f.verifier, spec, meta)
		if err != nil || replay.Id != approved.Id || f.snapshot(t) != before {
			t.Fatalf("replay=%+v err=%v", replay, err)
		}
		current, err = reader.ReadCharacter(ctx, f.owner, character.CharacterSpec{Id: &hero.Id})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.commands.RetireCharacter(ctx, f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: current.UpdatedAt}, commandMeta()); err != nil {
			t.Fatal(err)
		}
		if _, err := f.commands.DeleteCharacter(ctx, f.owner, character.DeleteCharacterSpec{CharacterId: hero.Id}, commandMeta()); err != nil {
			t.Fatal(err)
		}
		assertPromotion(t, f)
	})
	t.Run("concurrent first approvals", func(t *testing.T) {
		f := guestFixture(t)
		first, second := submit(t, f), submit(t, f)
		ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		start, done := make(chan struct{}), make(chan error, 2)
		for _, hero := range []character.CharacterView{first, second} {
			go func(hero character.CharacterView) {
				<-start
				_, err := f.commands.DecideVerification(ctx, f.verifier, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *hero.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
				done <- err
			}(hero)
		}
		close(start)
		for range 2 {
			select {
			case err := <-done:
				if err != nil {
					t.Fatal(err)
				}
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			}
		}
		assertPromotion(t, f)
	})
	t.Run("downstream failure rolls back promotion", func(t *testing.T) {
		f := guestFixture(t)
		hero := submit(t, f)
		if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_guest_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected notification failure'; END$$; CREATE TRIGGER reject_guest_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_guest_notice()`); err != nil {
			t.Fatal(err)
		}
		before := f.snapshot(t)
		_, err := f.commands.DecideVerification(ctx, f.verifier, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *hero.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
		if err == nil || f.snapshot(t) != before {
			t.Fatalf("failed notice committed verification or promotion: %v", err)
		}
	})
}

type pausedVerificationPromotion struct {
	character.CharacterWriteRepository
	arrived chan<- struct{}
	resume  <-chan struct{}
}

func (p pausedVerificationPromotion) StoreDecideVerification(ctx context.Context, write character.DecideVerificationWrite) (member.VerificationView, error) {
	// Both commands must hold their actor FK locks before either locks the owner.
	select {
	case p.arrived <- struct{}{}:
	case <-ctx.Done():
		return member.VerificationView{}, ctx.Err()
	}
	select {
	case <-p.resume:
		return p.CharacterWriteRepository.StoreDecideVerification(ctx, write)
	case <-ctx.Done():
		return member.VerificationView{}, ctx.Err()
	}
}

func TestGuestVerifierConcurrentSelfApprovals(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['guest','verifier']::text[] WHERE public_id=$1::uuid`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	var err error
	f.owner, err = auth.NewAuthority(f.owner.Claims().MemberID, []auth.Role{auth.Role("guest"), auth.Verifier}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	heroes := []character.CharacterView{f.create(t), f.create(t)}
	for i, hero := range heroes {
		heroes[i], err = f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
		if err != nil || heroes[i].VerificationSubmittedAt == nil {
			t.Fatalf("submission=%+v err=%v", heroes[i], err)
		}
	}
	arrived, resume := make(chan struct{}, 2), make(chan struct{})
	f.decorate = func(r character.ProductCommandRepos) character.ProductCommandRepos {
		r.Character = pausedVerificationPromotion{r.Character, arrived, resume}
		return r
	}
	done := make(chan error, 2)
	for _, hero := range heroes {
		go func(hero character.CharacterView) {
			_, err := f.commands.DecideVerification(ctx, f.owner, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *hero.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
			done <- err
		}(hero)
	}
	for range 2 {
		select {
		case <-arrived:
		case err := <-done:
			t.Fatalf("approval ended before promotion barrier: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	close(resume)
	for range 2 {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	var roles []string
	var histories, active, assessments, receipts int
	err = f.db.Pool.QueryRow(ctx, `SELECT roles,
		(SELECT count(*) FROM role_changes WHERE member_id=m.id),
		(SELECT count(*) FROM characters WHERE owner_id=m.id AND status='active'),
		(SELECT count(*) FROM verifications v JOIN characters c ON c.id=v.subject_id WHERE v.subject_type='character' AND c.owner_id=m.id AND v.verdict='approved'),
		(SELECT count(*) FROM idempotency_keys WHERE actor_id=m.id AND endpoint='graphql:decideVerification')
		FROM members m WHERE public_id=$1::uuid`, f.owner.Claims().MemberID).Scan(&roles, &histories, &active, &assessments, &receipts)
	if err != nil || !slices.Equal(roles, []string{"verifier", "player"}) || histories != 1 || active != 2 || assessments != 2 || receipts != 2 {
		t.Fatalf("roles=%v histories=%d active=%d assessments=%d receipts=%d err=%v", roles, histories, active, assessments, receipts, err)
	}
}

type pausedMemberRoleBatch struct {
	member.MemberWriteRepository
	arrived chan<- struct{}
	resume  <-chan struct{}
}

func (p pausedMemberRoleBatch) StoreSetMemberRolesBatch(ctx context.Context, write member.SetMemberRolesBatchWrite) ([]member.MemberRoleBatchResultView, error) {
	select {
	case p.arrived <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case <-p.resume:
		return p.MemberWriteRepository.StoreSetMemberRolesBatch(ctx, write)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestGuestApprovalConcurrentMemberRoleBatch(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	// The batch must lock the owner before the verifier in UUID order.
	if f.owner.Claims().MemberID > f.verifier.Claims().MemberID {
		f.owner, f.verifier = f.verifier, f.owner
	}
	for _, who := range []struct {
		target *auth.Authority
		role   auth.Role
	}{{&f.owner, auth.Role("guest")}, {&f.verifier, auth.Verifier}} {
		id := who.target.Claims().MemberID
		if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=$2::text[] WHERE public_id=$1::uuid`, id, []string{string(who.role)}); err != nil {
			t.Fatal(err)
		}
		var err error
		*who.target, err = auth.NewAuthority(id, []auth.Role{who.role}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
	}
	hero := f.create(t)
	hero, err := f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
	if err != nil || hero.VerificationSubmittedAt == nil {
		t.Fatalf("submission=%+v err=%v", hero, err)
	}
	arrived, resume := make(chan struct{}, 2), make(chan struct{})
	f.decorate = func(r character.ProductCommandRepos) character.ProductCommandRepos {
		r.Character = pausedVerificationPromotion{r.Character, arrived, resume}
		return r
	}
	policy, err := auth.NewPoolPolicy(f.db.Pool)
	if err != nil {
		t.Fatal(err)
	}
	runner := db.NewRunner(f.db.Pool, func(tx pgx.Tx) member.ProductCommandRepos {
		pg, _ := member.NewProductPostgres(tx)
		store, _ := member.NewFromDBTX(tx, "")
		replay, _ := idempotency.NewRepository(tx)
		audit, _ := auth.NewOverrideRecorder(replay)
		return member.ProductCommandRepos{Member: pausedMemberRoleBatch{pg, arrived, resume}, Policy: policy, Authority: store.ResolveAuthority, Replay: replay, Audit: audit}
	})
	members, err := member.NewProductCommands(runner, time.Now, uuid.NewString)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 2)
	go func() {
		_, err := f.commands.DecideVerification(ctx, f.verifier, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *hero.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
		done <- err
	}()
	for step := range 2 {
		select {
		case <-arrived:
		case err := <-done:
			t.Fatalf("command ended before overlap barrier: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
		if step == 0 {
			go func() {
				_, err := members.SetMemberRolesBatch(ctx, f.admin, member.SetMemberRolesBatchSpec{Changes: []member.MemberRoleBatchFields{
					{MemberId: f.owner.Claims().MemberID, Roles: []string{"guest", "archon"}},
					{MemberId: f.verifier.Claims().MemberID, Roles: []string{"verifier", "archon"}},
				}}, commandMeta())
				done <- err
			}()
		}
	}
	close(resume)
	for range 2 {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	var roles, verifierRoles []string
	var promotions, active, receipts int
	err = f.db.Pool.QueryRow(ctx, `SELECT roles,
		(SELECT roles FROM members WHERE public_id=$2::uuid),
		(SELECT count(*) FROM role_changes WHERE member_id=m.id AND 'guest'=ANY(old_roles) AND NOT 'guest'=ANY(new_roles) AND 'player'=ANY(new_roles)),
		(SELECT count(*) FROM characters WHERE owner_id=m.id AND status='active'),
		(SELECT count(*) FROM idempotency_keys WHERE endpoint IN ('graphql:decideVerification','graphql:setMemberRolesBatch') AND completed_at IS NOT NULL)
		FROM members m WHERE public_id=$1::uuid`, f.owner.Claims().MemberID, f.verifier.Claims().MemberID).Scan(&roles, &verifierRoles, &promotions, &active, &receipts)
	if err != nil || !slices.Equal(roles, []string{"archon", "player"}) || !slices.Equal(verifierRoles, []string{"archon", "verifier"}) || promotions != 1 || active != 1 || receipts != 2 {
		t.Fatalf("roles=%v verifier=%v promotions=%d active=%d receipts=%d err=%v", roles, verifierRoles, promotions, active, receipts, err)
	}
}

func TestFrontendCharacterOwnerJourneyAndVerification(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	var backstory, catalog string
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO backstories(name,lore) VALUES('Origin','Lore') RETURNING public_id::text`).Scan(&backstory); err != nil {
		t.Fatal(err)
	}
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO creation_catalog(kind,code,name) VALUES('class','test-class','Class') RETURNING public_id::text`).Scan(&catalog); err != nil {
		t.Fatal(err)
	}
	input := character.CreateCharacterSpec{Input: character.CreateCharacterFields{Name: "Same Name", BackstoryId: &backstory, RegionId: str(f.region), CatalogPickIds: []string{catalog}, BackgroundText: str("My origin"), DdbUrl: str("https://www.dndbeyond.com/characters/152579009")}}
	hero, err := f.commands.CreateCharacter(ctx, f.owner, input, commandMeta())
	if err != nil {
		t.Fatal(err)
	}
	second, err := f.commands.CreateCharacter(ctx, f.owner, input, commandMeta())
	if err != nil {
		t.Fatal(err)
	}
	if hero.Status != "pending_approval" || hero.OwnerId != f.owner.Claims().MemberID || hero.ShortCode == second.ShortCode || hero.BackgroundText == nil || *hero.BackgroundText != "My origin" {
		t.Fatalf("create=%+v second=%+v", hero, second)
	}
	var picks int
	if err := f.db.Pool.QueryRow(ctx, `SELECT count(*) FROM character_catalog_picks`).Scan(&picks); err != nil || picks != 2 {
		t.Fatalf("catalog picks=%d err=%v", picks, err)
	}
	before := f.snapshot(t)
	invalid := input
	invalid.Input.CatalogPickIds = []string{uuid.NewString()}
	_, err = f.commands.CreateCharacter(ctx, f.owner, invalid, commandMeta())
	wantCode(t, err, apierr.Invalid)
	if f.snapshot(t) != before {
		t.Fatal("invalid creation persisted state")
	}
	profile := character.UpdateCharacterProfileSpec{CharacterId: hero.Id, Input: character.UpdateCharacterProfileFields{Description: product.Optional[string]{Set: true, Value: str("Edited")}, BackgroundText: product.Optional[string]{Set: true, Value: nil}}}
	_, err = f.commands.UpdateCharacterProfile(ctx, f.admin, profile, commandMeta())
	wantCode(t, err, apierr.Forbidden)
	f.configuredOwner = f.admin.Claims().MemberID
	_, err = f.commands.UpdateCharacterProfile(ctx, f.admin, profile, commandMeta())
	wantCode(t, err, apierr.Forbidden)
	f.configuredOwner = ""
	hero, err = f.commands.UpdateCharacterProfile(ctx, f.owner, profile, commandMeta())
	if err != nil || hero.BackgroundText != nil || hero.Description == nil || *hero.Description != "Edited" {
		t.Fatalf("profile=%+v err=%v", hero, err)
	}
	guild := uuid.NewString()
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,body,author_id) SELECT $1,'codex_entry','character-guild','Guild','published','public','Guild body',id FROM members WHERE public_id=$2`, guild, f.verifier.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	linked, err := f.commands.SetCharacterGuild(ctx, f.owner, character.SetCharacterGuildSpec{CharacterId: hero.Id, GuildId: &guild}, commandMeta())
	if err != nil || linked.GuildId == nil || *linked.GuildId != guild {
		t.Fatalf("guild=%+v err=%v", linked, err)
	}
	unlinked, err := f.commands.SetCharacterGuild(ctx, f.owner, character.SetCharacterGuildSpec{CharacterId: hero.Id}, commandMeta())
	if err != nil || unlinked.GuildId != nil {
		t.Fatalf("unlink=%+v err=%v", unlinked, err)
	}
	xp, err := f.commands.AdjustPcxp(ctx, f.owner, character.AdjustPcxpSpec{CharacterId: hero.Id, Amount: 7, Note: "Played"}, commandMeta())
	if err != nil || xp.Amount == nil || *xp.Amount != 7 {
		t.Fatalf("xp=%+v err=%v", xp, err)
	}
	before = f.snapshot(t)
	_, err = f.commands.AdjustPcxp(ctx, f.owner, character.AdjustPcxpSpec{CharacterId: hero.Id, Amount: -8, Note: "Invalid"}, commandMeta())
	wantCode(t, err, apierr.Conflict)
	if f.snapshot(t) != before {
		t.Fatal("negative XP persisted")
	}
	log, err := f.commands.LogCharacterEvent(ctx, f.owner, character.LogCharacterEventSpec{CharacterId: hero.Id, Body: "Diary"}, commandMeta())
	if err != nil || log.Body != "Diary" {
		t.Fatalf("log=%+v err=%v", log, err)
	}
	downtime, err := f.commands.UpsertDowntimeProject(ctx, f.owner, character.UpsertDowntimeProjectSpec{CharacterId: hero.Id, Input: character.DowntimeFields{Name: "Study", Status: "active", Progress: 1}}, commandMeta())
	if err != nil || downtime.Progress != 1 {
		t.Fatalf("downtime=%+v err=%v", downtime, err)
	}
	reader, _ := character.NewProductPostgres(f.db.Pool)
	current, err := reader.ReadCharacter(ctx, f.owner, character.CharacterSpec{Id: &hero.Id})
	if err != nil {
		t.Fatal(err)
	}
	stale := character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}
	_, err = f.commands.SubmitForVerification(ctx, f.owner, stale, commandMeta())
	wantCode(t, err, apierr.Conflict)
	submitted, err := f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: current.UpdatedAt}, commandMeta())
	if err != nil || submitted.VerificationSubmittedAt == nil {
		t.Fatalf("submitted=%+v err=%v", submitted, err)
	}
	decision := character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *submitted.VerificationSubmittedAt, Verdict: member.VerificationVerdictRejected, Note: str("Revise")}
	meta := commandMeta()
	verdict, err := f.commands.DecideVerification(ctx, f.verifier, decision, meta)
	if err != nil {
		t.Fatal(err)
	}
	before = f.snapshot(t)
	replay, err := f.commands.DecideVerification(ctx, f.verifier, decision, meta)
	if err != nil || replay.Id != verdict.Id || f.snapshot(t) != before {
		t.Fatalf("verification replay=%+v err=%v", replay, err)
	}
	var persistedID, kind string
	if err := f.db.Pool.QueryRow(ctx, `SELECT body::jsonb->'event'->'facts'->>'verificationId',kind FROM notifications`).Scan(&persistedID, &kind); err != nil || persistedID != verdict.Id || kind != "CHARACTER_VERIFICATION_DECIDED" {
		t.Fatalf("notice verification=%s kind=%s err=%v", persistedID, kind, err)
	}
	current, err = reader.ReadCharacter(ctx, f.owner, character.CharacterSpec{Id: &hero.Id})
	if err != nil || current.Status != "pending_approval" || current.VerificationStatus != character.CharacterReviewStatusRejected {
		t.Fatalf("rejected=%+v err=%v", current, err)
	}
	resubmitted, err := f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: current.UpdatedAt}, commandMeta())
	if err != nil || resubmitted.VerificationSubmittedAt.Equal(*submitted.VerificationSubmittedAt) {
		t.Fatalf("resubmit=%+v err=%v", resubmitted, err)
	}
	_, err = f.commands.DecideVerification(ctx, f.verifier, decision, commandMeta())
	wantCode(t, err, apierr.Conflict)
	approved, err := f.commands.DecideVerification(ctx, f.verifier, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *resubmitted.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
	if err != nil || approved.Verdict != "approved" {
		t.Fatalf("approved=%+v err=%v", approved, err)
	}
	current, err = reader.ReadCharacter(ctx, f.owner, character.CharacterSpec{Id: &hero.Id})
	if err != nil || current.Status != "active" || current.VerificationStatus != character.CharacterReviewStatusApproved {
		t.Fatalf("approved state=%+v err=%v", current, err)
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player'] WHERE public_id=$1`, f.verifier.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	_, err = f.commands.DecideVerification(ctx, f.verifier, decision, meta)
	wantCode(t, err, apierr.Forbidden)
}

func (f *frontendCharacterFixture) participation(t *testing.T, heroID, status string, capacity int) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.NewString()
	_, err := f.db.Pool.Exec(ctx, `INSERT INTO documents(kind,slug,title,status,visibility,body,author_id)
      SELECT 'quest_brief',$1,$1,'published','public','Brief',id FROM members WHERE public_id=$2`, "brief-"+id, f.owner.Claims().MemberID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.db.Pool.Exec(ctx, `INSERT INTO quests(public_id,short_code,kinds,status,dm_id,scheduled_at,created_by,slots_max,filled_count,document_id)
      SELECT $1,$2,ARRAY['standard'],'full',m.id,now()+interval '1 day',m.id,$3,$3,d.id FROM members m,documents d WHERE m.public_id=$4 AND d.slug=$5`, id, "Q"+id[:8], capacity, f.owner.Claims().MemberID, "brief-"+id)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.db.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status) SELECT q.id,c.id,c.owner_id,$3 FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, id, heroID, status)
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func (f *frontendCharacterFixture) waiter(t *testing.T, questID, status string, at time.Time) string {
	t.Helper()
	ctx := context.Background()
	id, owner := uuid.NewString(), uuid.NewString()
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1::uuid,$1::text,$2,$2,ARRAY['player'])`, owner, "waiter"+owner[:8]); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status) SELECT $1,$2,$2,id,$3 FROM members WHERE public_id=$4`, id, "C"+id[:8], status, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status,created_at,updated_at) SELECT q.id,c.id,c.owner_id,'waitlisted',$3,$3 FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, questID, id, at); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestFrontendCharacterRetirementMultipleQuestsAtomicReplay(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "complete", true: "second quest failure"}[fail], func(t *testing.T) {
			f := newFrontendCharacterFixture(t)
			ctx := context.Background()
			hero := f.create(t)
			q1 := f.participation(t, hero.Id, "signed_up", 1)
			q2 := f.participation(t, hero.Id, "waitlisted", 1)
			if q2 < q1 {
				q1, q2 = q2, q1
				if _, err := f.db.Pool.Exec(ctx, `UPDATE quest_participants SET status=CASE WHEN quest_id=(SELECT id FROM quests WHERE public_id=$1) THEN 'signed_up' ELSE 'waitlisted' END`, q1); err != nil {
					t.Fatal(err)
				}
			}
			postplay := f.participation(t, hero.Id, "played", 1)
			if _, err := f.db.Pool.Exec(ctx, `UPDATE quests SET status='played' WHERE public_id=$1`, postplay); err != nil {
				t.Fatal(err)
			}
			filler := f.waiter(t, q2, "active", time.Now().Add(-2*time.Hour))
			if _, err := f.db.Pool.Exec(ctx, `UPDATE quest_participants SET status='signed_up' WHERE character_id=(SELECT id FROM characters WHERE public_id=$1)`, filler); err != nil {
				t.Fatal(err)
			}
			old := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
			deleted := f.waiter(t, q1, "active", old.Add(-time.Second))
			if _, err := f.db.Pool.Exec(ctx, `UPDATE characters SET deleted_at=now() WHERE public_id=$1`, deleted); err != nil {
				t.Fatal(err)
			}
			invalid := f.waiter(t, q1, "retired", old)
			eligible := f.waiter(t, q1, "active", old.Add(time.Second))
			tied := f.waiter(t, q1, "active", old.Add(time.Second))
			if tied < eligible {
				eligible = tied
			}
			if fail {
				if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION fail_second_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.quest_id=(SELECT id FROM quests WHERE public_id='`+q2+`'::uuid) AND NEW.status='withdrawn' THEN RAISE EXCEPTION 'injected second quest'; END IF; RETURN NEW; END$$; CREATE TRIGGER fail_second BEFORE UPDATE ON quest_participants FOR EACH ROW EXECUTE FUNCTION fail_second_withdrawal()`); err != nil {
					t.Fatal(err)
				}
			}
			before := f.snapshot(t)
			input := character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}
			meta := commandMeta()
			result, err := f.commands.RetireCharacter(ctx, f.owner, input, meta)
			if fail {
				if err == nil {
					t.Fatal("expected second quest failure")
				}
				if f.snapshot(t) != before {
					t.Fatal("second quest failure left partial effects")
				}
				return
			}
			if err != nil || result.Status != "retired" {
				t.Fatalf("retire=%+v err=%v", result, err)
			}
			var withdrawn, notices, jobs, receipts int
			var promoted, skipped string
			if err := f.db.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM quest_participants WHERE character_id=c.id AND status='withdrawn'),(SELECT count(*) FROM notifications),(SELECT count(*) FROM background_jobs),(SELECT count(*) FROM idempotency_keys) FROM characters c WHERE public_id=$1`, hero.Id).Scan(&withdrawn, &notices, &jobs, &receipts); err != nil {
				t.Fatal(err)
			}
			if err := f.db.Pool.QueryRow(ctx, `SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE c.public_id=$1`, eligible).Scan(&promoted); err != nil {
				t.Fatal(err)
			}
			if err := f.db.Pool.QueryRow(ctx, `SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE c.public_id=$1`, invalid).Scan(&skipped); err != nil {
				t.Fatal(err)
			}
			if withdrawn != 2 || notices != 1 || jobs != 0 || receipts != 2 || promoted != "signed_up" || skipped != "waitlisted" {
				t.Fatalf("withdrawn=%d notices=%d jobs=%d receipts=%d promoted=%s skipped=%s", withdrawn, notices, jobs, receipts, promoted, skipped)
			}
			var filled int
			if err := f.db.Pool.QueryRow(ctx, `SELECT sum(filled_count)::int FROM quests`).Scan(&filled); err != nil || filled != 3 {
				t.Fatalf("filled=%d err=%v", filled, err)
			}
			var historical string
			if err := f.db.Pool.QueryRow(ctx, `SELECT p.status FROM quest_participants p JOIN quests q ON q.id=p.quest_id WHERE q.public_id=$1`, postplay).Scan(&historical); err != nil || historical != "played" {
				t.Fatalf("postplay=%s err=%v", historical, err)
			}
			before = f.snapshot(t)
			_, err = f.commands.RetireCharacter(ctx, f.owner, input, meta)
			if err != nil || f.snapshot(t) != before {
				t.Fatalf("retire replay err=%v", err)
			}
			_, err = f.commands.RetireCharacter(ctx, f.admin, input, meta)
			wantCode(t, err, apierr.Forbidden)
		})
	}
}

type fixtureDdb struct {
	snapshot character.DdbSnapshot
	err      error
}

func (f fixtureDdb) Fetch(context.Context, string) (character.DdbSnapshot, character.DdbProvenance, error) {
	return f.snapshot, character.DdbProvenance{}, f.err
}
func TestFrontendCharacterDdbPreservesLastGoodAndProfile(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	hero := f.create(t)
	payload, err := os.ReadFile("testdata/ddb/published-premade.reduced.json")
	if err != nil {
		t.Fatal(err)
	}
	client, err := character.NewDdbClient(&http.Client{Transport: fixtureTransport{payload: payload}}, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	f.ddb = client
	input := character.SyncCharacterDdbSpec{CharacterId: hero.Id, DdbUrl: "https://www.dndbeyond.com/characters/152579009"}
	good, err := f.commands.SyncCharacterDdb(ctx, f.owner, input, commandMeta())
	if err != nil || !good.Succeeded || good.Character.DdbMirror == nil {
		t.Fatalf("good=%+v err=%v", good, err)
	}
	for _, code := range []character.DdbErrorCode{character.DdbErrorTimeout, character.DdbErrorProviderHTTP, character.DdbErrorUnavailable, character.DdbErrorPayloadDrift} {
		f.ddb = fixtureDdb{err: character.DdbError{Code: code}}
		failed, err := f.commands.SyncCharacterDdb(ctx, f.owner, input, commandMeta())
		if err != nil || failed.Succeeded || failed.SafeError == nil || *failed.SafeError != string(code) || failed.Character.DdbMirror == nil || !failed.Character.DdbMirror.SyncedAt.Equal(*good.Character.DdbMirror.SyncedAt) {
			t.Fatalf("failed=%+v err=%v", failed, err)
		}
	}
	f.ddb = fixtureDdb{snapshot: character.DdbSnapshot{Payload: []byte(`{"level":2,"xp":1,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 2","background":"Soldier","proficiencies":[]}`)}}
	if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_ddb_url() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected URL persistence failure'; END$$; CREATE TRIGGER reject_ddb_url BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION reject_ddb_url()`); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	_, err = f.commands.SyncCharacterDdb(ctx, f.owner, input, commandMeta())
	if err == nil {
		t.Fatal("expected DDB persistence failure")
	}
	if f.snapshot(t) != before {
		t.Fatal("failed DDB URL update committed mirror or receipt")
	}
	if _, err := f.db.Pool.Exec(ctx, `DROP TRIGGER reject_ddb_url ON characters`); err != nil {
		t.Fatal(err)
	}
	_, err = f.commands.UpdateCharacterProfile(ctx, f.owner, character.UpdateCharacterProfileSpec{CharacterId: hero.Id, Input: character.UpdateCharacterProfileFields{Description: product.Optional[string]{Set: true, Value: str("Still editable")}}}, commandMeta())
	if err != nil {
		t.Fatal(err)
	}
}

type churnWithdrawal struct {
	character.QuestWithdrawalWriter
	calls *int
}

func (w churnWithdrawal) PlanOwnedCharacterWithdrawal(ctx context.Context, id string, ids []string) (character.WithdrawalPlan, error) {
	*w.calls++
	return w.QuestWithdrawalWriter.PlanOwnedCharacterWithdrawal(ctx, id, ids)
}
func (w churnWithdrawal) WithdrawOwnedCharacter(context.Context, string, character.WithdrawalPlan, string, time.Time) (character.WithdrawalEffects, error) {
	return character.WithdrawalEffects{}, character.ErrWithdrawalPlanChanged
}
func TestFrontendCharacterRetirementBoundsPlanRetries(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	hero := f.create(t)
	calls := 0
	f.decorate = func(r character.ProductCommandRepos) character.ProductCommandRepos {
		r.Withdrawals = churnWithdrawal{r.Withdrawals, &calls}
		return r
	}
	before := f.snapshot(t)
	_, err := f.commands.RetireCharacter(context.Background(), f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
	wantCode(t, err, apierr.Conflict)
	if calls != 6 || f.snapshot(t) != before {
		t.Fatalf("plan calls=%d or partial state", calls)
	}
}

type fixtureTransport struct{ payload []byte }

func (f fixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(f.payload)), Request: r}, nil
}

type pausedRetirement struct {
	character.CharacterWriteRepository
	locked chan struct{}
	resume chan struct{}
}

func (p pausedRetirement) LockRetireCharacter(ctx context.Context, spec character.RetireCharacterSpec) (character.RetireCharacterState, error) {
	state, err := p.CharacterWriteRepository.LockRetireCharacter(ctx, spec)
	close(p.locked)
	select {
	case <-p.resume:
	case <-ctx.Done():
		return state, ctx.Err()
	}
	return state, err
}
func TestFrontendCharacterRetirementRechecksCurrentAuthority(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	hero := f.create(t)
	locked, resume := make(chan struct{}), make(chan struct{})
	f.decorate = func(r character.ProductCommandRepos) character.ProductCommandRepos {
		r.Character = pausedRetirement{r.Character, locked, resume}
		return r
	}
	before := f.snapshot(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := f.commands.RetireCharacter(ctx, f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
		done <- err
	}()
	select {
	case <-locked:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET status='inactive' WHERE public_id=$1`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	close(resume)
	select {
	case err := <-done:
		wantCode(t, err, apierr.Forbidden)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	// The snapshot covers members, so undo the test's own revocation before comparing.
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET status='active' WHERE public_id=$1`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	if f.snapshot(t) != before {
		t.Fatal("revoked owner committed retirement")
	}
}

func TestFrontendCharacterRetirementConcurrentPromotions(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	first := f.create(t)
	second := f.create(t)
	if _, err := f.db.Pool.Exec(ctx, `UPDATE characters SET status='active' WHERE public_id=ANY($1::uuid[])`, []string{first.Id, second.Id}); err != nil {
		t.Fatal(err)
	}
	q := f.participation(t, first.Id, "signed_up", 1)
	if _, err := f.db.Pool.Exec(ctx, `INSERT INTO quest_participants(quest_id,character_id,member_id,status) SELECT q.id,c.id,c.owner_id,'waitlisted' FROM quests q,characters c WHERE q.public_id=$1 AND c.public_id=$2`, q, second.Id); err != nil {
		t.Fatal(err)
	}
	f.waiter(t, q, "active", time.Now().Add(time.Hour))
	start := make(chan struct{})
	done := make(chan error, 2)
	for _, hero := range []character.CharacterView{first, second} {
		go func(hero character.CharacterView) {
			<-start
			_, err := f.commands.RetireCharacter(ctx, f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
			done <- err
		}(hero)
	}
	close(start)
	for range 2 {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	var retired, filled, signed, duplicate int
	if err := f.db.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM characters WHERE public_id=ANY($1::uuid[]) AND status='retired'),q.filled_count,(SELECT count(*) FROM quest_participants p WHERE p.quest_id=q.id AND status='signed_up'),(SELECT count(*)-count(DISTINCT body) FROM notifications) FROM quests q WHERE public_id=$2`, []string{first.Id, second.Id}, q).Scan(&retired, &filled, &signed, &duplicate); err != nil {
		t.Fatal(err)
	}
	if retired != 2 || filled != signed || filled != 1 || duplicate != 0 {
		t.Fatalf("retired=%d filled=%d signed=%d duplicate=%d", retired, filled, signed, duplicate)
	}
}

func TestFrontendCharacterVerificationNoticeFailureRollsBack(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	hero := f.create(t)
	submitted, err := f.commands.SubmitForVerification(ctx, f.owner, character.SubmitForVerificationSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_character_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected notification failure'; END$$; CREATE TRIGGER reject_character_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_character_notice()`); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	_, err = f.commands.DecideVerification(ctx, f.verifier, character.DecideVerificationSpec{CharacterId: hero.Id, ExpectedSubmittedAt: *submitted.VerificationSubmittedAt, Verdict: member.VerificationVerdictApproved}, commandMeta())
	if err == nil {
		t.Fatal("expected notification failure")
	}
	if f.snapshot(t) != before {
		t.Fatal("failed notice committed assessment, state or receipt")
	}
}

func TestFrontendCharacterRetirementNoticeFailureRollsBack(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	hero := f.create(t)
	q := f.participation(t, hero.Id, "signed_up", 1)
	f.waiter(t, q, "active", time.Now())
	if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_retirement_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected promotion notice failure'; END$$; CREATE TRIGGER reject_retirement_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_retirement_notice()`); err != nil {
		t.Fatal(err)
	}
	before := f.snapshot(t)
	_, err := f.commands.RetireCharacter(ctx, f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
	if err == nil {
		t.Fatal("expected notice failure")
	}
	if f.snapshot(t) != before {
		t.Fatal("failed promotion notice committed withdrawal, capacity, Character, job or receipt")
	}
}

type changedWithdrawalPlan struct {
	character.QuestWithdrawalWriter
	changed *bool
	insert  func()
}

func (w changedWithdrawalPlan) PlanOwnedCharacterWithdrawal(ctx context.Context, id string, ids []string) (character.WithdrawalPlan, error) {
	plan, err := w.QuestWithdrawalWriter.PlanOwnedCharacterWithdrawal(ctx, id, ids)
	if err == nil && !*w.changed {
		*w.changed = true
		w.insert()
	}
	return plan, err
}
func TestFrontendCharacterRetirementReplansInsertedCandidate(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	hero := f.create(t)
	q := f.participation(t, hero.Id, "signed_up", 1)
	changed := false
	candidate := ""
	f.decorate = func(r character.ProductCommandRepos) character.ProductCommandRepos {
		r.Withdrawals = changedWithdrawalPlan{r.Withdrawals, &changed, func() { candidate = f.waiter(t, q, "active", time.Now()) }}
		return r
	}
	result, err := f.commands.RetireCharacter(ctx, f.owner, character.RetireCharacterSpec{CharacterId: hero.Id, ExpectedUpdatedAt: hero.UpdatedAt}, commandMeta())
	if err != nil || result.Status != "retired" {
		t.Fatalf("retirement=%+v err=%v", result, err)
	}
	var status string
	if err := f.db.Pool.QueryRow(ctx, `SELECT p.status FROM quest_participants p JOIN characters c ON c.id=p.character_id WHERE c.public_id=$1`, candidate).Scan(&status); err != nil || status != "signed_up" {
		t.Fatalf("inserted candidate=%s err=%v", status, err)
	}
}

func TestFrontendCharacterImageURLAndRequiredDdb(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	before := f.snapshot(t)
	_, err := f.commands.CreateCharacter(ctx, f.owner, character.CreateCharacterSpec{Input: character.CreateCharacterFields{Name: "No Sheet", RegionId: str(f.region), BackstoryId: str(f.backstory)}}, commandMeta())
	wantCode(t, err, apierr.Invalid)
	if f.snapshot(t) != before {
		t.Fatal("create without DDB URL persisted state")
	}
	for label, fields := range map[string]character.CreateCharacterFields{
		"region":    {Name: "No Region", DdbUrl: str("https://www.dndbeyond.com/characters/42"), BackstoryId: str(f.backstory)},
		"backstory": {Name: "No Backstory", DdbUrl: str("https://www.dndbeyond.com/characters/42"), RegionId: str(f.region)},
	} {
		_, err := f.commands.CreateCharacter(ctx, f.owner, character.CreateCharacterSpec{Input: fields}, commandMeta())
		wantCode(t, err, apierr.Invalid)
		if f.snapshot(t) != before {
			t.Fatalf("create without %s persisted state", label)
		}
	}
	image := "https://images.example/hero.png"
	hero, err := f.commands.CreateCharacter(ctx, f.owner, character.CreateCharacterSpec{Input: character.CreateCharacterFields{Name: "Portrait", DdbUrl: str("https://www.dndbeyond.com/characters/42"), ImageUrl: &image, RegionId: str(f.region), BackstoryId: str(f.backstory)}}, commandMeta())
	if err != nil || hero.ImageUrl == nil || *hero.ImageUrl != image {
		t.Fatalf("create with image=%+v err=%v", hero, err)
	}
	bad := character.UpdateCharacterProfileSpec{CharacterId: hero.Id, Input: character.UpdateCharacterProfileFields{ImageUrl: product.Optional[string]{Set: true, Value: str("http://images.example/hero.png")}}}
	_, err = f.commands.UpdateCharacterProfile(ctx, f.owner, bad, commandMeta())
	wantCode(t, err, apierr.Invalid)
	keep := character.UpdateCharacterProfileSpec{CharacterId: hero.Id, Input: character.UpdateCharacterProfileFields{Description: product.Optional[string]{Set: true, Value: str("Kept image")}}}
	kept, err := f.commands.UpdateCharacterProfile(ctx, f.owner, keep, commandMeta())
	if err != nil || kept.ImageUrl == nil || *kept.ImageUrl != image {
		t.Fatalf("omitted imageUrl changed: %+v err=%v", kept, err)
	}
	clear := character.UpdateCharacterProfileSpec{CharacterId: hero.Id, Input: character.UpdateCharacterProfileFields{ImageUrl: product.Optional[string]{Set: true}}}
	cleared, err := f.commands.UpdateCharacterProfile(ctx, f.owner, clear, commandMeta())
	if err != nil || cleared.ImageUrl != nil {
		t.Fatalf("null imageUrl did not clear: %+v err=%v", cleared, err)
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE characters SET image_url='http://x.example/a.png' WHERE public_id=$1`, hero.Id); err == nil {
		t.Fatal("characters_image_url_check accepted a non-https URL")
	}
}

func TestCharacterSummariesFilterItemsAndTotalByViewer(t *testing.T) {
	f := newFrontendCharacterFixture(t)
	ctx := context.Background()
	hero := f.create(t)
	seedDM := func(handle string) auth.Authority {
		t.Helper()
		id := uuid.NewString()
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles)
			VALUES($1,$2,$2,$2,ARRAY['dm'])`, id, handle); err != nil {
			t.Fatal(err)
		}
		actor, err := auth.NewAuthorityWithHandle(id, []auth.Role{auth.DM}, "active", "approved", handle)
		if err != nil {
			t.Fatal(err)
		}
		return actor
	}
	dm := seedDM("character-summary-dm")
	readerDM := seedDM("character-summary-reader")
	titles := []string{"Public SQL null", "Public JSON null", "Draft", "DM only", "Restricted", "Empty audience"}
	ids := make([]string, len(titles))
	for i, title := range titles {
		ids[i] = uuid.NewString()
		status, visibility := "published", "public"
		var policy any
		switch title {
		case "Public JSON null":
			policy = "null"
		case "Draft":
			status = "draft"
		case "DM only":
			visibility = "dm_only"
		case "Restricted":
			visibility = "restricted"
		case "Empty audience":
			policy = "[]"
		}
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO documents(public_id,kind,slug,title,status,visibility,policy,body,author_id)
			SELECT $1::uuid,'summary',$7::text,$2,$3,$4,$5::jsonb,'Metadata-only summary body',id FROM members WHERE public_id=$6`, ids[i], title, status, visibility, policy, f.verifier.Claims().MemberID, ids[i]); err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO document_links(source_id,character_target_id,relation)
			SELECT d.id,c.id,'summarizes' FROM documents d,characters c WHERE d.public_id=$1 AND c.public_id=$2`, ids[i], hero.Id); err != nil {
			t.Fatal(err)
		}
		if title == "Restricted" {
			if _, err := f.db.Pool.Exec(ctx, `INSERT INTO document_readers(document_id,member_id)
				SELECT d.id,m.id FROM documents d,members m WHERE d.public_id=$1 AND m.public_id=ANY($2::uuid[])`, ids[i], []string{readerDM.Claims().MemberID, f.owner.Claims().MemberID}); err != nil {
				t.Fatal(err)
			}
		}
	}
	reader, err := character.NewProductPostgres(f.db.Pool)
	if err != nil {
		t.Fatal(err)
	}
	for _, viewer := range []struct {
		name  string
		actor auth.Authority
		want  []string
	}{
		{"anonymous", auth.Authority{}, titles[:2]},
		{"player with reader grant", f.owner, titles[:2]},
		{"approved DM", dm, []string{titles[0], titles[1], titles[3]}},
		{"approved DM with reader grant", readerDM, []string{titles[0], titles[1], titles[3], titles[4]}},
		{"author", f.verifier, titles},
		{"admin", f.admin, titles},
	} {
		t.Run(viewer.name, func(t *testing.T) {
			for _, offset := range []int32{0, 100} {
				page, err := reader.ReadCharacterSummaries(ctx, viewer.actor, character.CharacterSummariesSpec{CharacterId: hero.Id, Limit: 50, Offset: offset})
				if err != nil {
					t.Fatal(err)
				}
				if page.Total != int32(len(viewer.want)) {
					t.Fatalf("offset=%d total=%d want=%d", offset, page.Total, len(viewer.want))
				}
				var got []string
				for _, item := range page.Items {
					got = append(got, item.Title)
					if item.EffectiveBody != nil {
						t.Fatalf("metadata-only summary returned body=%q", *item.EffectiveBody)
					}
					if (item.Title == titles[0] || item.Title == titles[1]) && item.Policy != nil {
						t.Fatalf("legacy policy=%v want nil", item.Policy)
					}
				}
				want := viewer.want
				if offset > 0 {
					want = nil
				}
				if !slices.Equal(got, want) {
					t.Fatalf("offset=%d titles=%v want=%v", offset, got, want)
				}
			}
		})
	}
}
