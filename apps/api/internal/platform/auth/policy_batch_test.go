package auth

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type batchAssignmentFacts struct {
	AssignmentReader
	facts         map[string]bool
	err           error
	batch, single int
}

func (f *batchAssignmentFacts) HasArchon(_ context.Context, _, regionID string) (bool, error) {
	f.single++
	return f.facts[regionID], f.err
}

func (f *batchAssignmentFacts) ArchonRegions(_ context.Context, _ string, _ []string) (map[string]bool, error) {
	f.batch++
	return f.facts, f.err
}

func TestBatchedCapabilityFactsPreserveDenialsOverridesAndProviderErrors(t *testing.T) {
	ctx := context.Background()
	for _, test := range []struct {
		name     string
		roles    []Role
		owner    bool
		assigned bool
		want     Decision
	}{
		{"unassigned archon", []Role{Archon}, false, false, Decision{RuleCode: "ASSIGNMENT"}},
		{"assigned archon", []Role{Archon}, false, true, Decision{Allowed: true}},
		{"ordinary player", []Role{Player}, false, true, Decision{RuleCode: "ROLE"}},
		{"admin override", []Role{Admin}, false, false, Decision{Allowed: true, UsedOverride: true, RuleCode: "ASSIGNMENT"}},
		{"owner override", []Role{Player}, true, false, Decision{Allowed: true, UsedOverride: true, RuleCode: "ROLE"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			original, assignments, _ := policyTestProvider(t)
			facts := &batchAssignmentFacts{AssignmentReader: assignments, facts: map[string]bool{policyRegion: test.assigned}}
			wrapped, err := NewAssignments(facts, assignments)
			if err != nil {
				t.Fatal(err)
			}
			original.providers.Assignments = wrapped
			actor := policyAuthority(t, policyActor, test.roles, false, test.owner)
			request, err := ForMap("Mutation.createMap", MapFacts{RegionID: policyPointer(policyRegion)})
			request = policyMustRequest(t, request, err)
			policyExpect(t, original, actor, request, test.want)
			facts.single = 0
			batched, err := original.WithArchonAssignments(ctx, actor, []string{policyRegion, policyRegion})
			if err != nil {
				t.Fatal(err)
			}
			policyExpect(t, batched, actor, request, test.want)
			if facts.batch != 1 || facts.single != 0 {
				t.Fatalf("batch=%d single=%d, want one batch and no per-region fetch", facts.batch, facts.single)
			}
			facts.facts[policyRegion] = !test.assigned
			policyExpect(t, batched, actor, request, test.want)
			if assigned, err := batched.providers.Assignments.HasLieutenant(ctx, policyActor, policySubject); err != nil || !assigned || !reflect.DeepEqual(assignments.lieutenantArgs, []string{policyActor, policySubject}) {
				t.Fatalf("lieutenant delegation=%v err=%v args=%v", assigned, err, assignments.lieutenantArgs)
			}
			facts.err = errors.New("assignment provider unavailable")
			if _, err := original.WithArchonAssignments(ctx, actor, []string{policyRegion}); !errors.Is(err, facts.err) {
				t.Fatalf("batch error=%v, want original provider failure", err)
			}
			if _, err := original.Decide(ctx, actor, request); !errors.Is(err, facts.err) {
				t.Fatalf("ordinary error=%v, want same failure even for a player or override", err)
			}
		})
	}
}
