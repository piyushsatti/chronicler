package auth

import "testing"

func TestQuestPointcrawlAdmissionOverrideUsesExistingPolicyPrecedence(t *testing.T) {
	p, assignments, _ := policyTestProvider(t)
	admin := policyAuthority(t, policyActor, []Role{Admin}, false, false)
	owner := policyAuthority(t, policyActor, []Role{Player}, false, true)
	revoked := policyAuthority(t, policyActor, []Role{DM}, true, false)
	for _, tc := range []struct {
		name      string
		actor     Authority
		dm        string
		role      string
		activated bool
		assigned  bool
		want      Decision
	}{
		{"ordinary own expected", admin, policyActor, "expected", false, false, Decision{Allowed: true}},
		{"own expected audience override", admin, policyActor, "expected", true, false, Decision{true, true, "AUDIENCE"}},
		{"configured owner audience override", owner, policyActor, "expected", true, false, Decision{true, true, "AUDIENCE"}},
		{"ownership before audience", admin, policyOther, "expected", true, false, Decision{true, true, "OWNERSHIP"}},
		{"assignment before audience", admin, policyActor, "visited", true, false, Decision{true, true, "ASSIGNMENT"}},
		{"role before ownership assignment audience", owner, policyOther, "visited", true, false, Decision{true, true, "ROLE"}},
		{"ordinary visited assignment", admin, policyActor, "visited", false, true, Decision{Allowed: true}},
		{"revoked admin cannot use audience fact", revoked, policyActor, "expected", true, false, Decision{RuleCode: "AUDIENCE"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assignments.archon = tc.assigned
			req, err := ForQuest("Mutation.setQuestPointcrawlLinks", QuestFacts{ID: policySubject, DMID: tc.dm, Hexes: []QuestHexFacts{{ID: policyOther, Role: tc.role, RegionID: policyPointer(policyRegion), AdminOverride: tc.activated}}})
			req = policyMustRequest(t, req, err)
			policyExpect(t, p, tc.actor, req, tc.want)
		})
	}
}
