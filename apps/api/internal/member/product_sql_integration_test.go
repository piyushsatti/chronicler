//go:build integration

package member

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbtest"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type memberBatchQueryCounter struct {
	dbgen.DBTX
	queries  int
	requests int
}

func (c *memberBatchQueryCounter) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	c.queries++
	return c.DBTX.Query(ctx, sql, args...)
}

func (c *memberBatchQueryCounter) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	c.requests++
	return c.DBTX.Exec(ctx, sql, args...)
}

func (c *memberBatchQueryCounter) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	c.requests++
	return c.DBTX.QueryRow(ctx, sql, args...)
}

func (c *memberBatchQueryCounter) reset() {
	c.queries = 0
	c.requests = 0
}

func jsonObjectsEqual(expected, actual []byte) bool {
	if !json.Valid(expected) || !json.Valid(actual) {
		return false
	}
	decode := func(raw []byte) (any, error) {
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		var value any
		err := decoder.Decode(&value)
		return value, err
	}
	want, err := decode(expected)
	if err != nil {
		return false
	}
	got, err := decode(actual)
	if err != nil {
		return false
	}
	if _, ok := want.(map[string]any); !ok {
		return false
	}
	if _, ok := got.(map[string]any); !ok {
		return false
	}
	return reflect.DeepEqual(want, got)
}

func TestPhase3TaskMEM04PostgresAcceptance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fixture := dbtest.NewProductFixture(t)
	const requester = "10000000-0000-4000-8000-000000000001"
	const dm = "10000000-0000-4000-8000-000000000002"
	const other = "10000000-0000-4000-8000-000000000003"
	for _, row := range []struct{ id, discord, handle, role string }{
		{requester, "mem04-requester", "requester", "player"},
		{dm, "mem04-dm", "dungeon-master", "dm"},
		{other, "mem04-other", "other", "player"},
	} {
		if _, err := fixture.Pool.Exec(ctx, `INSERT INTO members(public_id,discord_id,handle,display_name,roles) VALUES($1,$2,$3,$3,ARRAY[$4])`, row.id, row.discord, row.handle, row.role); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO dm_profiles(member_id,status) SELECT id,'approved' FROM members WHERE public_id=$1::uuid`, dm); err != nil {
		t.Fatal(err)
	}
	adapter, err := NewProductPostgres(fixture.Pool)
	if err != nil {
		t.Fatal(err)
	}
	requesterAuthority, err := auth.NewAuthority(requester, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO member_availability(member_id,weekday,start_minute,end_minute,note) SELECT id,1,480,540,'old slot' FROM members WHERE public_id=$1::uuid`, requester); err != nil {
		t.Fatal(err)
	}
	lockedAvailability, err := adapter.LockSetMyAvailability(ctx, requester, SetMyAvailabilitySpec{})
	if err != nil || !lockedAvailability.Exists || len(lockedAvailability.Slots) != 1 {
		t.Fatalf("availability lock = %+v err=%v", lockedAvailability, err)
	}
	replacement := SetMyAvailabilitySpec{Slots: []AvailabilitySlotFields{
		{Day: "Tuesday", StartTime: "09:00:00", EndTime: "10:30:00", Note: nil},
		{Day: "Wednesday", StartTime: "10:30:00", EndTime: "11:30:00", Note: stringPointer("")},
		{Day: "Thursday", StartTime: "11:30:00", EndTime: "12:30:00", Note: stringPointer("new slot")},
	}}
	replaced, err := adapter.StoreSetMyAvailability(ctx, SetMyAvailabilityWrite{ActorID: requester, Input: replacement, ValidatedInput: replacement, Locked: lockedAvailability})
	if err != nil || len(replaced) != 3 {
		t.Fatalf("availability replacement = %+v err=%v", replaced, err)
	}
	for _, expected := range []AvailabilitySlotView{
		{Day: "TUESDAY", StartTime: "09:00:00", EndTime: "10:30:00", Note: nil},
		{Day: "WEDNESDAY", StartTime: "10:30:00", EndTime: "11:30:00", Note: stringPointer("")},
		{Day: "THURSDAY", StartTime: "11:30:00", EndTime: "12:30:00", Note: stringPointer("new slot")},
	} {
		found := false
		for _, actual := range replaced {
			if actual.Day == expected.Day && actual.StartTime == expected.StartTime && actual.EndTime == expected.EndTime &&
				((actual.Note == nil && expected.Note == nil) || (actual.Note != nil && expected.Note != nil && *actual.Note == *expected.Note)) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("availability replacement missing slot with note presence: %+v", expected)
		}
	}
	tx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	txAdapter, err := NewProductPostgres(tx)
	if err != nil {
		t.Fatal(err)
	}
	rollbackState, err := txAdapter.LockSetMyAvailability(ctx, requester, SetMyAvailabilitySpec{})
	if err != nil || !rollbackState.Exists {
		t.Fatalf("rollback lock=%+v err=%v", rollbackState, err)
	}
	_, err = txAdapter.StoreSetMyAvailability(ctx, SetMyAvailabilityWrite{ActorID: requester, ValidatedInput: SetMyAvailabilitySpec{Slots: []AvailabilitySlotFields{{Day: "Wednesday", StartTime: "11:00:00", EndTime: "12:00:00"}}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	afterRollback, err := adapter.ReadMyAvailability(ctx, requesterAuthority, MyAvailabilitySpec{})
	if err != nil || !reflect.DeepEqual(afterRollback, replaced) {
		t.Fatalf("availability after rollback = %+v err=%v", afterRollback, err)
	}

	filtered, err := adapter.ReadMembers(ctx, requesterAuthority, MembersSpec{Filters: &MemberFiltersFields{Search: stringPointer("dungeon")}, Limit: 10})
	if err != nil || filtered.Total != 1 || len(filtered.Items) != 1 || filtered.Items[0].Id != dm {
		t.Fatalf("filtered members = %+v err=%v", filtered, err)
	}
	zeroPage, err := adapter.ReadMembers(ctx, requesterAuthority, MembersSpec{Filters: &MemberFiltersFields{Role: stringPointer("player")}, Limit: 0})
	if err != nil || zeroPage.Total != 2 || len(zeroPage.Items) != 0 {
		t.Fatalf("zero-sized member page = %+v err=%v", zeroPage, err)
	}
	history, err := adapter.ReadMemberRoleHistory(ctx, requesterAuthority, MemberRoleHistorySpec{MemberId: dm, Limit: 1})
	if err != nil || history.Total != 0 || len(history.Items) != 0 {
		t.Fatalf("role history page = %+v err=%v", history, err)
	}
	missing, err := adapter.ReadMember(ctx, requesterAuthority, MemberSpec{Id: stringPointer("10000000-0000-4000-8000-000000000099")})
	if err != nil || missing != nil {
		t.Fatalf("unknown member=%+v err=%v", missing, err)
	}
	profile, err := adapter.ReadMemberProfile(ctx, requesterAuthority, MemberProfileSpec{Handle: "dungeon-master"})
	if err != nil || profile == nil || profile.Member.Id != dm || profile.DmProfile == nil || profile.DmProfile.Status != "approved" {
		t.Fatalf("member profile=%+v err=%v", profile, err)
	}
	missingProfile, err := adapter.ReadMemberProfile(ctx, requesterAuthority, MemberProfileSpec{Handle: "no-such-handle"})
	if err != nil || missingProfile != nil {
		t.Fatalf("missing member profile=%+v err=%v", missingProfile, err)
	}
	const unlockable = "40000000-0000-4000-8000-000000000001"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO unlockables(public_id,code,name,kind,active,payload,unlock_rule) VALUES($1::uuid,'mem04-achievement','Table Hero','achievement',false,'{}'::jsonb,'{"type":"admin_grant"}'::jsonb)`, unlockable); err != nil {
		t.Fatal(err)
	}
	const tierUnlockable = "40000000-0000-4000-8000-000000000003"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO unlockables(public_id,code,name,kind,active,payload,unlock_rule) VALUES($1::uuid,'mem04-tier','Wayfinder','dm_tier',false,'{}'::jsonb,'{"type":"admin_grant"}'::jsonb)`, tierUnlockable); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO member_unlocks(member_id,unlockable_id,source,granted_by,granted_at,note) SELECT m.id,u.id,'grant',a.id,now(),'earned' FROM members m,unlockables u,members a WHERE m.public_id=$1::uuid AND u.public_id=$2::uuid AND a.public_id=$3::uuid`, requester, unlockable, dm); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO member_unlocks(member_id,unlockable_id,source,granted_by,granted_at,note) SELECT m.id,u.id,'grant',a.id,now(),'earned' FROM members m,unlockables u,members a WHERE m.public_id=$1::uuid AND u.public_id=$2::uuid AND a.public_id=$3::uuid`, requester, tierUnlockable, dm); err != nil {
		t.Fatal(err)
	}
	snapshot, err := adapter.ReadMyUnlocks(ctx, requesterAuthority, MyUnlocksSpec{Limit: 1})
	if err != nil || snapshot.Total != 2 || len(snapshot.PagedGrants) != 1 || len(snapshot.AllGrants) != 2 || len(snapshot.Catalog) != 2 {
		t.Fatalf("unlock snapshot=%+v err=%v", snapshot, err)
	}
	kinds := make(map[string]UnlockKind, len(snapshot.Catalog))
	for _, item := range snapshot.Catalog {
		kinds[item.Id] = item.Kind
	}
	if kinds[unlockable] != UnlockKindAchievement || kinds[tierUnlockable] != UnlockKindDmTier {
		t.Fatalf("physical unlock kinds were not projected as API enums: %+v", kinds)
	}
	unlockProjection, err := NewGrantReconciler().Project(snapshot.Catalog, snapshot.AllGrants)
	if err != nil || len(unlockProjection.AchievementNames) != 1 || unlockProjection.AchievementNames[0] != "Table Hero" || unlockProjection.DMTier != "Wayfinder" {
		t.Fatalf("unlock projection=%+v err=%v", unlockProjection, err)
	}
	secondUnlockable := "40000000-0000-4000-8000-000000000002"
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO unlockables(public_id,code,name,kind,active,payload,unlock_rule) VALUES($1::uuid,'mem04-achievement-2','Reliable Guide','achievement',true,'{}'::jsonb,'{"type":"admin_grant"}'::jsonb)`, secondUnlockable); err != nil {
		t.Fatal(err)
	}
	grantSpec := GrantUnlockSpec{MemberId: requester, UnlockableId: secondUnlockable, Note: "award"}
	grantState, err := adapter.LockGrantUnlock(ctx, grantSpec)
	if err != nil || !grantState.Exists || grantState.ExistingGrant != nil || grantState.Catalog.Id != secondUnlockable || grantState.Catalog.Kind != UnlockKindAchievement {
		t.Fatalf("grant state=%+v err=%v", grantState, err)
	}
	grant, err := adapter.StoreGrantUnlock(ctx, GrantUnlockWrite{ActorID: dm, ValidatedInput: grantSpec, Locked: grantState, At: time.Now().UTC()})
	if err != nil || grant.MemberId != requester || grant.UnlockableId != secondUnlockable || grant.Source != "grant" || grant.GrantedBy == nil || *grant.GrantedBy != dm {
		t.Fatalf("grant=%+v err=%v", grant, err)
	}
	grantState, err = adapter.LockGrantUnlock(ctx, grantSpec)
	if err != nil || grantState.ExistingGrant == nil || grantState.ExistingGrant.UnlockableId != secondUnlockable {
		t.Fatalf("existing grant state=%+v err=%v", grantState, err)
	}
	catalog, err := adapter.ReadUnlockablesCatalog(ctx, requesterAuthority, UnlockablesCatalogSpec{Limit: 10})
	if err != nil || catalog.Total != 3 || len(catalog.Items) != 3 {
		t.Fatalf("unlock catalog=%+v err=%v", catalog, err)
	}
	activeState, err := adapter.LockSetUnlockableActive(ctx, SetUnlockableActiveSpec{Id: secondUnlockable, Active: true})
	if err != nil || !activeState.Exists || activeState.Before == nil || !activeState.Before.Active {
		t.Fatalf("active lock=%+v err=%v", activeState, err)
	}
	activeResult, err := adapter.StoreSetUnlockableActive(ctx, SetUnlockableActiveWrite{ValidatedInput: SetUnlockableActiveSpec{Id: secondUnlockable, Active: false}})
	if err != nil || activeResult.Active || activeResult.Kind != UnlockKindAchievement {
		t.Fatalf("set inactive=%+v err=%v", activeResult, err)
	}
	activeCatalog, err := adapter.ReadUnlockablesCatalog(ctx, requesterAuthority, UnlockablesCatalogSpec{ActiveOnly: true, Limit: 10})
	if err != nil || activeCatalog.Total != 0 || len(activeCatalog.Items) != 0 {
		t.Fatalf("active-only catalog=%+v err=%v", activeCatalog, err)
	}
	settingsState, err := adapter.LockUpdateMySettings(ctx, requester, UpdateMySettingsSpec{})
	if err != nil || !settingsState.Exists || settingsState.Settings.MemberId != requester {
		t.Fatalf("settings state=%+v err=%v", settingsState, err)
	}
	effectsOff, zone := false, "Pacific/Auckland"
	patch := UpdateMySettingsSpec{Input: MemberSettingsPatch{EffectsEnabled: product.Optional[bool]{Set: true, Value: &effectsOff}, Timezone: product.Optional[string]{Set: true, Value: &zone}}}
	settings, err := adapter.StoreUpdateMySettings(ctx, UpdateMySettingsWrite{ActorID: requester, At: time.Now().UTC(), Input: patch, ValidatedInput: patch, Locked: settingsState})
	if err != nil || settings.EffectsEnabled || settings.Timezone == nil || *settings.Timezone != zone {
		t.Fatalf("settings patch=%+v err=%v", settings, err)
	}
	var payload []byte
	var storedMode, storedTheme string
	if err := fixture.Pool.QueryRow(ctx, `SELECT payload,mode,theme FROM member_settings WHERE member_id=(SELECT id FROM members WHERE public_id=$1::uuid)`, requester).Scan(&payload, &storedMode, &storedTheme); err != nil {
		t.Fatal(err)
	}
	if string(payload) != "{}" || storedMode != "system" || storedTheme != "parchment" {
		t.Fatalf("unrelated settings changed payload=%s mode=%s theme=%s", payload, storedMode, storedTheme)
	}
	settingsState, err = adapter.LockUpdateMySettings(ctx, requester, UpdateMySettingsSpec{})
	if err != nil || settingsState.Settings.EffectsEnabled || settingsState.Settings.Timezone == nil || *settingsState.Settings.Timezone != zone {
		t.Fatalf("reloaded settings=%+v err=%v", settingsState.Settings, err)
	}

	personalization, err := adapter.ReadMyPersonalization(ctx, requesterAuthority, MyPersonalizationSpec{})
	if err != nil || personalization == nil || personalization.Settings == nil || personalization.Settings.EffectsEnabled || personalization.Settings.Timezone == nil || *personalization.Settings.Timezone != zone {
		t.Fatalf("personalization=%+v err=%v", personalization, err)
	}
	activity, err := adapter.ReadMemberActivityStats(ctx, requesterAuthority, MemberActivityStatsSpec{MemberId: requester})
	if err != nil || activity == nil || activity.MemberID != requester || activity.Messages != 0 || activity.LongestSessionHours != nil {
		t.Fatalf("empty activity stats=%+v err=%v", activity, err)
	}

	profileState, err := adapter.LockUpdateMyProfile(ctx, requester, UpdateMyProfileSpec{})
	if err != nil || !profileState.Exists || profileState.Before == nil {
		t.Fatalf("profile lock=%+v err=%v", profileState, err)
	}
	emptyAvatar := ""
	profileInput := UpdateMyProfileSpec{Input: UpdateMyProfileFields{DisplayName: "Updated Requester", AvatarUrl: product.Optional[string]{Set: true, Value: &emptyAvatar}}}
	profile, err := adapter.StoreUpdateMyProfile(ctx, UpdateMyProfileWrite{ActorID: requester, At: time.Now().UTC(), Input: profileInput, ValidatedInput: profileInput, Locked: profileState})
	if err != nil || profile.DisplayName != "Updated Requester" || profile.AvatarUrl == nil || *profile.AvatarUrl != "" {
		t.Fatalf("profile update preserving empty avatar=%+v err=%v", profile, err)
	}
	clearProfile := UpdateMyProfileSpec{Input: UpdateMyProfileFields{DisplayName: "Updated Requester", AvatarUrl: product.Optional[string]{Set: true}}}
	profile, err = adapter.StoreUpdateMyProfile(ctx, UpdateMyProfileWrite{ActorID: requester, At: time.Now().UTC(), Input: clearProfile, ValidatedInput: clearProfile})
	if err != nil || profile.AvatarUrl != nil {
		t.Fatalf("profile update clearing avatar=%+v err=%v", profile, err)
	}

	const roleHistoryID = "50000000-0000-4000-8000-000000000001"
	roleSpec := SetMemberRolesSpec{MemberId: other, Roles: []string{"player", "dm"}, Note: stringPointer("promoted")}
	roleState, err := adapter.LockSetMemberRoles(ctx, roleSpec)
	if err != nil || !roleState.Exists || roleState.Before == nil || len(roleState.Before.Roles) != 1 || roleState.Before.Roles[0] != "player" {
		t.Fatalf("role lock=%+v err=%v", roleState, err)
	}
	batchRoleState, err := adapter.LockSetMemberRolesBatch(ctx, SetMemberRolesBatchSpec{Changes: []MemberRoleBatchFields{{MemberId: other}, {MemberId: requester}}})
	if err != nil || len(batchRoleState.Members) != 2 || len(batchRoleState.TargetMemberIDs) != 2 {
		t.Fatalf("batch role lock=%+v err=%v", batchRoleState, err)
	}
	roles, err := adapter.StoreSetMemberRoles(ctx, SetMemberRolesWrite{ActorID: requester, At: time.Now().UTC(), ValidatedInput: roleSpec, Locked: roleState, HistoryID: stringPointer(roleHistoryID)})
	if err != nil || roles.Id != other || len(roles.Roles) != 2 || roles.Roles[1] != "dm" {
		t.Fatalf("role update=%+v err=%v", roles, err)
	}
	roleHistory, err := adapter.ReadMemberRoleHistory(ctx, requesterAuthority, MemberRoleHistorySpec{MemberId: other, Limit: 10})
	if err != nil || len(roleHistory.Items) != 1 || roleHistory.Items[0].Id != roleHistoryID || roleHistory.Items[0].ChangedBy != requester || roleHistory.Items[0].Note == nil || *roleHistory.Items[0].Note != "promoted" {
		t.Fatalf("role history after update=%+v err=%v", roleHistory, err)
	}
	roleTx, err := fixture.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	roleTxAdapter, err := NewProductPostgres(roleTx)
	if err != nil {
		t.Fatal(err)
	}
	roleTxState, err := roleTxAdapter.LockSetMemberRoles(ctx, SetMemberRolesSpec{MemberId: other})
	if err != nil || !roleTxState.Exists {
		t.Fatalf("transactional role lock=%+v err=%v", roleTxState, err)
	}
	rollbackRoleSpec := SetMemberRolesSpec{MemberId: other, Roles: []string{"player"}}
	if _, err := roleTxAdapter.StoreSetMemberRoles(ctx, SetMemberRolesWrite{ActorID: requester, At: time.Now().UTC(), ValidatedInput: rollbackRoleSpec, Locked: roleTxState, HistoryID: stringPointer("50000000-0000-4000-8000-000000000003")}); err != nil {
		t.Fatal(err)
	}
	if err := roleTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	rolledBackMember, err := adapter.ReadMember(ctx, requesterAuthority, MemberSpec{Id: stringPointer(other)})
	if err != nil || rolledBackMember == nil || len(rolledBackMember.Roles) != 2 || rolledBackMember.Roles[1] != "dm" {
		t.Fatalf("member after role rollback=%+v err=%v", rolledBackMember, err)
	}
	roleHistory, err = adapter.ReadMemberRoleHistory(ctx, requesterAuthority, MemberRoleHistorySpec{MemberId: other, Limit: 10})
	if err != nil || len(roleHistory.Items) != 1 || roleHistory.Items[0].Id != roleHistoryID {
		t.Fatalf("role history after rollback=%+v err=%v", roleHistory, err)
	}
	const roleBatchHistoryOther = "50000000-0000-4000-8000-000000000004"
	const roleBatchHistoryRequester = "50000000-0000-4000-8000-000000000005"
	roleBatchSpec := SetMemberRolesBatchSpec{Changes: []MemberRoleBatchFields{
		{MemberId: other, Roles: []string{"player"}, Note: stringPointer("batch downgrade")},
		{MemberId: requester, Roles: []string{"player", "dm"}},
	}}
	roleBatchState, err := adapter.LockSetMemberRolesBatch(ctx, roleBatchSpec)
	if err != nil || len(roleBatchState.Members) != 2 {
		t.Fatalf("role batch lock before store=%+v err=%v", roleBatchState, err)
	}
	roleBatchResults, err := adapter.StoreSetMemberRolesBatch(ctx, SetMemberRolesBatchWrite{ActorID: requester, At: time.Now().UTC(), ValidatedInput: roleBatchSpec, Locked: roleBatchState, HistoryIDs: map[string]string{other: roleBatchHistoryOther, requester: roleBatchHistoryRequester}})
	if err != nil || len(roleBatchResults) != 2 || !roleBatchResults[0].Ok || roleBatchResults[0].MemberId != other || roleBatchResults[0].Member == nil || roleBatchResults[0].Member.Roles[0] != "player" || !roleBatchResults[1].Ok || roleBatchResults[1].MemberId != requester || roleBatchResults[1].Member == nil || len(roleBatchResults[1].Member.Roles) != 2 {
		t.Fatalf("role batch store=%+v err=%v", roleBatchResults, err)
	}
	roleHistory, err = adapter.ReadMemberRoleHistory(ctx, requesterAuthority, MemberRoleHistorySpec{MemberId: other, Limit: 10})
	if err != nil || len(roleHistory.Items) != 2 || roleHistory.Items[0].Id != roleBatchHistoryOther || roleHistory.Items[0].ChangedBy != requester || roleHistory.Items[0].Note == nil || *roleHistory.Items[0].Note != "batch downgrade" {
		t.Fatalf("role history after batch=%+v err=%v", roleHistory, err)
	}
	roleHistory, err = adapter.ReadMemberRoleHistory(ctx, requesterAuthority, MemberRoleHistorySpec{MemberId: requester, Limit: 10})
	if err != nil || len(roleHistory.Items) != 1 || roleHistory.Items[0].Id != roleBatchHistoryRequester || roleHistory.Items[0].ChangedBy != requester || roleHistory.Items[0].Note != nil {
		t.Fatalf("nullable batch role history=%+v err=%v", roleHistory, err)
	}

	unlockableUpdate := UpsertUnlockableSpec{Id: &secondUnlockable, Input: UpsertUnlockableFields{Active: true, Description: stringPointer("Updated description"), Kind: UnlockKindAchievement, Name: "Updated achievement", Payload: []byte(`{"icon":"star"}`), UnlockRule: nil}}
	lockedUnlockable, err := adapter.LockUpsertUnlockable(ctx, unlockableUpdate)
	if err != nil || !lockedUnlockable.Exists || lockedUnlockable.Before == nil || lockedUnlockable.Before.Name == "" {
		t.Fatalf("unlockable upsert lock=%+v err=%v", lockedUnlockable, err)
	}
	updatedUnlockable, err := adapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{Input: unlockableUpdate, ValidatedInput: unlockableUpdate, Locked: lockedUnlockable})
	if err != nil || updatedUnlockable.Name != "Updated achievement" || !updatedUnlockable.Active || updatedUnlockable.Description == nil || *updatedUnlockable.Description != "Updated description" || !jsonObjectsEqual([]byte(`{"icon":"star"}`), updatedUnlockable.Payload) {
		t.Fatalf("unlockable update=%+v err=%v", updatedUnlockable, err)
	}
	const createdUnlockableID = "30000000-0000-4000-8000-000000000099"
	createdUnlockable, err := adapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{UnlockableID: createdUnlockableID, ValidatedInput: UpsertUnlockableSpec{Input: UpsertUnlockableFields{Active: true, Kind: UnlockKindAchievement, Name: "New achievement", Payload: []byte(`{"icon":"moon"}`)}}})
	if err != nil || createdUnlockable.Id != createdUnlockableID || createdUnlockable.Name != "New achievement" || !createdUnlockable.Active {
		t.Fatalf("created unlockable=%+v err=%v", createdUnlockable, err)
	}

	tierUnlockableID := tierUnlockable
	tierUpdate := UpsertUnlockableSpec{Id: &tierUnlockableID, Input: UpsertUnlockableFields{Active: true, Kind: UnlockKindDmTier, Name: "Updated tier", Payload: []byte(`{"icon":"compass"}`)}}
	tierLock, err := adapter.LockUpsertUnlockable(ctx, tierUpdate)
	if err != nil || !tierLock.Exists {
		t.Fatalf("tier unlockable lock=%+v err=%v", tierLock, err)
	}
	updatedTier, err := adapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{Input: tierUpdate, ValidatedInput: tierUpdate, Locked: tierLock})
	if err != nil || updatedTier.Kind != UnlockKindDmTier || updatedTier.Name != "Updated tier" {
		t.Fatalf("updated tier unlockable=%+v err=%v", updatedTier, err)
	}
	const createdTierID = "30000000-0000-4000-8000-000000000098"
	createdTier, err := adapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{UnlockableID: createdTierID, ValidatedInput: UpsertUnlockableSpec{Input: UpsertUnlockableFields{Active: true, Kind: UnlockKindDmTier, Name: "New tier", Payload: []byte(`{"icon":"sun"}`)}}})
	if err != nil || createdTier.Id != createdTierID || createdTier.Kind != UnlockKindDmTier {
		t.Fatalf("created tier unlockable=%+v err=%v", createdTier, err)
	}
	for _, expected := range []struct{ id, kind string }{
		{secondUnlockable, "achievement"},
		{createdUnlockableID, "achievement"},
		{tierUnlockable, "dm_tier"},
		{createdTierID, "dm_tier"},
	} {
		var storedKind string
		if err := fixture.Pool.QueryRow(ctx, `SELECT kind FROM unlockables WHERE public_id=$1::uuid`, expected.id).Scan(&storedKind); err != nil || storedKind != expected.kind {
			t.Errorf("unlockable %s stored kind=%q err=%v, want %q", expected.id, storedKind, err, expected.kind)
		}
	}

	writeCounter := &memberBatchQueryCounter{DBTX: fixture.Pool}
	writeAdapter, err := NewProductPostgres(writeCounter)
	if err != nil {
		t.Fatal(err)
	}
	invalidKind := UnlockKind("cosmetic")
	if _, err := writeAdapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{UnlockableID: "30000000-0000-4000-8000-000000000097", ValidatedInput: UpsertUnlockableSpec{Input: UpsertUnlockableFields{Kind: invalidKind}}}); err == nil {
		t.Fatal("unknown unlock kind create succeeded")
	}
	if writeCounter.queries != 0 || writeCounter.requests != 0 {
		t.Fatalf("unknown unlock kind create reached database %d times", writeCounter.queries+writeCounter.requests)
	}
	writeCounter.reset()
	if _, err := writeAdapter.StoreUpsertUnlockable(ctx, UpsertUnlockableWrite{ValidatedInput: UpsertUnlockableSpec{Id: &secondUnlockable, Input: UpsertUnlockableFields{Kind: invalidKind}}, Locked: UpsertUnlockableState{Exists: true, SubjectID: secondUnlockable}}); err == nil {
		t.Fatal("unknown unlock kind update succeeded")
	}
	if writeCounter.queries != 0 || writeCounter.requests != 0 {
		t.Fatalf("unknown unlock kind reached database %d times", writeCounter.queries+writeCounter.requests)
	}

	batchMembers, err := adapter.ReadBatchMembers(ctx, requesterAuthority, []IDKey{{ID: other}, {ID: requester}, {ID: other}, {ID: "10000000-0000-4000-8000-000000000099"}, {ID: "invalid"}})
	if err != nil || len(batchMembers) != 5 || batchMembers[0].Value == nil || batchMembers[0].Value.Id != other || batchMembers[1].Value == nil || batchMembers[1].Value.Id != requester || batchMembers[2].Value == nil || batchMembers[2].Value.Id != other || batchMembers[3].Value != nil || batchMembers[3].Err != nil || batchMembers[4].Err == nil {
		t.Fatalf("batched members=%+v err=%v", batchMembers, err)
	}
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO discord_activity_events(event_id,kind,discord_user_id,channel_id,occurred_at,amount) VALUES
		('mem04-v1','voice','mem04-requester','voice-b',now()-interval '1 hour',120),
		('mem04-v2','voice','mem04-requester','voice-a',now()-interval '2 hours',60),
		('mem04-m1','message','mem04-requester','text-a',now()-interval '3 hours',3)`); err != nil {
		t.Fatal(err)
	}
	activity, err = adapter.ReadMemberActivityStats(ctx, requesterAuthority, MemberActivityStatsSpec{MemberId: requester})
	if err != nil || activity == nil || activity.Messages != 3 || activity.VoiceMinutes != 180 || activity.LongestSessionHours == nil || *activity.LongestSessionHours != 2 || activity.LastMessageAt == nil {
		t.Fatalf("populated activity stats=%+v err=%v", activity, err)
	}

	const characterID = "60000000-0000-4000-8000-000000000001"
	const assessmentID = "70000000-0000-4000-8000-000000000001"
	submittedAt := time.Now().UTC().Truncate(time.Microsecond)
	if _, err := fixture.Pool.Exec(ctx, `INSERT INTO characters(public_id,short_code,name,owner_id,status,verification_submitted_at) SELECT $1::uuid,'mem04-character','MEM04 character',id,'pending_approval',$3::timestamptz FROM members WHERE public_id=$2::uuid`, characterID, requester, submittedAt); err != nil {
		t.Fatal(err)
	}
	assessment, err := adapter.AppendAssessment(ctx, AssessmentSpec{SubjectType: "character", SubjectID: characterID, Verdict: VerificationVerdictApproved, ID: assessmentID, SubmissionToken: submittedAt.Format(time.RFC3339Nano), ActorID: dm, At: time.Now().UTC()})
	if err != nil || assessment.Id != assessmentID || assessment.TargetId != characterID || assessment.TargetType != "character" || assessment.Verdict != "approved" || assessment.VerifiedBy != dm {
		t.Fatalf("character assessment without evidence=%+v err=%v", assessment, err)
	}
	const dmAssessmentID = "70000000-0000-4000-8000-000000000002"
	profileRevision := int64(1)
	dmAssessment, err := adapter.AppendAssessment(ctx, AssessmentSpec{SubjectType: "dm_profile", SubjectID: dm, Verdict: VerificationVerdictRejected, ID: dmAssessmentID, ReviewRevision: &profileRevision, ActorID: requester, At: time.Now().UTC(), Note: stringPointer("needs revision")})
	if err != nil || dmAssessment.Id != dmAssessmentID || dmAssessment.TargetId != dm || dmAssessment.TargetType != "dm_profile" || dmAssessment.Verdict != "rejected" || dmAssessment.Note == nil || *dmAssessment.Note != "needs revision" {
		t.Fatalf("DM profile assessment=%+v err=%v", dmAssessment, err)
	}
	var reviewRevision int32
	if err := fixture.Pool.QueryRow(ctx, `SELECT review_revision FROM verifications WHERE public_id=$1::uuid`, dmAssessmentID).Scan(&reviewRevision); err != nil || reviewRevision != int32(profileRevision) {
		t.Fatalf("DM verification review revision=%d err=%v", reviewRevision, err)
	}
	voiceKeys := []MemberVoiceChannelsKey{{ParentID: requester, Limit: 1, Offset: 0}, {ParentID: other, Limit: 2, Offset: 0}, {ParentID: requester, Limit: 1, Offset: 0}}
	voice, err := adapter.ReadBatchMemberVoiceChannels(ctx, requesterAuthority, voiceKeys)
	if err != nil || len(voice) != 3 || voice[0].Value == nil || len(voice[0].Value.Items) != 1 || voice[0].Value.Items[0].ChannelId != "voice-b" || voice[1].Value == nil || len(voice[1].Value.Items) != 0 || voice[2].Value == nil || voice[2].Value.Items[0].ChannelId != "voice-b" {
		t.Fatalf("batched voice channels=%+v err=%v", voice, err)
	}
	sessions, err := adapter.ReadBatchMemberRecentSessions(ctx, requesterAuthority, []MemberRecentSessionsKey{{ParentID: requester, Limit: 2}, {ParentID: requester, Limit: 2}, {ParentID: "invalid", Limit: 2}})
	if err != nil || len(sessions) != 3 || sessions[0].Value == nil || len(sessions[0].Value.Items) != 2 || sessions[0].Value.Items[0].ChannelId != "voice-b" || sessions[1].Value == nil || sessions[1].Value.Items[1].ChannelId != "voice-a" || sessions[2].Err == nil {
		t.Fatalf("batched recent sessions=%+v err=%v", sessions, err)
	}
	weeks, err := adapter.ReadBatchMemberRecentWeeks(ctx, requesterAuthority, []MemberRecentWeeksKey{{ParentID: requester, Limit: 1}, {ParentID: requester, Limit: 1}, {ParentID: other, Limit: 1}})
	if err != nil || len(weeks) != 3 || weeks[0].Value == nil || len(weeks[0].Value.Items) != 1 || weeks[0].Value.Items[0].Messages != 3 || weeks[0].Value.Items[0].VoiceMinutes != 180 || weeks[1].Value == nil || weeks[2].Value == nil || len(weeks[2].Value.Items) != 0 {
		t.Fatalf("batched recent weeks=%+v err=%v", weeks, err)
	}

	counted, err := NewProductPostgres(&memberBatchQueryCounter{DBTX: fixture.Pool})
	if err != nil {
		t.Fatal(err)
	}
	const missingMember = "10000000-0000-4000-8000-000000000099"
	for _, width := range []int{1, 10, 50} {
		memberIDs := make([]string, width)
		for i := range memberIDs {
			memberIDs[i] = []string{requester, other, missingMember}[i%3]
		}
		counter := counted.DB.(*memberBatchQueryCounter)
		memberKeys := make([]IDKey, width)
		for i, id := range memberIDs {
			memberKeys[i] = IDKey{ID: id}
		}
		counter.reset()
		members, err := counted.ReadBatchMembers(ctx, requesterAuthority, memberKeys)
		if err != nil || len(members) != width || counter.queries != 1 || counter.requests != 0 {
			t.Fatalf("batch members width=%d result=%+v calls=(%d queries,%d other) err=%v", width, members, counter.queries, counter.requests, err)
		}
		for i, id := range memberIDs {
			if id == missingMember {
				if members[i].Value != nil || members[i].Err != nil {
					t.Errorf("batch members width=%d key[%d]=%s result=%+v", width, i, id, members[i])
				}
			} else if members[i].Value == nil || members[i].Value.Id != id || members[i].Err != nil {
				t.Errorf("batch members width=%d key[%d]=%s result=%+v", width, i, id, members[i])
			}
		}

		voiceKeys := make([]MemberVoiceChannelsKey, width)
		sessionKeys := make([]MemberRecentSessionsKey, width)
		weekKeys := make([]MemberRecentWeeksKey, width)
		for i, id := range memberIDs {
			voiceKeys[i] = MemberVoiceChannelsKey{ParentID: id, Limit: 50}
			sessionKeys[i] = MemberRecentSessionsKey{ParentID: id, Limit: 50}
			weekKeys[i] = MemberRecentWeeksKey{ParentID: id, Limit: 50}
		}
		counter.reset()
		voiceResults, err := counted.ReadBatchMemberVoiceChannels(ctx, requesterAuthority, voiceKeys)
		if err != nil || len(voiceResults) != width || counter.queries != 1 || counter.requests != 0 {
			t.Fatalf("batch voice width=%d calls=(%d queries,%d other) err=%v", width, counter.queries, counter.requests, err)
		}
		for i, id := range memberIDs {
			want := 0
			if id == requester {
				want = 2
			}
			if voiceResults[i].Value == nil || len(voiceResults[i].Value.Items) != want || voiceResults[i].Err != nil {
				t.Errorf("batch voice width=%d key[%d]=%s result=%+v, want %d items", width, i, id, voiceResults[i], want)
			}
		}

		counter.reset()
		sessionResults, err := counted.ReadBatchMemberRecentSessions(ctx, requesterAuthority, sessionKeys)
		if err != nil || len(sessionResults) != width || counter.queries != 1 || counter.requests != 0 {
			t.Fatalf("batch sessions width=%d calls=(%d queries,%d other) err=%v", width, counter.queries, counter.requests, err)
		}
		for i, id := range memberIDs {
			want := 0
			if id == requester {
				want = 2
			}
			if sessionResults[i].Value == nil || len(sessionResults[i].Value.Items) != want || sessionResults[i].Err != nil {
				t.Errorf("batch sessions width=%d key[%d]=%s result=%+v, want %d items", width, i, id, sessionResults[i], want)
			}
		}

		counter.reset()
		weekResults, err := counted.ReadBatchMemberRecentWeeks(ctx, requesterAuthority, weekKeys)
		if err != nil || len(weekResults) != width || counter.queries != 1 || counter.requests != 0 {
			t.Fatalf("batch weeks width=%d calls=(%d queries,%d other) err=%v", width, counter.queries, counter.requests, err)
		}
		for i, id := range memberIDs {
			want := 0
			if id == requester {
				want = 1
			}
			if weekResults[i].Value == nil || len(weekResults[i].Value.Items) != want || weekResults[i].Err != nil {
				t.Errorf("batch weeks width=%d key[%d]=%s result=%+v, want %d items", width, i, id, weekResults[i], want)
			} else if id == requester && (weekResults[i].Value.Items[0].Messages != 3 || weekResults[i].Value.Items[0].VoiceMinutes != 180) {
				t.Errorf("batch weeks width=%d key[%d]=%s item=%+v", width, i, id, weekResults[i].Value.Items[0])
			}
		}
	}
}
