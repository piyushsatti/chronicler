package character

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	profileOwnerID = "10000000-0000-4000-8000-000000000001"
	profileOtherID = "10000000-0000-4000-8000-000000000002"
	profileCharID  = "10000000-0000-4000-8000-000000000010"
)

type profileAssignments struct{}

func (profileAssignments) HasArchon(context.Context, string, string) (bool, error) { return false, nil }
func (profileAssignments) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}

type profileAudience struct{}

func (profileAudience) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	return auth.AudienceAssessment{}, nil
}

type profileIdentity struct{}

func (profileIdentity) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}

type profileSummary struct{}

func (profileSummary) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}

type profileReplay struct{}

func (profileReplay) Claim(context.Context, string, string, string, string) (idempotency.Claim, error) {
	return idempotency.Claim{}, nil
}
func (profileReplay) RecordOverride(context.Context, idempotency.Claim, idempotency.CommandOverrideFact) error {
	return nil
}
func (profileReplay) Complete(context.Context, idempotency.Claim, json.RawMessage) error {
	return nil
}

type profileOwners struct{}

func (profileOwners) ReadImmutableOwner(context.Context, string) (string, error) {
	return profileOwnerID, nil
}
func (profileOwners) LockAdmissions(context.Context, []string) ([]Admission, error) {
	return nil, nil
}
func (profileOwners) LockAdmission(context.Context, string) (Admission, error) {
	return Admission{}, nil
}

func profileActor(t *testing.T, id string, roles []auth.Role, platformOwner bool) auth.Authority {
	t.Helper()
	configured := ""
	if platformOwner {
		configured = id
	}
	actor, err := auth.NewAuthorityWithOwner(id, roles, "active", "", "handle", configured)
	if err != nil {
		t.Fatal(err)
	}
	return actor
}

func TestUpdateCharacterProfileAdmitsAdminAndPlatformOwner(t *testing.T) {
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments: profileAssignments{}, Audience: profileAudience{}, Identities: profileIdentity{}, SummaryRelationships: profileSummary{},
	})
	if err != nil {
		t.Fatal(err)
	}
	repos := ProductCommandRepos{Policy: policy, Replay: profileReplay{}, Admissions: profileOwners{}}
	admit := func(actor auth.Authority, op string) error {
		repos.Authority = func(context.Context, string) (auth.Authority, error) { return actor, nil }
		_, err := admitOwnedCharacterCommand(t.Context(), repos, actor, op, profileCharID, product.CommandMeta{IdempotencyKey: "profile-key"}, "fingerprint")
		return err
	}
	forbidden := func(actor auth.Authority, op string) {
		t.Helper()
		err := admit(actor, op)
		var got *apierr.Error
		if !errors.As(err, &got) || got.Code != apierr.Forbidden {
			t.Fatalf("%s %v: got %v", op, actor.Claims().Roles, err)
		}
	}
	if err := admit(profileActor(t, profileOwnerID, []auth.Role{auth.Player}, false), "updateCharacterProfile"); err != nil {
		t.Fatal(err)
	}
	if err := admit(profileActor(t, profileOtherID, []auth.Role{auth.Admin}, false), "updateCharacterProfile"); err != nil {
		t.Fatal(err)
	}
	if err := admit(profileActor(t, profileOtherID, []auth.Role{auth.Player}, true), "updateCharacterProfile"); err != nil {
		t.Fatal(err)
	}
	if err := admit(profileActor(t, profileOtherID, []auth.Role{auth.DM, auth.Admin}, false), "updateCharacterProfile"); err != nil {
		t.Fatal(err)
	}
	forbidden(profileActor(t, profileOtherID, []auth.Role{auth.Verifier}, false), "updateCharacterProfile")
	forbidden(profileActor(t, profileOtherID, []auth.Role{auth.DM}, false), "updateCharacterProfile")
	forbidden(profileActor(t, profileOtherID, []auth.Role{auth.Player}, false), "updateCharacterProfile")
	forbidden(profileActor(t, profileOtherID, []auth.Role{auth.Admin}, false), "syncCharacterDdb")
	forbidden(profileActor(t, profileOtherID, []auth.Role{auth.Admin}, false), "retireCharacter")
	if err := admitCharacterWrite(t.Context(), repos, profileActor(t, profileOtherID, []auth.Role{auth.Admin}, false), "Mutation.updateCharacterProfile", profileCharID, profileOwnerID); err != nil {
		t.Fatal(err)
	}
}
