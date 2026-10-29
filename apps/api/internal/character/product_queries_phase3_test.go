package character

import (
	"context"
	"errors"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"testing"
	"time"
)

const cqSelf = "10000000-0000-4000-8000-000000000001"
const cqOther = "10000000-0000-4000-8000-000000000002"

type cqRepo struct {
	calls   int
	value   *CharacterView
	err     error
	visible map[string]bool
}

func (r *cqRepo) ReadAdminCharacterDirectory(_ context.Context, _ auth.Authority, _ AdminCharacterDirectorySpec) (AdminCharacterDirectoryView, error) {
	r.calls++
	return AdminCharacterDirectoryView{}, r.err
}
func (r *cqRepo) ReadBackstories(_ context.Context, _ auth.Authority, _ BackstoriesSpec) (BackstoryPage, error) {
	r.calls++
	return BackstoryPage{}, r.err
}
func (r *cqRepo) ReadCharacter(_ context.Context, _ auth.Authority, _ CharacterSpec) (*CharacterView, error) {
	r.calls++
	return r.value, r.err
}
func (r *cqRepo) ReadCharacterLogs(_ context.Context, _ auth.Authority, _ CharacterLogsSpec) (CharacterLogListResult, error) {
	r.calls++
	return CharacterLogListResult{}, r.err
}
func (r *cqRepo) ReadCharacterProgression(_ context.Context, _ auth.Authority, _ CharacterProgressionSpec) (ProgressionListResult, error) {
	r.calls++
	return ProgressionListResult{}, r.err
}
func (r *cqRepo) ReadCharacterSummaries(_ context.Context, _ auth.Authority, _ CharacterSummariesSpec) (document.DocumentListResult, error) {
	r.calls++
	return document.DocumentListResult{}, r.err
}
func (r *cqRepo) ReadCharacterVerificationHistory(_ context.Context, _ auth.Authority, _ CharacterVerificationHistorySpec) (member.VerificationPage, error) {
	r.calls++
	return member.VerificationPage{}, r.err
}
func (r *cqRepo) ReadCharacters(_ context.Context, _ auth.Authority, _ CharactersSpec) (CharacterListResult, error) {
	r.calls++
	return CharacterListResult{Items: []CharacterView{*r.value}, Total: 1}, r.err
}
func (r *cqRepo) ReadCoPlayers(_ context.Context, _ auth.Authority, _ CoPlayersSpec) (CoPlayerPage, error) {
	r.calls++
	return CoPlayerPage{}, r.err
}
func (r *cqRepo) ReadCreationCatalog(_ context.Context, _ auth.Authority, _ CreationCatalogSpec) (CreationCatalogPage, error) {
	r.calls++
	return CreationCatalogPage{}, r.err
}
func (r *cqRepo) ReadDowntimeProjects(_ context.Context, _ auth.Authority, _ DowntimeProjectsSpec) (DowntimeProjectListResult, error) {
	r.calls++
	return DowntimeProjectListResult{}, r.err
}
func (r *cqRepo) ReadMyCharacters(_ context.Context, _ auth.Authority, _ MyCharactersSpec) (CharacterListResult, error) {
	r.calls++
	return CharacterListResult{Items: []CharacterView{*r.value}, Total: 1}, r.err
}
func (r *cqRepo) ReadMyQuestRewards(_ context.Context, _ auth.Authority, _ MyQuestRewardsSpec) (RewardEntitlementPage, error) {
	r.calls++
	return RewardEntitlementPage{}, r.err
}
func (r *cqRepo) ReadParticipationsByCharacter(_ context.Context, _ auth.Authority, _ ParticipationsByCharacterSpec) (ParticipationPageView, error) {
	r.calls++
	return ParticipationPageView{}, r.err
}
func (r *cqRepo) ReadPendingCharacterVerifications(_ context.Context, _ auth.Authority, _ PendingCharacterVerificationsSpec) (AdminCharacterDirectoryView, error) {
	r.calls++
	return AdminCharacterDirectoryView{}, r.err
}
func (r *cqRepo) ReadableDocumentIDs(context.Context, auth.Authority, []string) (map[string]bool, error) {
	return r.visible, r.err
}

type cqPolicyFacts struct{ err error }

func (*cqPolicyFacts) HasArchon(context.Context, string, string) (bool, error) {
	panic("unexpected archon lookup")
}
func (*cqPolicyFacts) HasLieutenant(context.Context, string, string) (bool, error) {
	panic("unexpected lieutenant lookup")
}
func (*cqPolicyFacts) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	panic("unexpected document lookup")
}
func (p *cqPolicyFacts) DiscordIdentity(_ context.Context, id string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{MemberID: id, DiscordID: "self-discord"}, p.err
}
func (*cqPolicyFacts) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	panic("unexpected summary lookup")
}

type cqObserver struct{ facts []auth.OverrideFact }

func (o *cqObserver) Observe(_ context.Context, f auth.OverrideFact) { o.facts = append(o.facts, f) }
func cqService(t *testing.T) (*ProductQueries, *cqRepo, *cqObserver, auth.Authority) {
	t.Helper()
	actor, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	r := &cqRepo{value: &CharacterView{Id: cqOther, OwnerId: cqOther, CreatedAt: time.Date(2026, 1, 5, 23, 0, 0, 0, time.FixedZone("plus", 3600))}, visible: map[string]bool{}}
	o := &cqObserver{}
	facts := &cqPolicyFacts{}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewProductQueries(ProductReadRepos{Character: r, Reference: r, DocumentAudience: r}, policy, func() time.Time { return time.Date(2026, 10, 18, 11, 0, 0, 0, time.UTC) }, o)
	if err != nil {
		t.Fatal(err)
	}
	return s, r, o, actor
}
func TestCharacterProductQueriesBoundariesAndAuthorization(t *testing.T) {
	s, r, _, a := cqService(t)
	ctx := context.Background()
	checks := []func() error{
		func() error { _, e := s.Character(ctx, a, CharacterSpec{}); return e },
		func() error { _, e := s.Character(ctx, a, CharacterSpec{Id: &[]string{"invalid"}[0]}); return e },
		func() error { _, e := s.Characters(ctx, a, CharactersSpec{Limit: 0}); return e },
		func() error {
			_, e := s.CharacterLogs(ctx, a, CharacterLogsSpec{CharacterId: cqOther, Limit: 1, Offset: -1})
			return e
		},
		func() error {
			_, e := s.AdminCharacterDirectory(ctx, a, AdminCharacterDirectorySpec{Limit: 1})
			return e
		},
		func() error {
			_, e := s.PendingCharacterVerifications(ctx, a, PendingCharacterVerificationsSpec{Limit: 1})
			return e
		},
		func() error {
			_, e := s.Backstories(ctx, a, BackstoriesSpec{Limit: 1, Filters: &BackstoryFiltersFields{IncludeRetired: true}})
			return e
		},
		func() error {
			_, e := s.CreationCatalog(ctx, a, CreationCatalogSpec{Limit: 1, Filters: &CreationCatalogFiltersFields{IncludeAll: true}})
			return e
		},
	}
	for i, check := range checks {
		if check() == nil {
			t.Errorf("case %d allowed", i)
		}
	}
	if r.calls != 0 {
		t.Fatalf("unauthorized/invalid repository calls %d", r.calls)
	}
}
func TestCharacterProductQueriesProjectionAndErrors(t *testing.T) {
	s, r, o, a := cqService(t)
	ctx := context.Background()
	guild := cqOther
	r.value.GuildId = &guild
	r.value.DdbLastAttempt = &DdbAttemptView{Succeeded: true}
	got, err := s.Character(ctx, a, CharacterSpec{Id: &guild})
	if err != nil {
		t.Fatal(err)
	}
	if got.DaysActive != 286 {
		t.Fatal("UTC age", got.DaysActive)
	}
	if got.GuildId != nil || got.DdbLastAttempt != nil {
		t.Fatal("private references exposed")
	}
	if r.value.GuildId == nil || r.value.DdbLastAttempt == nil {
		t.Fatal("repository value mutated")
	}
	r.value.OwnerId = cqSelf
	r.visible[guild] = true
	got, err = s.Character(ctx, a, CharacterSpec{Id: &guild})
	if err != nil || got.GuildId == nil || got.DdbLastAttempt == nil {
		t.Fatal("own readable projection lost", err)
	}
	sentinel := errors.New("database read failed")
	r.err = sentinel
	if _, err = s.Character(ctx, a, CharacterSpec{Id: &guild}); !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
	if len(o.facts) != 0 {
		t.Fatal("public read emitted override")
	}
	r.err = nil
	r.value = nil
	if _, err = s.CharacterLogs(ctx, a, CharacterLogsSpec{CharacterId: cqOther, Limit: 1}); err == nil {
		t.Fatal("missing list parent allowed")
	}
}
func TestCharacterProductQueriesHistory(t *testing.T) {
	s, _, _, a := cqService(t)
	ctx := context.Background()
	if _, err := s.CharacterVerificationHistory(ctx, a, CharacterVerificationHistorySpec{CharacterId: cqOther, Limit: 1}); err == nil {
		t.Fatal("other history allowed")
	}

}
func TestCharacterProductQueryConstructor(t *testing.T) {
	if _, err := NewProductQueries(ProductReadRepos{}, &auth.Policy{}, func() time.Time { return time.Now() }, &cqObserver{}); err == nil {
		t.Fatal("missing dependencies accepted")
	}
	s, r, o, _ := cqService(t)
	var nilRepo *cqRepo
	if _, err := NewProductQueries(ProductReadRepos{Character: nilRepo, Reference: r, DocumentAudience: r}, s.Policy, s.Clock, o); err == nil {
		t.Fatal("typed nil accepted")
	}
	if characterQueryID(cqSelf) != nil {
		t.Fatal("canonical id rejected")
	}
}

func TestCharacterProductQueriesDispatch(t *testing.T) {
	t.Run("AdminCharacterDirectory", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.AdminCharacterDirectory(context.Background(), a, AdminCharacterDirectorySpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("Backstories", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.Backstories(context.Background(), a, BackstoriesSpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("Character", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.Character(context.Background(), a, CharacterSpec{Id: &[]string{cqOther}[0]}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CharacterLogs", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CharacterLogs(context.Background(), a, CharacterLogsSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CharacterProgression", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CharacterProgression(context.Background(), a, CharacterProgressionSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CharacterSummaries", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CharacterSummaries(context.Background(), a, CharacterSummariesSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CharacterVerificationHistory", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CharacterVerificationHistory(context.Background(), a, CharacterVerificationHistorySpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("Characters", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.Characters(context.Background(), a, CharactersSpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CoPlayers", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CoPlayers(context.Background(), a, CoPlayersSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("CreationCatalog", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.CreationCatalog(context.Background(), a, CreationCatalogSpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("DowntimeProjects", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.DowntimeProjects(context.Background(), a, DowntimeProjectsSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("MyCharacters", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.MyCharacters(context.Background(), a, MyCharactersSpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("ParticipationsByCharacter", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.ParticipationsByCharacter(context.Background(), a, ParticipationsByCharacterSpec{Limit: 1, CharacterId: cqOther}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
	t.Run("PendingCharacterVerifications", func(t *testing.T) {
		s, r, _, _ := cqService(t)
		r.value.OwnerId = cqSelf
		a, err := auth.NewAuthority(cqSelf, []auth.Role{auth.Player, auth.Admin, auth.Verifier}, "active", "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.PendingCharacterVerifications(context.Background(), a, PendingCharacterVerificationsSpec{Limit: 1}); err != nil {
			t.Fatal(err)
		}
		if r.calls == 0 {
			t.Fatal("repository not called")
		}
	})
}

func TestCharacterProductQueriesObserveOnlySuccessfulOverride(t *testing.T) {
	s, r, o, _ := cqService(t)
	ctx := context.Background()
	owner, err := auth.NewAuthorityWithOwner(cqSelf, []auth.Role{auth.Player}, "active", "", "owner", cqSelf)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.AdminCharacterDirectory(ctx, owner, AdminCharacterDirectorySpec{Limit: 1}); err != nil {
		t.Fatal(err)
	}
	if len(o.facts) != 1 || o.facts[0].RuleCode != "ROLE" || o.facts[0].ActorID != cqSelf || o.facts[0].Operation != "Query.adminCharacterDirectory" {
		t.Fatal(o.facts)
	}
	r.err = errors.New("db failed")
	if _, err = s.AdminCharacterDirectory(ctx, owner, AdminCharacterDirectorySpec{Limit: 1}); err == nil {
		t.Fatal("database error lost")
	}
	if len(o.facts) != 1 {
		t.Fatal("failed read observed")
	}
	r.err = nil
	if _, err = s.AdminCharacterDirectory(ctx, owner, AdminCharacterDirectorySpec{Limit: -1}); err == nil {
		t.Fatal("invalid read admitted")
	}
	if len(o.facts) != 1 {
		t.Fatal("invalid read observed")
	}
}

func TestCharacterProductQueriesUTCDateAndStatus(t *testing.T) {
	s, r, _, a := cqService(t)
	s.Clock = func() time.Time { return time.Date(2026, 10, 18, 0, 0, 1, 0, time.UTC) }
	r.value.CreatedAt = time.Date(2026, 10, 17, 23, 59, 59, 0, time.UTC)
	v, err := s.Character(context.Background(), a, CharacterSpec{Id: &[]string{cqOther}[0]})
	if err != nil || v.DaysActive != 1 {
		t.Fatal(v, err)
	}
	r.value.CreatedAt = time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	v, err = s.Character(context.Background(), a, CharacterSpec{Id: &[]string{cqOther}[0]})
	if err != nil || v.DaysActive != 0 {
		t.Fatal(v, err)
	}
	for _, status := range []string{"active", "retired", "dead", "pending_approval"} {
		if _, err := s.Characters(context.Background(), a, CharactersSpec{Limit: 1, Filters: &CharacterFiltersFields{Status: &status}}); err != nil {
			t.Fatal(status, err)
		}
	}
}
