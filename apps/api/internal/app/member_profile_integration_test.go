//go:build integration

package app

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/graph"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/quest"
)

type memberProfileFixture struct {
	db                     *dbtest.ProductFixture
	services               graph.Services
	store                  *member.PostgresStore
	owner, verifier, other auth.Authority
}

func newMemberProfileFixture(t *testing.T) *memberProfileFixture {
	t.Helper()
	f := &memberProfileFixture{db: dbtest.NewProductFixture(t)}
	ctx := context.Background()
	for _, who := range []struct {
		handle string
		roles  []string
		actor  *auth.Authority
	}{
		{"profile-owner", []string{"dm", "player"}, &f.owner},
		{"profile-verifier", []string{"verifier", "player"}, &f.verifier},
		{"profile-other", []string{"player"}, &f.other},
	} {
		id := uuid.NewString()
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$2,$2,$3)`, id, who.handle, who.roles); err != nil {
			t.Fatal(err)
		}
		roles := make([]auth.Role, len(who.roles))
		for i, role := range who.roles {
			roles[i] = auth.Role(role)
		}
		actor, err := auth.NewAuthority(id, roles, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		*who.actor = actor
	}
	var err error
	f.store, err = member.NewFromDBTX(f.db.Pool, "")
	if err != nil {
		t.Fatal(err)
	}
	f.services, err = wireProductServices(f.db.Pool, f.db.Pool, f.store, []byte("synthetic-member-profile-test-key-32"), graph.Services{})
	if err != nil {
		t.Fatal(err)
	}
	return f
}
func memberProfileMeta() product.CommandMeta {
	return product.CommandMeta{IdempotencyKey: uuid.NewString()}
}
func memberProfileText(value string) *string { return &value }
func memberProfileCode(t *testing.T, err error, want apierr.Code) {
	t.Helper()
	var failure *apierr.Error
	if !errors.As(err, &failure) || failure.Code != want {
		t.Fatalf("error=%v want=%s", err, want)
	}
}
func (f *memberProfileFixture) read(t *testing.T) *member.MemberProfileView {
	t.Helper()
	view, err := f.services.MemberQueries.MemberProfile(context.Background(), auth.Authority{}, member.MemberProfileSpec{Handle: "profile-owner"})
	if err != nil || view == nil {
		t.Fatalf("profile=%+v err=%v", view, err)
	}
	return view
}
func (f *memberProfileFixture) count(t *testing.T, sql string, args ...any) int {
	t.Helper()
	var count int
	if err := f.db.Pool.QueryRow(context.Background(), sql, args...).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
func (f *memberProfileFixture) draft(t *testing.T) member.DmProfileView {
	t.Helper()
	result, err := f.services.MemberCommands.UpdateMyDmProfile(context.Background(), f.owner, member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: true}}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func (f *memberProfileFixture) pending(t *testing.T) member.DmProfileView {
	t.Helper()
	draft := f.draft(t)
	result, err := f.services.MemberCommands.SubmitDmProfileForVerification(context.Background(), f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: draft.ReviewRevision}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func TestMemberProfileBoundSelfAndAvailability(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	commands := f.services.MemberCommands
	avatar := "https://example.test/member.png"
	spec := member.UpdateMyProfileSpec{Input: member.UpdateMyProfileFields{DisplayName: "Saved name", AvatarUrl: product.Optional[string]{Set: true, Value: &avatar}}}
	key := memberProfileMeta()
	first, err := commands.UpdateMyProfile(ctx, f.owner, spec, key)
	if err != nil || first.AvatarUrl == nil || *first.AvatarUrl != avatar {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	replay, err := commands.UpdateMyProfile(ctx, f.owner, spec, key)
	if err != nil || replay.Id != first.Id || replay.DisplayName != first.DisplayName || replay.AvatarUrl == nil || *replay.AvatarUrl != avatar || !replay.JoinedAt.Equal(first.JoinedAt) || !reflect.DeepEqual(replay.Roles, first.Roles) {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	kept, err := commands.UpdateMyProfile(ctx, f.owner, member.UpdateMyProfileSpec{Input: member.UpdateMyProfileFields{DisplayName: "Second name"}}, memberProfileMeta())
	if err != nil || kept.AvatarUrl == nil || *kept.AvatarUrl != avatar {
		t.Fatalf("omission=%+v err=%v", kept, err)
	}
	cleared, err := commands.UpdateMyProfile(ctx, f.owner, member.UpdateMyProfileSpec{Input: member.UpdateMyProfileFields{DisplayName: "Second name", AvatarUrl: product.Optional[string]{Set: true}}}, memberProfileMeta())
	if err != nil || cleared.AvatarUrl != nil {
		t.Fatalf("null clear=%+v err=%v", cleared, err)
	}
	profile := f.read(t)
	if profile.Member.DisplayName != "Second name" || profile.Member.AvatarUrl != nil {
		t.Fatalf("persisted=%+v", profile.Member)
	}
	slots := member.SetMyAvailabilitySpec{Slots: []member.AvailabilitySlotFields{{Day: "Sunday", StartTime: "22:00", EndTime: "24:00", Note: nil}, {Day: "Monday", StartTime: "09:00", EndTime: "10:00", Note: memberProfileText("")}, {Day: "Monday", StartTime: "10:00", EndTime: "11:00", Note: memberProfileText("Adjacent")}}}
	result, err := commands.SetMyAvailability(ctx, f.owner, slots, memberProfileMeta())
	if err != nil || len(result) != 3 {
		t.Fatalf("slots=%+v err=%v", result, err)
	}
	if result[0].Day != "SUNDAY" || result[0].EndTime != "24:00:00" || result[0].Note != nil {
		t.Fatalf("midnight=%+v", result)
	}
	if result[1].Note == nil || *result[1].Note != "" {
		t.Fatalf("empty note lost=%+v", result)
	}
	before := f.read(t).Availability
	for _, invalid := range []member.SetMyAvailabilitySpec{{Slots: []member.AvailabilitySlotFields{{Day: "MONDAY", StartTime: "09:00", EndTime: "10:00"}, {Day: "MONDAY", StartTime: "09:30", EndTime: "11:00"}}}, {Slots: []member.AvailabilitySlotFields{{Day: "SUNDAY", StartTime: "23:00:01", EndTime: "24:00:00"}}}} {
		_, err = commands.SetMyAvailability(ctx, f.owner, invalid, memberProfileMeta())
		memberProfileCode(t, err, apierr.Invalid)
	}
	if !reflect.DeepEqual(before, f.read(t).Availability) {
		t.Fatal("invalid replacement changed persisted availability")
	}
	if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_availability_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic availability rollback'; END $$`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Pool.Exec(ctx, `CREATE TRIGGER reject_availability_test_write BEFORE INSERT ON member_availability FOR EACH ROW EXECUTE FUNCTION reject_availability_test_write()`); err != nil {
		t.Fatal(err)
	}
	failedKey := memberProfileMeta()
	_, err = commands.SetMyAvailability(ctx, f.owner, member.SetMyAvailabilitySpec{Slots: []member.AvailabilitySlotFields{{Day: "Tuesday", StartTime: "08:00", EndTime: "09:00"}}}, failedKey)
	if err == nil || !reflect.DeepEqual(before, f.read(t).Availability) || f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, failedKey.IdempotencyKey) != 0 {
		t.Fatalf("failed replacement committed: err=%v", err)
	}
	empty, err := commands.SetMyAvailability(ctx, f.owner, member.SetMyAvailabilitySpec{Slots: []member.AvailabilitySlotFields{}}, memberProfileMeta())
	if err != nil || len(empty) != 0 || len(f.read(t).Availability) != 0 {
		t.Fatalf("clear=%+v err=%v", empty, err)
	}
	if f.count(t, `SELECT count(*) FROM members WHERE public_id=$1 AND display_name='profile-other'`, f.other.Claims().MemberID) != 1 {
		t.Fatal("self command changed other member")
	}
}
func TestMemberProfileBoundDmLifecycleReplayAndEdit(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	commands := f.services.MemberCommands
	spec := member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: true}}
	key := memberProfileMeta()
	results := make(chan member.DmProfileView, 2)
	failures := make(chan error, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			result, err := commands.UpdateMyDmProfile(ctx, f.owner, spec, key)
			results <- result
			failures <- err
		}()
	}
	workers.Wait()
	close(results)
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	for result := range results {
		if result.ReviewRevision != 1 || result.Status != "draft" {
			t.Fatalf("duplicate result=%+v", result)
		}
	}
	if f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, key.IdempotencyKey) != 1 {
		t.Fatal("duplicate creation produced multiple receipts")
	}
	edited, err := commands.UpdateMyDmProfile(ctx, f.owner, spec, memberProfileMeta())
	if err != nil || edited.ReviewRevision != 2 || edited.Status != "draft" {
		t.Fatalf("draft edit=%+v err=%v", edited, err)
	}
	_, err = commands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: 1}, memberProfileMeta())
	memberProfileCode(t, err, apierr.Conflict)
	submitted, err := commands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: 2}, memberProfileMeta())
	if err != nil || submitted.Status != "pending" || submitted.ReviewRevision != edited.ReviewRevision+1 {
		t.Fatalf("submit=%+v err=%v", submitted, err)
	}
	verdict := member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: submitted.ReviewRevision, Verdict: member.VerificationVerdictRejected, Note: memberProfileText("Please revise")}
	verdictKey := memberProfileMeta()
	_, err = commands.DecideDmProfileVerification(ctx, f.other, verdict, memberProfileMeta())
	memberProfileCode(t, err, apierr.Forbidden)
	decided, err := commands.DecideDmProfileVerification(ctx, f.verifier, verdict, verdictKey)
	if err != nil || decided.Status != "rejected" || decided.ReviewRevision != submitted.ReviewRevision+1 {
		t.Fatalf("verdict=%+v err=%v", decided, err)
	}
	replay, err := commands.DecideDmProfileVerification(ctx, f.verifier, verdict, verdictKey)
	if err != nil || !reflect.DeepEqual(decided, replay) {
		t.Fatalf("verdict replay=%+v err=%v", replay, err)
	}
	if f.count(t, `SELECT count(*) FROM verifications WHERE subject_type='dm_profile'`) != 1 {
		t.Fatal("verdict replay duplicated assessment")
	}
	var identity, actor, note string
	var revision int32
	if err := f.db.Pool.QueryRow(ctx, `SELECT v.public_id::text,a.public_id::text,v.note,v.review_revision FROM verifications v JOIN members a ON a.id=v.decided_by WHERE v.subject_type='dm_profile'`).Scan(&identity, &actor, &note, &revision); err != nil {
		t.Fatal(err)
	}
	if uuid.Validate(identity) != nil || actor != f.verifier.Claims().MemberID || note != "Please revise" || revision != submitted.ReviewRevision {
		t.Fatalf("assessment identity=%s actor=%s revision=%d", identity, actor, revision)
	}
	revised, err := commands.UpdateMyDmProfile(ctx, f.owner, spec, memberProfileMeta())
	if err != nil || revised.ReviewRevision != decided.ReviewRevision+1 || revised.Status != "draft" {
		t.Fatalf("rejected edit=%+v err=%v", revised, err)
	}
	submitted, err = commands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: revised.ReviewRevision}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	verdict.ExpectedRevision = submitted.ReviewRevision
	verdict.Verdict = member.VerificationVerdictApproved
	approved, err := commands.DecideDmProfileVerification(ctx, f.verifier, verdict, memberProfileMeta())
	if err != nil || approved.Status != "approved" || approved.ReviewRevision != verdict.ExpectedRevision+1 {
		t.Fatalf("approval=%+v err=%v", approved, err)
	}
	revised, err = commands.UpdateMyDmProfile(ctx, f.owner, spec, memberProfileMeta())
	if err != nil || revised.ReviewRevision != approved.ReviewRevision+1 || revised.Status != "draft" {
		t.Fatalf("approved edit=%+v err=%v", revised, err)
	}
	if f.read(t).DmProfile.Status != "draft" {
		t.Fatal("profile readback stale")
	}
	if f.count(t, `SELECT count(*) FROM notifications`) != 0 {
		t.Fatal("DM lifecycle invented an unsupported notification")
	}
}
func waitForMemberProfileLock(t *testing.T, f *memberProfileFixture, fragment string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		var waiting bool
		if err := f.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1 AND pid<>pg_backend_pid())`, "%"+fragment+"%").Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("command never waited on actual member row lock")
		case <-ticker.C:
		}
	}
}
func TestMemberProfileBoundAuthorityAfterLockWait(t *testing.T) {
	for _, operation := range []string{"self", "availability", "dm", "submit", "verdict"} {
		t.Run(operation, func(t *testing.T) {
			f := newMemberProfileFixture(t)
			ctx := context.Background()
			commands := f.services.MemberCommands
			pending := f.pending(t)
			if operation == "submit" {
				pending = f.draft(t)
			}
			blocker, err := f.db.Pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback(ctx)
			if _, err := blocker.Exec(ctx, `SELECT id FROM members WHERE public_id=$1 FOR NO KEY UPDATE`, f.owner.Claims().MemberID); err != nil {
				t.Fatal(err)
			}
			key := memberProfileMeta()
			done := make(chan error, 1)
			go func() {
				var err error
				switch operation {
				case "self":
					_, err = commands.UpdateMyProfile(ctx, f.owner, member.UpdateMyProfileSpec{Input: member.UpdateMyProfileFields{DisplayName: "Must not commit"}}, key)
				case "availability":
					_, err = commands.SetMyAvailability(ctx, f.owner, member.SetMyAvailabilitySpec{}, key)
				case "dm":
					_, err = commands.UpdateMyDmProfile(ctx, f.owner, member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: false}}, key)
				case "submit":
					_, err = commands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: pending.ReviewRevision}, key)
				case "verdict":
					_, err = commands.DecideDmProfileVerification(ctx, f.verifier, member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictApproved}, key)
				}
				done <- err
			}()
			waitForMemberProfileLock(t, f, "ProductLockMembers")
			target := f.owner.Claims().MemberID
			statement := `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`
			if operation == "availability" {
				statement = `UPDATE members SET roles=ARRAY['dm']::text[] WHERE public_id=$1`
			}
			if operation == "self" {
				statement = `UPDATE members SET status='inactive' WHERE public_id=$1`
			}
			if operation == "verdict" {
				target = f.verifier.Claims().MemberID
			}
			if _, err := blocker.Exec(ctx, statement, target); err != nil {
				t.Fatal(err)
			}
			if err := blocker.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				memberProfileCode(t, err, apierr.Forbidden)
			case <-time.After(5 * time.Second):
				t.Fatal("command did not finish after lock release")
			}
			if f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, key.IdempotencyKey) != 0 || f.count(t, `SELECT count(*) FROM verifications`) != 0 {
				t.Fatal("revoked command committed receipt or assessment")
			}
		})
	}
}
func TestMemberProfileBoundVerdictRollback(t *testing.T) {
	for _, stage := range []string{"assessment", "receipt"} {
		t.Run(stage, func(t *testing.T) {
			f := newMemberProfileFixture(t)
			ctx := context.Background()
			pending := f.pending(t)
			table, event := "verifications", "INSERT"
			if stage == "receipt" {
				table, event = "idempotency_keys", "UPDATE"
			}
			if _, err := f.db.Pool.Exec(ctx, `CREATE FUNCTION reject_profile_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic profile rollback'; END $$`); err != nil {
				t.Fatal(err)
			}
			if _, err := f.db.Pool.Exec(ctx, `CREATE TRIGGER reject_profile_test_write BEFORE `+event+` ON `+table+` FOR EACH ROW EXECUTE FUNCTION reject_profile_test_write()`); err != nil {
				t.Fatal(err)
			}
			key := memberProfileMeta()
			_, err := f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictApproved}, key)
			if err == nil {
				t.Fatal("injected failure succeeded")
			}
			view := f.read(t)
			if view.DmProfile.Status != "pending" || view.DmProfile.ReviewRevision != pending.ReviewRevision {
				t.Fatalf("partial verdict committed=%+v", view.DmProfile)
			}
			if f.count(t, `SELECT count(*) FROM verifications`) != 0 || f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, key.IdempotencyKey) != 0 {
				t.Fatal("partial assessment or receipt committed")
			}
		})
	}
}

func TestMemberProfileBoundDmReplacementAndConcurrentEdits(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	commands := f.services.MemberCommands
	tagline, philosophy, rules := "Original tagline", "Original philosophy", "Original rules"
	table := json.RawMessage(`{"style":"story"}`)
	initial := member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: true, Tagline: &tagline, Philosophy: &philosophy, HouseRules: &rules, TableInfo: &table}}
	saved, err := commands.UpdateMyDmProfile(ctx, f.owner, initial, memberProfileMeta())
	if err != nil || saved.TableInfo == nil || saved.Tagline == nil {
		t.Fatalf("initial=%+v err=%v", saved, err)
	}
	cleared, err := commands.UpdateMyDmProfile(ctx, f.owner, member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: false}}, memberProfileMeta())
	if err != nil || cleared.Tagline != nil || cleared.Philosophy != nil || cleared.HouseRules != nil || cleared.TableInfo != nil || cleared.AcceptingPlayers {
		t.Fatalf("replacement omission must clear=%+v err=%v", cleared, err)
	}
	bad := json.RawMessage(`{`)
	key := memberProfileMeta()
	_, err = commands.UpdateMyDmProfile(ctx, f.owner, member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{TableInfo: &bad}}, key)
	memberProfileCode(t, err, apierr.Invalid)
	if f.read(t).DmProfile.ReviewRevision != cleared.ReviewRevision || f.count(t, `SELECT count(*) FROM idempotency_keys WHERE key=$1`, key.IdempotencyKey) != 0 {
		t.Fatal("invalid replacement changed state or receipt")
	}
	a, b := "Replacement A", "Replacement B"
	inputs := []member.UpdateMyDmProfileSpec{{Input: member.UpdateDmProfileFields{Tagline: &a, HouseRules: &a}}, {Input: member.UpdateDmProfileFields{Tagline: &b, HouseRules: &b}}}
	failures := make(chan error, 2)
	for _, input := range inputs {
		go func(input member.UpdateMyDmProfileSpec) {
			_, err := commands.UpdateMyDmProfile(ctx, f.owner, input, memberProfileMeta())
			failures <- err
		}(input)
	}
	for range inputs {
		if err := <-failures; err != nil {
			t.Fatal(err)
		}
	}
	final := f.read(t).DmProfile
	if final.ReviewRevision != cleared.ReviewRevision+2 || final.Tagline == nil || final.HouseRules == nil || *final.Tagline != *final.HouseRules || (*final.Tagline != a && *final.Tagline != b) || final.Philosophy != nil || final.TableInfo != nil {
		t.Fatalf("concurrent replacement mixed payloads=%+v", final)
	}
}

func TestMemberProfileBoundDirectoryAndDmStats(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	pending := f.pending(t)
	_, err := f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictApproved}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.services.MemberCommands.SetMyAvailability(ctx, f.owner, member.SetMyAvailabilitySpec{Slots: []member.AvailabilitySlotFields{{Day: "Sunday", StartTime: "09:00", EndTime: "10:00"}}}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	yes := true
	filter := &member.CommunityDirectoryFiltersFields{Role: memberProfileText("dm"), DmProfileStatus: memberProfileText("approved"), AcceptingPlayers: &yes, Search: memberProfileText("profile-owner")}
	page, err := f.services.MemberQueries.CommunityDirectory(ctx, auth.Authority{}, member.CommunityDirectorySpec{Filters: filter, Limit: 1})
	if err != nil || page.Total != 1 || len(page.Entries) != 1 || !page.Entries[0].IsDm || !reflect.DeepEqual(page.Entries[0].AvailableDays, []string{"SUNDAY"}) {
		t.Fatalf("community=%+v err=%v", page, err)
	}
	end, err := f.services.MemberQueries.CommunityDirectory(ctx, auth.Authority{}, member.CommunityDirectorySpec{Filters: filter, Limit: 1, Offset: 1})
	if err != nil || end.Total != 1 || len(end.Entries) != 0 {
		t.Fatalf("past page=%+v err=%v", end, err)
	}
	filter.Role = memberProfileText("verifier")
	none, err := f.services.MemberQueries.CommunityDirectory(ctx, auth.Authority{}, member.CommunityDirectorySpec{Filters: filter, Limit: 10})
	if err != nil || none.Total != 0 || len(none.Entries) != 0 {
		t.Fatalf("AND filters=%+v err=%v", none, err)
	}
	members, err := f.services.MemberQueries.Members(ctx, auth.Authority{}, member.MembersSpec{Filters: &member.MemberFiltersFields{Role: memberProfileText("player"), Status: memberProfileText("active"), Search: memberProfileText("profile-")}, Limit: 1, Offset: 1})
	if err != nil || members.Total != 3 || len(members.Items) != 1 || members.Items[0].Id != f.owner.Claims().MemberID {
		t.Fatalf("member page=%+v err=%v", members, err)
	}
	if members.Items[0].DiscordId != nil {
		t.Fatal("public directory exposed private Discord identity")
	}
	var brief int64
	if err := f.db.Pool.QueryRow(ctx, `INSERT INTO documents(kind,slug,title,body,status,visibility,author_id) SELECT 'quest_brief','member-profile-stats','Stats brief','body','published','public',id FROM members WHERE public_id=$1 RETURNING id`, f.owner.Claims().MemberID).Scan(&brief); err != nil {
		t.Fatal(err)
	}
	for index, status := range []string{"open", "played", "closed", "cancelled"} {
		if _, err := f.db.Pool.Exec(ctx, `INSERT INTO quests(short_code,kinds,status,dm_id,scheduled_at,document_id,created_by) SELECT $2,ARRAY['standard'],$3,id,$4,$5,id FROM members WHERE public_id=$1`, f.owner.Claims().MemberID, "member-stats-"+status, status, time.Date(2026, 10, 10+index, 12, 0, 0, 0, time.UTC), brief); err != nil {
			t.Fatal(err)
		}
	}
	stats, err := f.services.QuestQueries.DmStats(ctx, auth.Authority{}, quest.DmStatsSpec{MemberId: f.owner.Claims().MemberID})
	if err != nil || stats == nil || stats.SessionCount != 2 || stats.LastSession == nil || stats.LastSession.Quest.ShortCode != "member-stats-closed" {
		t.Fatalf("DM stats=%+v err=%v", stats, err)
	}
	if _, err := f.db.Pool.Exec(ctx, `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	public, err := f.services.MemberQueries.CommunityDirectory(ctx, auth.Authority{}, member.CommunityDirectorySpec{Filters: &member.CommunityDirectoryFiltersFields{Search: memberProfileText("profile-owner")}, Limit: 10})
	if err != nil || len(public.Entries) != 1 || public.Entries[0].IsDm {
		t.Fatalf("revoked DM flag=%+v err=%v", public, err)
	}
}

func TestMemberProfileBoundReplayAuthorityAfterReceiptWait(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	spec := member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: true}}
	key := memberProfileMeta()
	if _, err := f.services.MemberCommands.UpdateMyDmProfile(ctx, f.owner, spec, key); err != nil {
		t.Fatal(err)
	}
	blocker, err := f.db.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(ctx)
	if _, err := blocker.Exec(ctx, `SELECT key FROM idempotency_keys WHERE key=$1 FOR UPDATE`, key.IdempotencyKey); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := f.services.MemberCommands.UpdateMyDmProfile(ctx, f.owner, spec, key); done <- err }()
	waitForMemberProfileLock(t, f, "FOR UPDATE OF r")
	if _, err := blocker.Exec(ctx, `UPDATE members SET roles=ARRAY['player']::text[] WHERE public_id=$1`, f.owner.Claims().MemberID); err != nil {
		t.Fatal(err)
	}
	if err := blocker.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		memberProfileCode(t, err, apierr.Forbidden)
	case <-time.After(5 * time.Second):
		t.Fatal("replay did not finish after receipt release")
	}
	if f.read(t).DmProfile.ReviewRevision != 1 {
		t.Fatal("denied replay mutated profile")
	}
}
func TestMemberProfileBoundPendingEditAndConcurrentVerdicts(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	pending := f.pending(t)
	edited, err := f.services.MemberCommands.UpdateMyDmProfile(ctx, f.owner, member.UpdateMyDmProfileSpec{Input: member.UpdateDmProfileFields{AcceptingPlayers: false}}, memberProfileMeta())
	if err != nil || edited.Status != "draft" || edited.ReviewRevision != pending.ReviewRevision+1 {
		t.Fatalf("pending edit=%+v err=%v", edited, err)
	}
	stale := member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictApproved}
	_, err = f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, stale, memberProfileMeta())
	memberProfileCode(t, err, apierr.Conflict)
	resubmitted, err := f.services.MemberCommands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: edited.ReviewRevision}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	stale.ExpectedRevision = resubmitted.ReviewRevision
	done := make(chan error, 2)
	for range 2 {
		go func() {
			_, err := f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, stale, memberProfileMeta())
			done <- err
		}()
	}
	succeeded, conflicted := 0, 0
	for range 2 {
		err := <-done
		if err == nil {
			succeeded++
		} else {
			memberProfileCode(t, err, apierr.Conflict)
			conflicted++
		}
	}
	if succeeded != 1 || conflicted != 1 || f.count(t, `SELECT count(*) FROM verifications`) != 1 {
		t.Fatalf("concurrent verdict effects: success=%d conflict=%d", succeeded, conflicted)
	}
}

func TestMemberProfileBoundDirectResubmission(t *testing.T) {
	f := newMemberProfileFixture(t)
	ctx := context.Background()
	pending := f.pending(t)
	rejected, err := f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictRejected}, memberProfileMeta())
	if err != nil {
		t.Fatal(err)
	}
	resubmitted, err := f.services.MemberCommands.SubmitDmProfileForVerification(ctx, f.owner, member.SubmitDmProfileForVerificationSpec{ExpectedRevision: rejected.ReviewRevision}, memberProfileMeta())
	if err != nil || resubmitted.Status != "pending" || resubmitted.ReviewRevision != rejected.ReviewRevision+1 {
		t.Fatalf("resubmit=%+v err=%v", resubmitted, err)
	}
	_, err = f.services.MemberCommands.DecideDmProfileVerification(ctx, f.verifier, member.DecideDmProfileVerificationSpec{MemberId: f.owner.Claims().MemberID, ExpectedRevision: pending.ReviewRevision, Verdict: member.VerificationVerdictApproved}, memberProfileMeta())
	memberProfileCode(t, err, apierr.Conflict)
}
