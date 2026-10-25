package quest

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	arcGuardOwnDM   = "10000000-0000-4000-8000-000000000001"
	arcGuardOtherDM = "10000000-0000-4000-8000-000000000002"
	arcGuardAdmin   = "10000000-0000-4000-8000-000000000003"
	arcGuardOwnArc  = "20000000-0000-4000-8000-000000000001"
	arcGuardOther   = "20000000-0000-4000-8000-000000000002"
	arcGuardMissing = "20000000-0000-4000-8000-000000000009"
	arcGuardQuest   = "30000000-0000-4000-8000-000000000001"
)

// errArcGuardPassed marks that a command got past the series check to the quest store.
var errArcGuardPassed = errors.New("series check passed; quest store reached")

type arcGuardPolicyFacts struct{}

func (arcGuardPolicyFacts) HasArchon(context.Context, string, string) (bool, error) {
	return false, nil
}
func (arcGuardPolicyFacts) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}
func (arcGuardPolicyFacts) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	return auth.AudienceAssessment{}, nil
}
func (arcGuardPolicyFacts) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}
func (arcGuardPolicyFacts) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}

// arcGuardArcs holds series by id with their creator.
type arcGuardArcs struct{ creators map[string]string }

func (a arcGuardArcs) LockUpsertQuestArc(_ context.Context, spec UpsertQuestArcSpec) (UpsertQuestArcState, error) {
	creator, ok := a.creators[*spec.Id]
	if !ok {
		return UpsertQuestArcState{}, nil
	}
	return UpsertQuestArcState{Exists: true, SubjectID: *spec.Id, Before: &QuestArcView{Id: *spec.Id, CreatedBy: creator}}, nil
}
func (arcGuardArcs) StoreUpsertQuestArc(context.Context, UpsertQuestArcWrite) (QuestArcView, error) {
	return QuestArcView{}, errors.New("series store must not be called")
}

// arcGuardQuests stops a command at the quest store once every check has passed.
type arcGuardQuests struct {
	QuestWriteRepository
	dm string
}

func (arcGuardQuests) LockCreateQuest(context.Context, CreateQuestSpec) (CreateQuestState, error) {
	return CreateQuestState{}, errArcGuardPassed
}
func (q arcGuardQuests) LockUpdateQuest(context.Context, UpdateQuestSpec) (UpdateQuestState, error) {
	return UpdateQuestState{Exists: true, SubjectID: arcGuardQuest, OwnerID: q.dm}, nil
}
func (arcGuardQuests) StoreUpdateQuest(context.Context, UpdateQuestWrite) (QuestView, error) {
	return QuestView{}, errArcGuardPassed
}

type arcGuardBrief struct{ document.BriefWriter }

func arcGuardAuthority(t *testing.T, id string, roles ...auth.Role) auth.Authority {
	t.Helper()
	actor, err := auth.NewAuthorityWithHandle(id, roles, "active", "approved", "dm-"+id[len(id)-1:])
	if err != nil {
		t.Fatal(err)
	}
	return actor
}

func arcGuardRepos(t *testing.T, actors map[string]auth.Authority, dm string) ProductCommandRepos {
	t.Helper()
	facts := arcGuardPolicyFacts{}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	return ProductCommandRepos{
		Arc:    arcGuardArcs{creators: map[string]string{arcGuardOwnArc: arcGuardOwnDM, arcGuardOther: arcGuardOtherDM}},
		Quest:  arcGuardQuests{dm: dm},
		Policy: policy,
		Brief:  arcGuardBrief{},
		Authority: func(_ context.Context, id string) (auth.Authority, error) {
			actor, ok := actors[id]
			if !ok {
				return auth.Authority{}, apierr.New(apierr.NotFound, "member not found")
			}
			return actor, nil
		},
	}
}

func requireAPICode(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	apiErr, ok := errors.AsType[*apierr.Error](err)
	if !ok || apiErr.Code != code {
		t.Fatalf("error = %v, want apierr %s", err, code)
	}
}

func arcGuardCases() []struct {
	name  string
	actor string
	arc   string
	want  func(*testing.T, error)
} {
	passed := func(t *testing.T, err error) {
		t.Helper()
		if !errors.Is(err, errArcGuardPassed) {
			t.Fatalf("error = %v, want the series check to pass", err)
		}
	}
	return []struct {
		name  string
		actor string
		arc   string
		want  func(*testing.T, error)
	}{
		{"own series", arcGuardOwnDM, arcGuardOwnArc, passed},
		{"another DM's series", arcGuardOwnDM, arcGuardOther, func(t *testing.T, err error) {
			t.Helper()
			requireAPICode(t, err, apierr.Forbidden)
			if apiErr, _ := errors.AsType[*apierr.Error](err); apiErr.Message != questArcForbiddenMessage {
				t.Fatalf("message = %q", apiErr.Message)
			}
		}},
		{"admin on another DM's series", arcGuardAdmin, arcGuardOther, passed},
		{"unknown series", arcGuardOwnDM, arcGuardMissing, func(t *testing.T, err error) {
			t.Helper()
			requireAPICode(t, err, apierr.NotFound)
		}},
		{"no series", arcGuardOwnDM, "", passed},
	}
}

func arcGuardActors(t *testing.T) map[string]auth.Authority {
	return map[string]auth.Authority{
		arcGuardOwnDM:   arcGuardAuthority(t, arcGuardOwnDM, auth.DM),
		arcGuardOtherDM: arcGuardAuthority(t, arcGuardOtherDM, auth.DM),
		arcGuardAdmin:   arcGuardAuthority(t, arcGuardAdmin, auth.DM, auth.Admin),
	}
}

func TestCreateQuestAdmitsOnlySeriesTheActorMayUse(t *testing.T) {
	for _, tc := range arcGuardCases() {
		t.Run(tc.name, func(t *testing.T) {
			actors := arcGuardActors(t)
			repos := arcGuardRepos(t, actors, tc.actor)
			input := validCreateQuestFields([]string{"standard"})
			if tc.arc != "" {
				arc := tc.arc
				input.ArcId = &arc
			}
			commands := ProductCommands{IDs: func() string { return arcGuardQuest }}
			at := time.Date(2031, 1, 1, 0, 0, 0, 0, time.UTC)
			_, err := createQuest(context.Background(), commands, repos, actors[tc.actor], at, CreateQuestSpec{Input: input}, input, input.Title, tc.actor)
			tc.want(t, err)
		})
	}
}

func TestUpdateQuestAdmitsOnlySeriesTheActorMayUse(t *testing.T) {
	for _, tc := range arcGuardCases() {
		t.Run(tc.name, func(t *testing.T) {
			actors := arcGuardActors(t)
			repos := arcGuardRepos(t, actors, tc.actor)
			arc := tc.arc
			spec := UpdateQuestSpec{Id: arcGuardQuest, Input: QuestEditFields{ArcId: product.Optional[string]{Set: true, Value: &arc}}}
			request, err := auth.ForQuest("Mutation.updateQuest", auth.QuestFacts{ID: arcGuardQuest, DMID: tc.actor})
			if err != nil {
				t.Fatal(err)
			}
			at := time.Date(2031, 1, 1, 0, 0, 0, 0, time.UTC)
			_, err = updateQuest(context.Background(), repos, actors[tc.actor], at, spec, arcGuardQuest, request, &QuestView{Id: arcGuardQuest, DmId: tc.actor})
			tc.want(t, err)
		})
	}
}
