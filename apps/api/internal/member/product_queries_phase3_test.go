package member

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const querySelfID = "10000000-0000-4000-8000-000000000001"
const queryOtherID = "10000000-0000-4000-8000-000000000002"

type queryRepository struct {
	calls     []string
	actor     auth.Authority
	spec      any
	err       error
	member    MemberView
	snapshot  GrantSnapshot
	batchKeys any
	batch     []product.BatchResult[MemberView]
}

func (r *queryRepository) called(method string, actor auth.Authority, spec any) {
	r.calls = append(r.calls, method)
	r.actor = actor
	r.spec = spec
}
func (r *queryRepository) ReadCommunityDirectory(_ context.Context, actor auth.Authority, spec CommunityDirectorySpec) (CommunityDirectoryResult, error) {
	r.called("CommunityDirectory", actor, spec)
	return CommunityDirectoryResult{Total: 7}, r.err
}
func (r *queryRepository) ReadDmRequests(_ context.Context, actor auth.Authority, spec DmRequestsSpec) (RequestPage, error) {
	r.called("DmRequests", actor, spec)
	return RequestPage{Total: 7}, r.err
}
func (r *queryRepository) ReadIsFollowing(_ context.Context, actor auth.Authority, spec IsFollowingSpec) (bool, error) {
	r.called("IsFollowing", actor, spec)
	return true, r.err
}
func (r *queryRepository) ReadMember(_ context.Context, actor auth.Authority, spec MemberSpec) (*MemberView, error) {
	r.called("Member", actor, spec)
	return &r.member, r.err
}
func (r *queryRepository) ReadMemberActivityStats(_ context.Context, actor auth.Authority, spec MemberActivityStatsSpec) (*MemberActivityStatsView, error) {
	r.called("MemberActivityStats", actor, spec)
	return &MemberActivityStatsView{MemberID: queryOtherID}, r.err
}
func (r *queryRepository) ReadMemberAvailability(_ context.Context, actor auth.Authority, spec MemberAvailabilitySpec) ([]AvailabilitySlotView, error) {
	r.called("MemberAvailability", actor, spec)
	return []AvailabilitySlotView{{Day: "MONDAY"}}, r.err
}
func (r *queryRepository) ReadMemberByDiscordId(_ context.Context, actor auth.Authority, spec MemberByDiscordIdSpec) (*MemberView, error) {
	r.called("MemberByDiscordId", actor, spec)
	return &r.member, r.err
}
func (r *queryRepository) ReadMemberMe(_ context.Context, actor auth.Authority, spec MemberMeSpec) (MemberView, error) {
	r.called("MemberMe", actor, spec)
	return r.member, r.err
}
func (r *queryRepository) ReadMemberProfile(_ context.Context, actor auth.Authority, spec MemberProfileSpec) (*MemberProfileView, error) {
	r.called("MemberProfile", actor, spec)
	return &MemberProfileView{Member: r.member}, r.err
}
func (r *queryRepository) ReadMemberRoleHistory(_ context.Context, actor auth.Authority, spec MemberRoleHistorySpec) (RoleChangePage, error) {
	r.called("MemberRoleHistory", actor, spec)
	return RoleChangePage{Total: 7}, r.err
}
func (r *queryRepository) ReadMembers(_ context.Context, actor auth.Authority, spec MembersSpec) (MemberListResult, error) {
	r.called("Members", actor, spec)
	return MemberListResult{Items: []MemberView{r.member}, Total: 7}, r.err
}
func (r *queryRepository) ReadMyAvailability(_ context.Context, actor auth.Authority, spec MyAvailabilitySpec) ([]AvailabilitySlotView, error) {
	r.called("MyAvailability", actor, spec)
	return []AvailabilitySlotView{{Day: "MONDAY"}}, r.err
}
func (r *queryRepository) ReadMyPersonalization(_ context.Context, actor auth.Authority, spec MyPersonalizationSpec) (*MyPersonalizationView, error) {
	r.called("MyPersonalization", actor, spec)
	return &MyPersonalizationView{}, r.err
}
func (r *queryRepository) ReadMyRequests(_ context.Context, actor auth.Authority, spec MyRequestsSpec) (RequestPage, error) {
	r.called("MyRequests", actor, spec)
	return RequestPage{Total: 7}, r.err
}
func (r *queryRepository) ReadMyUnlocks(_ context.Context, actor auth.Authority, spec MyUnlocksSpec) (GrantSnapshot, error) {
	r.called("MyUnlocks", actor, spec)
	return r.snapshot, r.err
}
func (r *queryRepository) ReadPendingDmProfileVerifications(_ context.Context, actor auth.Authority, spec PendingDmProfileVerificationsSpec) (CommunityDirectoryResult, error) {
	r.called("PendingDmProfileVerifications", actor, spec)
	return CommunityDirectoryResult{Total: 7}, r.err
}
func (r *queryRepository) ReadUnlockablesCatalog(_ context.Context, actor auth.Authority, spec UnlockablesCatalogSpec) (UnlockablePage, error) {
	r.called("UnlockablesCatalog", actor, spec)
	return UnlockablePage{Total: 7}, r.err
}

func (r *queryRepository) ReadBatchMembers(_ context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[MemberView], error) {
	r.actor = actor
	r.batchKeys = keys
	return r.batch, r.err
}
func (r *queryRepository) ReadBatchMemberVoiceChannels(_ context.Context, actor auth.Authority, keys []MemberVoiceChannelsKey) ([]product.BatchResult[VoiceChannelList], error) {
	r.actor = actor
	r.batchKeys = keys
	out := make([]product.BatchResult[VoiceChannelList], len(keys))
	for i := range out {
		out[i].Value = &VoiceChannelList{}
	}
	return out, r.err
}
func (r *queryRepository) ReadBatchMemberRecentSessions(_ context.Context, actor auth.Authority, keys []MemberRecentSessionsKey) ([]product.BatchResult[ActivityEventList], error) {
	r.actor = actor
	r.batchKeys = keys
	out := make([]product.BatchResult[ActivityEventList], len(keys))
	for i := range out {
		out[i].Value = &ActivityEventList{}
	}
	return out, r.err
}
func (r *queryRepository) ReadBatchMemberRecentWeeks(_ context.Context, actor auth.Authority, keys []MemberRecentWeeksKey) ([]product.BatchResult[WeekActivityList], error) {
	r.actor = actor
	r.batchKeys = keys
	out := make([]product.BatchResult[WeekActivityList], len(keys))
	for i := range out {
		out[i].Value = &WeekActivityList{}
	}
	return out, r.err
}

type queryPolicyFacts struct{ err error }

func (*queryPolicyFacts) HasArchon(context.Context, string, string) (bool, error) {
	panic("unexpected archon lookup")
}
func (*queryPolicyFacts) HasLieutenant(context.Context, string, string) (bool, error) {
	panic("unexpected lieutenant lookup")
}
func (*queryPolicyFacts) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	panic("unexpected document lookup")
}
func (p *queryPolicyFacts) DiscordIdentity(_ context.Context, id string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{MemberID: id, DiscordID: "self-discord"}, p.err
}
func (*queryPolicyFacts) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	panic("unexpected summary lookup")
}

type queryObserver struct{ facts []auth.OverrideFact }

func (o *queryObserver) Observe(_ context.Context, fact auth.OverrideFact) {
	o.facts = append(o.facts, fact)
}

func queryActor(t *testing.T, roles ...auth.Role) auth.Authority {
	t.Helper()
	actor, err := auth.NewAuthority(querySelfID, roles, "active", "approved")
	if err != nil {
		t.Fatal(err)
	}
	return actor
}
func queryService(t *testing.T) (*ProductQueries, *queryRepository, *queryObserver) {
	t.Helper()
	facts := &queryPolicyFacts{}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	discord := "other-discord"
	repo := &queryRepository{member: MemberView{Id: queryOtherID, DiscordId: &discord}}
	observer := &queryObserver{}
	service, err := NewProductQueries(ProductReadRepos{Member: repo, Social: repo, Reference: repo, Batch: repo}, policy, func() time.Time { return time.Date(2026, 10, 18, 10, 0, 0, 123456789, time.UTC) }, observer, NewGrantReconciler())
	if err != nil {
		t.Fatal(err)
	}
	return service, repo, observer
}
func requireQueryCode(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	var expected *apierr.Error
	if !errors.As(err, &expected) || expected.Code != code {
		t.Fatalf("want %s, got %v", code, err)
	}
}

func TestProductQueriesConstructorRejectsEveryMissingDependency(t *testing.T) {
	service, _, _ := queryService(t)
	for _, typed := range []bool{false, true} {
		for index := range 8 {
			reads, policy, clock, observer, reconciler := service.Reads, service.Policy, service.Clock, service.OverrideReads, service.Reconciler
			var repo *queryRepository
			var obs *queryObserver
			var rec *PureGrantReconciler
			switch index {
			case 0:
				reads.Member = nil
				if typed {
					reads.Member = repo
				}
			case 1:
				reads.Reference = nil
				if typed {
					reads.Reference = repo
				}
			case 2:
				reads.Social = nil
				if typed {
					reads.Social = repo
				}
			case 3:
				reads.Batch = nil
				if typed {
					reads.Batch = repo
				}
			case 4:
				policy = nil
			case 5:
				clock = nil
			case 6:
				observer = nil
				if typed {
					observer = obs
				}
			case 7:
				reconciler = nil
				if typed {
					reconciler = rec
				}
			}
			got, err := NewProductQueries(reads, policy, clock, observer, reconciler)
			if got != nil {
				t.Fatal("constructed missing dependency")
			}
			requireQueryCode(t, err, apierr.Internal)
		}
	}
}

func TestProductQueriesReadMethodsDelegateExactAuthorityAndSpecs(t *testing.T) {
	s, r, _ := queryService(t)
	actor := queryActor(t, auth.Admin, auth.DM)
	cases := []struct {
		name string
		spec any
		read func() (any, error)
	}{
		{"CommunityDirectory", CommunityDirectorySpec{Limit: 50, Offset: 3}, func() (any, error) {
			return s.CommunityDirectory(t.Context(), actor, CommunityDirectorySpec{Limit: 50, Offset: 3})
		}},
		{"Member", MemberSpec{Id: queryPointer(queryOtherID)}, func() (any, error) { return s.Member(t.Context(), actor, MemberSpec{Id: queryPointer(queryOtherID)}) }},
		{"MemberActivityStats", MemberActivityStatsSpec{MemberId: queryOtherID}, func() (any, error) {
			return s.MemberActivityStats(t.Context(), actor, MemberActivityStatsSpec{MemberId: queryOtherID})
		}},
		{"MemberAvailability", MemberAvailabilitySpec{MemberId: queryOtherID}, func() (any, error) {
			return s.MemberAvailability(t.Context(), actor, MemberAvailabilitySpec{MemberId: queryOtherID})
		}},
		{"MemberByDiscordId", MemberByDiscordIdSpec{DiscordId: "self-discord"}, func() (any, error) {
			return s.MemberByDiscordId(t.Context(), actor, MemberByDiscordIdSpec{DiscordId: "self-discord"})
		}},
		{"MemberMe", MemberMeSpec{}, func() (any, error) { return s.MemberMe(t.Context(), actor, MemberMeSpec{}) }},
		{"MemberProfile", MemberProfileSpec{Handle: "other"}, func() (any, error) { return s.MemberProfile(t.Context(), actor, MemberProfileSpec{Handle: "other"}) }},
		{"MemberRoleHistory", MemberRoleHistorySpec{MemberId: queryOtherID, Limit: 10, Offset: 3}, func() (any, error) {
			return s.MemberRoleHistory(t.Context(), actor, MemberRoleHistorySpec{MemberId: queryOtherID, Limit: 10, Offset: 3})
		}},
		{"Members", MembersSpec{Limit: 10, Offset: 3}, func() (any, error) { return s.Members(t.Context(), actor, MembersSpec{Limit: 10, Offset: 3}) }},
		{"MyAvailability", MyAvailabilitySpec{}, func() (any, error) { return s.MyAvailability(t.Context(), actor, MyAvailabilitySpec{}) }},
		{"MyPersonalization", MyPersonalizationSpec{}, func() (any, error) { return s.MyPersonalization(t.Context(), actor, MyPersonalizationSpec{}) }},
		{"MyUnlocks", MyUnlocksSpec{Limit: 10, Offset: 3}, func() (any, error) { return s.MyUnlocks(t.Context(), actor, MyUnlocksSpec{Limit: 10, Offset: 3}) }},
		{"PendingDmProfileVerifications", PendingDmProfileVerificationsSpec{Limit: 10, Offset: 3}, func() (any, error) {
			return s.PendingDmProfileVerifications(t.Context(), actor, PendingDmProfileVerificationsSpec{Limit: 10, Offset: 3})
		}},
		{"UnlockablesCatalog", UnlockablesCatalogSpec{Limit: 10, Offset: 3}, func() (any, error) {
			return s.UnlockablesCatalog(t.Context(), actor, UnlockablesCatalogSpec{Limit: 10, Offset: 3})
		}},
	}
	sentinel := errors.New("database unavailable")
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r.calls = nil
			r.err = nil
			if _, err := tc.read(); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(r.calls, []string{tc.name}) || !reflect.DeepEqual(r.spec, tc.spec) || r.actor.Claims().MemberID != querySelfID {
				t.Fatalf("wrong delegation: calls=%v spec=%#v actor=%v", r.calls, r.spec, r.actor.Claims())
			}
			r.err = sentinel
			if _, err := tc.read(); !errors.Is(err, sentinel) {
				t.Fatalf("lost repository error: %v", err)
			}
		})
	}
}
func queryPointer[T any](value T) *T { return &value }

func TestProductQueriesRejectInvalidInputsBeforeRepository(t *testing.T) {
	s, r, _ := queryService(t)
	actor := queryActor(t, auth.Admin)
	cases := []func() error{
		func() error { _, err := s.Member(t.Context(), actor, MemberSpec{}); return err },
		func() error {
			_, err := s.Member(t.Context(), actor, MemberSpec{Id: queryPointer(queryOtherID), Handle: queryPointer("other")})
			return err
		},
		func() error { _, err := s.Member(t.Context(), actor, MemberSpec{Id: queryPointer("bad")}); return err },
		func() error {
			_, err := s.MemberProfile(t.Context(), actor, MemberProfileSpec{Handle: " "})
			return err
		},
		func() error { _, err := s.Members(t.Context(), actor, MembersSpec{Limit: 0}); return err },
		func() error { _, err := s.Members(t.Context(), actor, MembersSpec{Limit: 1, Offset: -1}); return err },
		func() error {
			_, err := s.Members(t.Context(), actor, MembersSpec{Limit: 1, Sort: queryPointer(MemberSortInput("random"))})
			return err
		},
		func() error {
			_, err := s.Members(t.Context(), actor, MembersSpec{Limit: 1, Filters: &MemberFiltersFields{Role: queryPointer("owner")}})
			return err
		},
		func() error {
			_, err := s.CommunityDirectory(t.Context(), actor, CommunityDirectorySpec{Limit: 1, Filters: &CommunityDirectoryFiltersFields{DmProfileStatus: queryPointer("bogus")}})
			return err
		},
		func() error {
			_, err := s.MemberActivityStats(t.Context(), actor, MemberActivityStatsSpec{MemberId: "invalid"})
			return err
		},
		func() error { _, err := s.MemberByDiscordId(t.Context(), actor, MemberByDiscordIdSpec{}); return err },
	}
	for i, read := range cases {
		requireQueryCode(t, read(), apierr.Invalid)
		if len(r.calls) != 0 {
			t.Fatalf("case %d reached repository", i)
		}
	}
	upper := "10000000-0000-4000-8000-0000000000AB"
	if _, err := s.Member(t.Context(), actor, MemberSpec{Id: &upper}); err != nil {
		t.Fatal(err)
	}
	if *r.spec.(MemberSpec).Id != "10000000-0000-4000-8000-0000000000ab" || upper != "10000000-0000-4000-8000-0000000000AB" {
		t.Fatal("ID normalization mutated caller or failed")
	}
}

func TestProductQueriesCanonicalPolicyDeniesBeforeDataAndObservesOwnerOverride(t *testing.T) {
	s, r, o := queryService(t)
	anonymous := auth.Authority{}
	player := queryActor(t, auth.Player)
	dm := queryActor(t, auth.DM)
	cases := []func() error{
		func() error { _, err := s.MemberMe(t.Context(), anonymous, MemberMeSpec{}); return err },
		func() error { _, err := s.MyAvailability(t.Context(), anonymous, MyAvailabilitySpec{}); return err },
		func() error {
			_, err := s.MyPersonalization(t.Context(), anonymous, MyPersonalizationSpec{})
			return err
		},
		func() error { _, err := s.MyUnlocks(t.Context(), anonymous, MyUnlocksSpec{Limit: 1}); return err },
		func() error {
			_, err := s.MemberRoleHistory(t.Context(), player, MemberRoleHistorySpec{MemberId: queryOtherID, Limit: 1})
			return err
		},
		func() error {
			_, err := s.PendingDmProfileVerifications(t.Context(), dm, PendingDmProfileVerificationsSpec{Limit: 1})
			return err
		},
		func() error {
			_, err := s.MemberByDiscordId(t.Context(), player, MemberByDiscordIdSpec{DiscordId: "foreign"})
			return err
		},
	}
	for _, read := range cases {
		requireQueryCode(t, read(), apierr.Forbidden)
	}
	if len(r.calls) != 0 || len(o.facts) != 0 {
		t.Fatal("denied read reached data or observation")
	}
	owner, err := auth.NewAuthorityWithOwner(querySelfID, []auth.Role{auth.Player}, "active", "", "owner", querySelfID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.MemberRoleHistory(t.Context(), owner, MemberRoleHistorySpec{MemberId: queryOtherID, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(o.facts) != 1 {
		t.Fatalf("override facts %v", o.facts)
	}
	fact := o.facts[0]
	if fact.ActorID != querySelfID || fact.SubjectID != queryOtherID || fact.Operation != "Query.memberRoleHistory" || fact.RuleCode != "ROLE" || fact.At.Nanosecond() != 123456000 {
		t.Fatalf("unsafe or incorrect fact %#v", fact)
	}
}

func TestProductQueriesMemberDiscordPrivacyAcrossAllShapes(t *testing.T) {
	s, r, _ := queryService(t)
	for _, actor := range []auth.Authority{auth.Authority{}, queryActor(t, auth.Player), queryActor(t, auth.Admin)} {
		want := actor.Claims().Has(auth.Admin)
		direct, err := s.Member(t.Context(), actor, MemberSpec{Id: queryPointer(queryOtherID)})
		if err != nil {
			t.Fatal(err)
		}
		list, err := s.Members(t.Context(), actor, MembersSpec{Limit: 1})
		if err != nil {
			t.Fatal(err)
		}
		profile, err := s.MemberProfile(t.Context(), actor, MemberProfileSpec{Handle: "other"})
		if err != nil {
			t.Fatal(err)
		}
		r.batch = []product.BatchResult[MemberView]{{Value: &r.member}, {Value: &r.member}}
		batch, err := s.BatchMembers(t.Context(), actor, []IDKey{{ID: queryOtherID}, {ID: queryOtherID}})
		if err != nil {
			t.Fatal(err)
		}
		for _, view := range []*MemberView{direct, &list.Items[0], &profile.Member, batch[0].Value, batch[1].Value} {
			if (view.DiscordId != nil) != want {
				t.Fatalf("privacy actor=%v view=%#v", actor.Claims(), view)
			}
		}
		if r.member.DiscordId == nil {
			t.Fatal("projection mutated shared repository value")
		}
	}
	r.member.Id = querySelfID
	own, err := s.Member(t.Context(), queryActor(t, auth.Player), MemberSpec{Id: queryPointer(querySelfID)})
	if err != nil || own.DiscordId == nil {
		t.Fatalf("self discord hidden: %v", err)
	}
}

func TestProductQueriesUnlocksReconcileAllGrantsWithoutChangingPage(t *testing.T) {
	s, r, _ := queryService(t)
	r.snapshot = GrantSnapshot{PagedGrants: []MemberUnlockView{}, Total: 2, DriverProgress: DriverProgressView{DmSessionsCount: 4}, Catalog: []UnlockableView{{Id: "achievement", Kind: UnlockKindAchievement, Name: "earned"}, {Id: "tier", Kind: UnlockKindDmTier, Name: "veteran"}}, AllGrants: []MemberUnlockView{{UnlockableId: "achievement"}, {UnlockableId: "tier"}}}
	got, err := s.MyUnlocks(t.Context(), queryActor(t, auth.Player), MyUnlocksSpec{Limit: 1, Offset: 2})
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 2 || len(got.Items) != 0 || got.DmTier != "veteran" || !reflect.DeepEqual(got.UnlockedAchievements, []string{"earned"}) || got.DriverProgress.DmSessionsCount != 4 {
		t.Fatalf("wrong grant projection %#v", got)
	}
	r.snapshot.Catalog = nil
	if _, err := s.MyUnlocks(t.Context(), queryActor(t, auth.Player), MyUnlocksSpec{Limit: 1}); err == nil {
		t.Fatal("missing catalog dependency hidden")
	}
}

func TestProductQueriesBatchCorrespondenceInvalidKeysAndErrors(t *testing.T) {
	s, r, _ := queryService(t)
	actor := queryActor(t, auth.Player)
	sentinel := errors.New("one item failed")
	r.batch = []product.BatchResult[MemberView]{{Value: &r.member}, {Err: sentinel}, {Value: nil}}
	out, err := s.BatchMembers(t.Context(), actor, []IDKey{{ID: queryOtherID}, {ID: "bad"}, {ID: queryOtherID}, {ID: querySelfID}})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 4 || out[0].Value == nil || !errors.Is(out[2].Err, sentinel) || out[3].Value != nil {
		t.Fatalf("wrong correspondence %#v", out)
	}
	requireQueryCode(t, out[1].Err, apierr.Invalid)
	if !reflect.DeepEqual(r.batchKeys, []IDKey{{ID: queryOtherID}, {ID: queryOtherID}, {ID: querySelfID}}) {
		t.Fatalf("keys changed %#v", r.batchKeys)
	}
	r.batch = nil
	_, err = s.BatchMembers(t.Context(), actor, []IDKey{{ID: querySelfID}})
	requireQueryCode(t, err, apierr.Internal)
	r.err = sentinel
	_, err = s.BatchMembers(t.Context(), actor, []IDKey{{ID: querySelfID}})
	if !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
	r.err = nil
	sessions, err := s.BatchMemberRecentSessions(t.Context(), actor, []MemberRecentSessionsKey{{ParentID: querySelfID, Limit: 1}, {ParentID: queryOtherID, Limit: 101}, {ParentID: querySelfID, Limit: 2, Offset: 3}})
	if err != nil {
		t.Fatal(err)
	}
	requireQueryCode(t, sessions[1].Err, apierr.Invalid)
	if sessions[0].Value == nil || sessions[2].Value == nil {
		t.Fatal("valid activity keys dropped")
	}
	weeks, err := s.BatchMemberRecentWeeks(t.Context(), actor, []MemberRecentWeeksKey{{ParentID: querySelfID, Limit: 12}, {ParentID: querySelfID, Limit: 13}})
	if err != nil {
		t.Fatal(err)
	}
	requireQueryCode(t, weeks[1].Err, apierr.Invalid)
	voices, err := s.BatchMemberVoiceChannels(t.Context(), actor, []MemberVoiceChannelsKey{{ParentID: querySelfID, Limit: 1}, {ParentID: queryOtherID, Limit: 1, Offset: -1}})
	if err != nil {
		t.Fatal(err)
	}
	requireQueryCode(t, voices[1].Err, apierr.Invalid)
	r.batchKeys = nil
	empty, err := s.BatchMembers(t.Context(), actor, nil)
	if err != nil || len(empty) != 0 || r.batchKeys != nil {
		t.Fatal("empty batch queried repository")
	}
}
