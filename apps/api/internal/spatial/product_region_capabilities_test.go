package spatial

import (
	"context"
	"errors"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

type regionCapabilityFacts struct{ err error }

func (f regionCapabilityFacts) HasArchon(context.Context, string, string) (bool, error) {
	return false, f.err
}
func (f regionCapabilityFacts) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, f.err
}
func (f regionCapabilityFacts) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	return auth.AudienceAssessment{}, f.err
}
func (f regionCapabilityFacts) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, f.err
}
func (f regionCapabilityFacts) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, f.err
}

type regionCapabilityReader struct{ RegionReadRepository }

func (regionCapabilityReader) ReadRegions(context.Context, auth.Authority, RegionsSpec) ([]RegionView, error) {
	return []RegionView{{Id: "20000000-0000-4000-8000-000000000001", Name: "Region"}}, nil
}
func TestRegionCapabilityProviderFailurePropagates(t *testing.T) {
	expected := errors.New("assignment provider unavailable")
	facts := regionCapabilityFacts{err: expected}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	actor, err := auth.NewAuthorityWithHandle("10000000-0000-4000-8000-000000000001", []auth.Role{auth.Archon}, "active", "draft", "archon")
	if err != nil {
		t.Fatal(err)
	}
	queries := ProductQueries{Reads: ProductReadRepos{Region: regionCapabilityReader{}}, Policy: policy}
	if _, err := queries.Regions(context.Background(), actor, RegionsSpec{Limit: 50}); !errors.Is(err, expected) {
		t.Fatalf("regions error=%v, want provider failure", err)
	}
	view := RegionView{Id: "20000000-0000-4000-8000-000000000001"}
	if err := projectSpatialCommandResult(context.Background(), ProductCommandRepos{Policy: policy}, actor, &view); !errors.Is(err, expected) {
		t.Fatalf("command projection error=%v, want provider failure", err)
	}
	if view.CanCreateMap {
		t.Fatal("failed projection granted creation")
	}
}
