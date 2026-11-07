package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
)

type phase3AssignmentLookup struct {
	archon, lieutenant         bool
	err                        error
	archonArgs, lieutenantArgs []string
}

func TestGuestHasPlayerPermissionsExceptSignup(t *testing.T) {
	p, _, facts := policyTestProvider(t)
	guest := policyAuthority(t, policyActor, []Role{Role("guest")}, false, false)
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	if guest.Claims().Has(Player) {
		t.Fatal("guest acquired the literal player audience role")
	}
	availability, err := ForOperation("Mutation.setMyAvailability")
	policyExpect(t, p, guest, policyMustRequest(t, availability, err), Decision{Allowed: true})
	summary, err := ForSummary(SummaryFacts{CharacterID: policyPointer(policySubject), QuestIDs: []string{policyRegion}})
	facts.summary = SummaryEvidence{Relations: []SummaryRelation{{policyRegion, policyOther, policyPointer(policyActor), policyPointer("played")}}, Character: &CharacterFacts{policySubject, policyActor}}
	policyExpect(t, p, guest, policyMustRequest(t, summary, err), Decision{Allowed: true})
	for _, operation := range []Operation{"Mutation.signupForQuest", "Mutation.withdrawFromQuest"} {
		request, err := ForCharacter(operation, CharacterFacts{policySubject, policyActor})
		request = policyMustRequest(t, request, err)
		want := Decision{Allowed: true}
		if operation == "Mutation.signupForQuest" {
			want = Decision{RuleCode: "ROLE"}
		}
		policyExpect(t, p, guest, request, want)
		policyExpect(t, p, player, request, Decision{Allowed: true})
		// A guest who also holds player (set by an admin) is a player.
		guestPlayer := policyAuthority(t, policyActor, []Role{Role("guest"), Player}, false, false)
		policyExpect(t, p, guestPlayer, request, Decision{Allowed: true})
		foreign, err := ForCharacter(operation, CharacterFacts{policySubject, policyOther})
		want = Decision{RuleCode: "OWNERSHIP"}
		if operation == "Mutation.signupForQuest" {
			want = Decision{RuleCode: "ROLE"}
		}
		policyExpect(t, p, guest, policyMustRequest(t, foreign, err), want)
	}
}

func TestLocationsCategoryMovesUseArchonGate(t *testing.T) {
	p, assignments, _ := policyTestProvider(t)
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	archon := policyAuthority(t, policyOther, []Role{Archon}, false, false)
	admin := policyAuthority(t, policyOther, []Role{Admin}, false, false)
	owner := policyAuthority(t, policyOther, []Role{Player}, false, true)
	for _, operation := range []Operation{"Mutation.updateDocument", "Mutation.editPublishedDocument"} {
		for _, test := range []struct {
			name           string
			category, next *string
		}{
			{"NPC into Locations", policyPointer("NPC"), policyPointer("Locations")},
			{"uncategorized into Locations", nil, policyPointer("Locations")},
			{"existing Locations", policyPointer("Locations"), nil},
			{"Locations into NPC", policyPointer("Locations"), policyPointer("NPC")},
		} {
			t.Run(string(operation)+"/"+test.name, func(t *testing.T) {
				request, err := ForDocumentWrite(operation, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "codex_entry", Category: test.category, NewCategory: test.next, LinkedRegionIDs: []string{policyRegion}})
				request = policyMustRequest(t, request, err)
				policyExpect(t, p, player, request, Decision{RuleCode: "ROLE"})
				policyExpect(t, p, archon, request, Decision{Allowed: true})
				policyExpect(t, p, owner, request, Decision{true, true, "ROLE"})
				assignments.archon = false
				policyExpect(t, p, archon, request, Decision{RuleCode: "ASSIGNMENT"})
				policyExpect(t, p, admin, request, Decision{true, true, "ASSIGNMENT"})
				assignments.err = errors.New("assignment unavailable")
				decision, err := p.Decide(t.Context(), admin, request)
				if !errors.Is(err, assignments.err) || decision.Allowed {
					t.Fatalf("assignment failure: %+v %v", decision, err)
				}
				assignments.err = nil
				assignments.archon = true
			})
		}
	}
}

func TestFormerDMRetainsOwnedQuestManagement(t *testing.T) {
	p, _, _ := policyTestProvider(t)
	for _, actor := range []Authority{
		policyAuthority(t, policyActor, []Role{Player}, true, false),
		policyAuthority(t, policyActor, []Role{DM}, false, false),
	} {
		if actor.LiveDM() {
			t.Fatal("fixture retained current DM authority")
		}
		for _, operation := range []Operation{"Mutation.updateQuest", "Mutation.transitionQuestStatus", "Mutation.closeQuest", "Mutation.selectQuestParticipants", "Mutation.addQuestParticipant", "Mutation.removeQuestParticipant", "Mutation.deleteQuest", "Mutation.syncQuestDiscord"} {
			request, err := ForQuest(operation, QuestFacts{ID: policySubject, DMID: policyActor})
			policyExpect(t, p, actor, policyMustRequest(t, request, err), Decision{Allowed: true})
			foreign, err := ForQuest(operation, QuestFacts{ID: policySubject, DMID: policyOther})
			policyExpect(t, p, actor, policyMustRequest(t, foreign, err), Decision{RuleCode: "OWNERSHIP"})
		}
		create, err := ForQuestCreate(QuestCreateFacts{policyActor})
		policyExpect(t, p, actor, policyMustRequest(t, create, err), Decision{RuleCode: "ROLE"})
	}
}

func (a *phase3AssignmentLookup) HasArchon(_ context.Context, memberID, regionID string) (bool, error) {
	a.archonArgs = []string{memberID, regionID}
	return a.archon, a.err
}
func (a *phase3AssignmentLookup) HasLieutenant(_ context.Context, memberID, documentID string) (bool, error) {
	a.lieutenantArgs = []string{memberID, documentID}
	return a.lieutenant, a.err
}

type phase3OverrideRepository struct {
	idempotency.Repository
	claim idempotency.Claim
	fact  idempotency.CommandOverrideFact
	calls int
	err   error
}

func (r *phase3OverrideRepository) RecordOverride(_ context.Context, claim idempotency.Claim, fact idempotency.CommandOverrideFact) error {
	r.claim, r.fact = claim, fact
	r.calls++
	return r.err
}

func TestPhase3TaskP02Acceptance(t *testing.T) {
	t.Run("Character owner or staff verification history", testPolicyCharacterHistory)
	t.Run("same-task empty page activation", testPolicyScopeActivation)
	t.Run("PolicyRequestBoundary", testPolicyRequestBoundary)
	t.Run("PolicyAuthorizationContrasts", testPolicyAuthorizationContrasts)
	t.Run("PolicyOwningProviderContrasts", testPolicyOwningProviderContrasts)
	t.Run("PolicyExactSDLInventory", testPolicyExactSDLInventory)

	t.Run("constructors reject absent providers", func(t *testing.T) {
		var missing *phase3AssignmentLookup
		real := &phase3AssignmentLookup{}
		for _, pair := range [][2]AssignmentReader{{nil, real}, {real, nil}, {missing, real}, {real, missing}} {
			if _, err := NewAssignments(pair[0], pair[1]); err == nil {
				t.Fatal("missing assignment provider admitted")
			}
		}
		for _, lookup := range []AssignmentReader{nil, missing} {
			if _, err := NewPolicy(PolicyProviders{Assignments: lookup, Audience: &policyFactsProvider{}, Identities: &policyFactsProvider{}, SummaryRelationships: &policyFactsProvider{}}); err == nil {
				t.Fatal("missing lookup admitted")
			}
		}
		if _, err := NewSafeOverrideObserver(nil); err == nil {
			t.Fatal("nil logger admitted")
		}
		if _, err := NewOverrideRecorder(nil); err == nil {
			t.Fatal("nil executor admitted")
		}
		var missingDB *phase3OverrideRepository
		if _, err := NewOverrideRecorder(missingDB); err == nil {
			t.Fatal("typed nil executor admitted")
		}
	})
	t.Run("real assignment providers retain identifiers and failures", func(t *testing.T) {
		archons := &phase3AssignmentLookup{archon: true}
		lieutenants := &phase3AssignmentLookup{lieutenant: true}
		assignments, err := NewAssignments(archons, lieutenants)
		if err != nil {
			t.Fatal(err)
		}
		if ok, err := assignments.HasArchon(t.Context(), "member", "region"); !ok || err != nil {
			t.Fatalf("archon %v %v", ok, err)
		}
		if ok, err := assignments.HasLieutenant(t.Context(), "member", "document"); !ok || err != nil {
			t.Fatalf("lieutenant %v %v", ok, err)
		}
		if !reflect.DeepEqual(archons.archonArgs, []string{"member", "region"}) || !reflect.DeepEqual(lieutenants.lieutenantArgs, []string{"member", "document"}) {
			t.Fatal("assignment identity changed")
		}
		outage := errors.New("assignment unavailable")
		archons.archon = false
		archons.err = outage
		if ok, err := assignments.HasArchon(t.Context(), "member", "region"); ok || !errors.Is(err, outage) {
			t.Fatalf("lookup failure changed %v %v", ok, err)
		}
		lieutenants.lieutenant = false
		lieutenants.err = outage
		if ok, err := assignments.HasLieutenant(t.Context(), "member", "document"); ok || !errors.Is(err, outage) {
			t.Fatalf("lookup failure changed %v %v", ok, err)
		}
	})
	t.Run("safe structured read observation", func(t *testing.T) {
		var log bytes.Buffer
		observer, err := NewSafeOverrideObserver(slog.New(slog.NewJSONHandler(&log, nil)))
		if err != nil {
			t.Fatal(err)
		}
		fact := phase3OverrideFact("Query.document", "AUDIENCE")
		observer.Observe(t.Context(), fact)
		var got map[string]any
		if err := json.Unmarshal(log.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		for key, want := range map[string]string{"actorId": fact.ActorID, "operation": string(fact.Operation), "subjectType": fact.SubjectType, "subjectId": fact.SubjectID, "ruleCode": "AUDIENCE", "at": fact.At.Format(time.RFC3339)} {
			if got[key] != want {
				t.Fatalf("%s=%v want %s", key, got[key], want)
			}
		}
		if len(got) != 9 {
			t.Fatalf("unexpected metadata %v", got)
		}
		log.Reset()
		fact.RuleCode = "HIDDEN_BODY_SENTINEL"
		observer.Observe(t.Context(), fact)
		if log.Len() != 0 {
			t.Fatal("unrecognized rule leaked into log")
		}
	})
	t.Run("actual claim bound safe audit fact and failure", func(t *testing.T) {
		repository := &phase3OverrideRepository{}
		recorder, err := NewOverrideRecorder(repository)
		if err != nil {
			t.Fatal(err)
		}
		fact := phase3OverrideFact("Mutation.editPublishedDocument", "OWNERSHIP")
		claim := idempotency.Claim{ActorID: fact.ActorID, Operation: "editPublishedDocument", Key: "exact-key", Fingerprint: strings.Repeat("a", 64)}
		if err := recorder.Record(t.Context(), claim, fact); err != nil {
			t.Fatal(err)
		}
		want := idempotency.CommandOverrideFact{ActorID: fact.ActorID, Operation: string(fact.Operation), SubjectType: fact.SubjectType, SubjectID: fact.SubjectID, RuleCode: fact.RuleCode, At: fact.At}
		if !reflect.DeepEqual(repository.claim, claim) || !reflect.DeepEqual(repository.fact, want) || recorder.Replay != repository {
			t.Fatalf("claim/fact binding changed: %+v %+v", repository.claim, repository.fact)
		}
		failure := errors.New("receipt staging unavailable")
		repository.err = failure
		if err := recorder.Record(t.Context(), claim, fact); !errors.Is(err, failure) {
			t.Fatalf("staging failure changed: %v", err)
		}
		fact.RuleCode = "HIDDEN_BODY_SENTINEL"
		before := repository.calls
		err = recorder.Record(t.Context(), claim, fact)
		var expected *apierr.Error
		if !errors.As(err, &expected) || expected.Code != apierr.Invalid || repository.calls != before {
			t.Fatalf("invalid rule reached receipt: %v", err)
		}
	})
}

func phase3OverrideFact(operation Operation, rule string) OverrideFact {
	return OverrideFact{ActorID: "10000000-0000-4000-8000-000000000004", Operation: operation, SubjectType: "document", SubjectID: "10000000-0000-4000-8000-000000000011", RuleCode: rule, At: time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)}
}

const (
	policyActor        = "10000000-0000-4000-8000-000000000001"
	policyOther        = "10000000-0000-4000-8000-000000000002"
	policySubject      = "10000000-0000-4000-8000-000000000010"
	policyRegion       = "10000000-0000-4000-8000-000000000020"
	policySecondRegion = "10000000-0000-4000-8000-000000000021"
)

type policyFactsProvider struct {
	scopeOverride *string
	err           error
	identity      DiscordIdentity
	audience      []AudienceResult
	summary       SummaryEvidence
	viewer        AudienceContext
	refs          []DocumentRef
}

func (p *policyFactsProvider) Assess(_ context.Context, viewer AudienceContext, refs []DocumentRef) (AudienceAssessment, error) {
	p.viewer = viewer
	p.refs = refs
	return AudienceAssessment{Results: p.audience, ScopeOverrideSubjectID: p.scopeOverride}, p.err
}
func (p *policyFactsProvider) DiscordIdentity(context.Context, string) (DiscordIdentity, error) {
	return p.identity, p.err
}
func (p *policyFactsProvider) SummaryRelations(context.Context, []string, *string) (SummaryEvidence, error) {
	return p.summary, p.err
}
func policyPointer(s string) *string { return &s }
func policyAuthority(t *testing.T, id string, roles []Role, approved, owner bool) Authority {
	t.Helper()
	status := "draft"
	if approved {
		status = "approved"
	}
	ownerID := ""
	if owner {
		ownerID = id
	}
	actor, err := NewAuthorityWithOwner(id, roles, "active", status, "actual-handle", ownerID)
	if err != nil {
		t.Fatal(err)
	}
	return actor
}
func policyTestProvider(t *testing.T) (*Policy, *phase3AssignmentLookup, *policyFactsProvider) {
	t.Helper()
	assignments := &phase3AssignmentLookup{archon: true, lieutenant: true}
	facts := &policyFactsProvider{identity: DiscordIdentity{policyActor, "111111111111111111"}}
	p, err := NewPolicy(PolicyProviders{assignments, facts, facts, facts})
	if err != nil {
		t.Fatal(err)
	}
	return p, assignments, facts
}
func policyMustRequest(t *testing.T, req Request, err error) Request {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	return req
}
func policyExpect(t *testing.T, p *Policy, actor Authority, req Request, want Decision) {
	t.Helper()
	got, err := p.Decide(t.Context(), actor, req)
	if err != nil || got != want {
		t.Fatalf("%s actor=%v got=%+v err=%v want=%+v", req.Operation(), actor.Claims(), got, err, want)
	}
}
func policyCheckError(t *testing.T, err error, code apierr.Code) {
	t.Helper()
	var e *apierr.Error
	if !errors.As(err, &e) || e.Code != code {
		t.Fatalf("got %v want %s", err, code)
	}
}
func testPolicyRequestBoundary(t *testing.T) {
	p, _, _ := policyTestProvider(t)
	actor := policyAuthority(t, policyActor, []Role{Admin}, false, false)
	policyExpect(t, p, actor, Request{operation: "Mutation.ADJUSTPCXP"}, Decision{})
	policyExpect(t, p, actor, Request{operation: "Query.unknown"}, Decision{})
	safeReq, e := ForOperation("Query.member")
	safeReq = policyMustRequest(t, safeReq, e)
	for _, unbuilt := range []*Policy{nil, {}} {
		_, e = unbuilt.Decide(t.Context(), actor, safeReq)
		policyCheckError(t, e, apierr.Internal)
	}
	for _, op := range []Operation{"Query.member", "Mutation.adjustPcxp", "Mutation.upsertQuestArc", "Query.document"} {
		_, err := p.Decide(t.Context(), actor, Request{operation: op})
		policyCheckError(t, err, apierr.Internal)
	}
	for _, f := range []func() error{
		func() error { _, e := ForOperation("Mutation.adjustPcxp"); return e },
		func() error {
			_, e := ForCharacter("Mutation.setMemberRoles", CharacterFacts{policySubject, policyActor})
			return e
		},
		func() error {
			_, e := ForCharacter("Mutation.adjustPcxp", CharacterFacts{"bogus", policyActor})
			return e
		},
		func() error { _, e := ForCharacter("Mutation.adjustPcxp", CharacterFacts{policySubject, ""}); return e },
		func() error { _, e := ForPreview(PreviewFacts{Audience: "admin"}); return e },
		func() error { _, e := ForArc(ArcFacts{ID: policyPointer(policySubject)}); return e },
		func() error {
			_, e := ForSummary(SummaryFacts{QuestIDs: []string{policySubject, policySubject}})
			return e
		},
		func() error { _, e := ForDocumentRead("Query.document", nil); return e },
		func() error {
			_, e := ForDocumentWrite("Mutation.updateDocument", DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "made_up"})
			return e
		},
		func() error { _, e := ForMap("Mutation.updateHex", MapFacts{}); return e },
	} {
		policyCheckError(t, f(), apierr.Internal)
	}
	var absent *policyFactsProvider
	for _, providers := range []PolicyProviders{
		{Assignments: &phase3AssignmentLookup{}, Audience: absent, Identities: &policyFactsProvider{}, SummaryRelationships: &policyFactsProvider{}},
		{Assignments: &phase3AssignmentLookup{}, Audience: &policyFactsProvider{}, Identities: absent, SummaryRelationships: &policyFactsProvider{}},
		{Assignments: &phase3AssignmentLookup{}, Audience: &policyFactsProvider{}, Identities: &policyFactsProvider{}, SummaryRelationships: absent},
	} {
		_, err := NewPolicy(providers)
		policyCheckError(t, err, apierr.Internal)
	}
	t.Run("constructors retain immutable factual snapshots", func(t *testing.T) {
		owner := policyActor
		category := "Locations"
		regions := []string{policyRegion}
		req, err := ForDocumentWrite("Mutation.updateDocument", DocumentWriteFacts{policySubject, owner, "codex_entry", &category, regions, nil})
		if err != nil {
			t.Fatal(err)
		}
		category = "Lore"
		regions[0] = policySecondRegion
		actor := policyAuthority(t, policyActor, []Role{Role("archon")}, false, false)
		policyExpect(t, p, actor, req, Decision{Allowed: true})
	})
}
func testPolicyAuthorizationContrasts(t *testing.T) {
	p, assignments, facts := policyTestProvider(t)
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	admin := policyAuthority(t, policyOther, []Role{Admin}, false, false)
	owner := policyAuthority(t, policyOther, []Role{Player}, false, true)
	dm := policyAuthority(t, policyActor, []Role{DM}, true, false)
	heldDM := policyAuthority(t, policyActor, []Role{DM}, false, false)
	verifier := policyAuthority(t, policyActor, []Role{Role("verifier")}, false, false)
	t.Run("flat capabilities and live demotion", func(t *testing.T) {
		req, err := ForOperation("Mutation.decideDmProfileVerification")
		req = policyMustRequest(t, req, err)
		policyExpect(t, p, verifier, req, Decision{Allowed: true})
		policyExpect(t, p, dm, req, Decision{RuleCode: "ROLE"})
		policyExpect(t, p, admin, req, Decision{Allowed: true})
		policyExpect(t, p, owner, req, Decision{true, true, "ROLE"})
		ctx := WithClaims(t.Context(), Claims{policyActor, []Role{Admin, Role("verifier")}})
		got, e := p.Decide(ctx, player, req)
		if e != nil || got.Allowed {
			t.Fatalf("token roles admitted %+v %v", got, e)
		}
		req, e = ForOperation("Mutation.updateMyDmProfile")
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, heldDM, req, Decision{Allowed: true})
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
		policyExpect(t, p, verifier, req, Decision{RuleCode: "ROLE"})
		req, e = ForOperation("Mutation.setMyAvailability")
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, heldDM, req, Decision{RuleCode: "ROLE"})
		policyExpect(t, p, player, req, Decision{Allowed: true})
	})
	t.Run("all literal character operations refuse staff bypass", func(t *testing.T) {
		for _, op := range []Operation{"Mutation.adjustPcxp", "Mutation.deleteCharacter", "Mutation.deleteCharacterLog", "Mutation.logCharacterEvent", "Mutation.restoreCharacter", "Mutation.retireCharacter", "Mutation.setCharacterGuild", "Mutation.submitForVerification", "Mutation.syncCharacterDdb", "Mutation.updateCharacterProfile", "Mutation.upsertDowntimeProject", "Mutation.signupForQuest", "Mutation.withdrawFromQuest"} {
			req, e := ForCharacter(op, CharacterFacts{policySubject, policyActor})
			req = policyMustRequest(t, req, e)
			policyExpect(t, p, player, req, Decision{Allowed: true})
			for _, actor := range []Authority{admin, owner, policyAuthority(t, policyOther, []Role{Role("verifier")}, false, false), policyAuthority(t, policyOther, []Role{DM}, true, false)} {
				policyExpect(t, p, actor, req, Decision{RuleCode: "OWNERSHIP"})
			}
		}
	})
	t.Run("arc creation approved DM and retained authorship", func(t *testing.T) {
		req, e := ForArc(ArcFacts{})
		req = policyMustRequest(t, req, e)
		for _, a := range []Authority{dm, admin} {
			policyExpect(t, p, a, req, Decision{Allowed: true})
		}
		policyExpect(t, p, owner, req, Decision{true, true, "ROLE"})
		for _, a := range []Authority{heldDM, player, policyAuthority(t, policyActor, []Role{Role("archon")}, false, false), policyAuthority(t, policyActor, []Role{Role("lieutenant")}, false, false)} {
			policyExpect(t, p, a, req, Decision{RuleCode: "ROLE"})
		}
		req, e = ForArc(ArcFacts{policyPointer(policySubject), policyPointer(policyActor)})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{Allowed: true})
		policyExpect(t, p, admin, req, Decision{true, true, "OWNERSHIP"})
	})
	t.Run("every rule management verb needs current verifier and author", func(t *testing.T) {
		for _, op := range []Operation{"Mutation.updateDocument", "Mutation.publishDocument", "Mutation.unpublishDocument", "Mutation.editPublishedDocument", "Mutation.setDocumentVisibility", "Mutation.deleteDocument", "Mutation.restoreDocument"} {
			req, e := ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "rule"})
			req = policyMustRequest(t, req, e)
			policyExpect(t, p, verifier, req, Decision{Allowed: true})
			policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
			policyExpect(t, p, admin, req, Decision{true, true, "OWNERSHIP"})
			policyExpect(t, p, owner, req, Decision{true, true, "ROLE"})
			nonauthor := policyAuthority(t, policyOther, []Role{Role("verifier")}, false, false)
			policyExpect(t, p, nonauthor, req, Decision{RuleCode: "OWNERSHIP"})
		}
	})
	t.Run("hall of fame community document is admin only", func(t *testing.T) {
		hall, other := policyPointer("hall_of_fame"), policyPointer("lore")
		for _, op := range []Operation{"Mutation.updateDocument", "Mutation.publishDocument", "Mutation.deleteDocument"} {
			req, e := ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "community", Category: hall})
			req = policyMustRequest(t, req, e)
			policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
			policyExpect(t, p, admin, req, Decision{true, true, "OWNERSHIP"})
			req, e = ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "community", Category: other})
			req = policyMustRequest(t, req, e)
			policyExpect(t, p, player, req, Decision{Allowed: true})
		}
		for _, op := range []Operation{"Mutation.updateDocument", "Mutation.editPublishedDocument"} {
			into, e := ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "community", Category: other, NewCategory: hall})
			into = policyMustRequest(t, into, e)
			policyExpect(t, p, player, into, Decision{RuleCode: "ROLE"})
			policyExpect(t, p, admin, into, Decision{true, true, "OWNERSHIP"})
			out, e := ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "community", Category: hall, NewCategory: other})
			out = policyMustRequest(t, out, e)
			policyExpect(t, p, player, out, Decision{RuleCode: "ROLE"})
		}
		req, e := ForDocumentCreate(DocumentCreateFacts{AuthorID: policyActor, Kind: "community", Category: hall})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
		policyExpect(t, p, admin, req, Decision{true, true, "OWNERSHIP"})
		req, e = ForDocumentCreate(DocumentCreateFacts{AuthorID: policyActor, Kind: "community", Category: other})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{Allowed: true})
	})
	t.Run("quest briefs structurally refuse every generic path", func(t *testing.T) {
		for _, a := range []Authority{player, admin, owner} {
			req, e := ForDocumentCreate(DocumentCreateFacts{AuthorID: policyActor, Kind: "quest_brief"})
			req = policyMustRequest(t, req, e)
			d, e := p.Decide(t.Context(), a, req)
			policyCheckError(t, e, apierr.Invalid)
			if d.Allowed || d.UsedOverride {
				t.Fatal(d)
			}
			for _, op := range []Operation{"Mutation.updateDocument", "Mutation.publishDocument", "Mutation.unpublishDocument", "Mutation.editPublishedDocument", "Mutation.setDocumentVisibility", "Mutation.deleteDocument", "Mutation.restoreDocument"} {
				req, e = ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "quest_brief"})
				req = policyMustRequest(t, req, e)
				d, e = p.Decide(t.Context(), a, req)
				policyCheckError(t, e, apierr.Invalid)
				if d.Allowed || d.UsedOverride {
					t.Fatal(d)
				}
			}
		}
	})
	t.Run("conditional collection flags", func(t *testing.T) {
		for _, build := range []func(bool) Request{ForCreationCatalog, ForBackstories} {
			policyExpect(t, p, Authority{}, build(false), Decision{Allowed: true})
			policyExpect(t, p, player, build(true), Decision{RuleCode: "ROLE"})
			policyExpect(t, p, admin, build(true), Decision{Allowed: true})
			policyExpect(t, p, owner, build(true), Decision{true, true, "ROLE"})
		}
	})
	t.Run("preview requires held DM without approval and self author", func(t *testing.T) {
		req, e := ForPreview(PreviewFacts{Audience: PreviewDM})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, heldDM, req, Decision{Allowed: true})
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
		req, e = ForPreview(PreviewFacts{Audience: PreviewPlayer, AuthorID: policyPointer(policyOther)})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{RuleCode: "OWNERSHIP"})
		ownAdmin := policyAuthority(t, policyActor, []Role{Admin}, false, false)
		policyExpect(t, p, ownAdmin, req, Decision{true, true, "OWNERSHIP"})
	})
	t.Run("current identity provider and failures", func(t *testing.T) {
		req, e := ForDiscordLookup(DiscordLookupFacts{"111111111111111111"})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{Allowed: true})
		facts.identity.DiscordID = "222222222222222222"
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
		facts.identity.MemberID = policyOther
		_, e = p.Decide(t.Context(), player, req)
		policyCheckError(t, e, apierr.Internal)
		facts.err = errors.New("identity outage")
		d, e := p.Decide(t.Context(), admin, req)
		if !errors.Is(e, facts.err) || d.Allowed {
			t.Fatalf("%+v %v", d, e)
		}
		facts.err = nil
		facts.identity = DiscordIdentity{policyActor, "111111111111111111"}
	})
	t.Run("locations use every current assignment and failure", func(t *testing.T) {
		req, e := ForDocumentWrite("Mutation.setDocumentVisibility", DocumentWriteFacts{policySubject, policyOther, "codex_entry", policyPointer("Locations"), []string{policyRegion, policySecondRegion}, nil})
		req = policyMustRequest(t, req, e)
		archon := policyAuthority(t, policyActor, []Role{Role("archon")}, false, false)
		policyExpect(t, p, archon, req, Decision{Allowed: true})
		assignments.archon = false
		policyExpect(t, p, archon, req, Decision{RuleCode: "ASSIGNMENT"})
		policyExpect(t, p, admin, req, Decision{true, true, "ASSIGNMENT"})
		policyExpect(t, p, owner, req, Decision{true, true, "ROLE"})
		assignments.err = errors.New("assignment outage")
		d, e := p.Decide(t.Context(), admin, req)
		if !errors.Is(e, assignments.err) || d.Allowed {
			t.Fatalf("%+v %v", d, e)
		}
		assignments.err = nil
		assignments.archon = true
	})
}

func testPolicyOwningProviderContrasts(t *testing.T) {
	p, assignments, facts := policyTestProvider(t)
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	admin := policyAuthority(t, policyActor, []Role{Admin}, false, false)
	owner := policyAuthority(t, policyOther, []Role{Player}, false, true)
	t.Run("audience normal admin and actual activation", func(t *testing.T) {
		req, e := ForDocumentRead("Query.document", []DocumentRef{{policySubject}})
		req = policyMustRequest(t, req, e)
		facts.audience = []AudienceResult{{policySubject, AudienceOrdinary}}
		policyExpect(t, p, admin, req, Decision{Allowed: true})
		if !facts.viewer.Authority().Claims().Has(Admin) || !facts.viewer.SharedBypassEnabled() {
			t.Fatal("role:admin lost")
		}
		facts.audience[0].Outcome = AudienceOverridden
		policyExpect(t, p, admin, req, Decision{true, true, "AUDIENCE"})
		policyExpect(t, p, owner, req, Decision{true, true, "AUDIENCE"})
		if facts.viewer.Authority().Claims().Has(Admin) {
			t.Fatal("owner became role:admin")
		}
		_, e = p.Decide(t.Context(), player, req)
		policyCheckError(t, e, apierr.Internal)
		facts.audience[0].Outcome = AudienceDenied
		policyExpect(t, p, admin, req, Decision{RuleCode: "AUDIENCE"})
		for _, results := range [][]AudienceResult{nil, {{policyOther, AudienceOrdinary}}, {{policySubject, AudienceOutcome(99)}}} {
			facts.audience = results
			_, e = p.Decide(t.Context(), admin, req)
			policyCheckError(t, e, apierr.Internal)
		}
		facts.err = errors.New("audience outage")
		got, e := p.Decide(t.Context(), owner, req)
		if !errors.Is(e, facts.err) || got.Allowed || got.UsedOverride {
			t.Fatalf("%+v %v", got, e)
		}
		facts.err = nil
		refs := []DocumentRef{{policySubject}, {policySubject}}
		req, e = ForDocumentRead("Query.documents", refs)
		req = policyMustRequest(t, req, e)
		facts.audience = []AudienceResult{{policySubject, AudienceOrdinary}, {policySubject, AudienceOrdinary}}
		policyExpect(t, p, player, req, Decision{Allowed: true})
		if !reflect.DeepEqual(facts.refs, refs) {
			t.Fatal("duplicate correspondence changed")
		}
	})
	t.Run("regionless maps and both submap sides", func(t *testing.T) {
		req, e := ForMap("Mutation.createMap", MapFacts{})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
		policyExpect(t, p, admin, req, Decision{Allowed: true})
		policyExpect(t, p, owner, req, Decision{true, true, "ROLE"})
		req, e = ForMap("Mutation.upsertPointcrawlNode", MapFacts{ID: policyPointer(policySubject), RegionID: policyPointer(policyRegion), Submap: &MapRef{policyOther, policyPointer(policySecondRegion)}})
		req = policyMustRequest(t, req, e)
		archon := policyAuthority(t, policyActor, []Role{Role("archon")}, false, false)
		policyExpect(t, p, archon, req, Decision{Allowed: true})
		if assignments.archonArgs[1] != policySecondRegion {
			t.Fatal("submap stewardship skipped")
		}
		assignments.archon = false
		policyExpect(t, p, archon, req, Decision{RuleCode: "ASSIGNMENT"})
		assignments.archon = true
	})
	t.Run("expected and visited hex role distinction", func(t *testing.T) {
		dm := policyAuthority(t, policyActor, []Role{DM}, true, false)
		req, e := ForQuest("Mutation.setQuestPointcrawlLinks", QuestFacts{policySubject, policyActor, []QuestHexFacts{{ID: policyOther, Role: "expected", RegionID: policyPointer(policyRegion)}}})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, dm, req, Decision{Allowed: true})
		req, e = ForQuest("Mutation.setQuestPointcrawlLinks", QuestFacts{policySubject, policyActor, []QuestHexFacts{{ID: policyOther, Role: "visited", RegionID: policyPointer(policyRegion)}}})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, dm, req, Decision{RuleCode: "ROLE"})
		steward := policyAuthority(t, policyActor, []Role{DM, Role("archon")}, true, false)
		policyExpect(t, p, steward, req, Decision{Allowed: true})
	})
	t.Run("NPC assignments do not grant edit rights", func(t *testing.T) {
		req, e := ForLieutenantAssignments(LieutenantReadFacts{Documents: []DocumentWriteFacts{{policySubject, policyOther, "codex_entry", policyPointer("NPC"), nil, nil}}, MemberFilter: policyPointer(policyActor)})
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{Allowed: true})
		assignments.lieutenant = false
		policyExpect(t, p, player, req, Decision{RuleCode: "ASSIGNMENT"})
		policyExpect(t, p, admin, req, Decision{Allowed: true})
		assignments.err = errors.New("NPC assignment outage")
		_, e = p.Decide(t.Context(), admin, req)
		if !errors.Is(e, assignments.err) {
			t.Fatal(e)
		}
		assignments.err = nil
		assignments.lieutenant = true
		req, e = ForOperation("Mutation.assignLieutenant")
		req = policyMustRequest(t, req, e)
		policyExpect(t, p, player, req, Decision{RuleCode: "ROLE"})
	})
	t.Run("summary checks every actual relationship", func(t *testing.T) {
		req, e := ForSummary(SummaryFacts{CharacterID: policyPointer(policySubject), QuestIDs: []string{policyRegion, policySecondRegion}})
		req = policyMustRequest(t, req, e)
		facts.summary = SummaryEvidence{Relations: []SummaryRelation{{policyRegion, policyOther, policyPointer(policyActor), policyPointer("played")}, {policySecondRegion, policyOther, policyPointer(policyActor), policyPointer("signed_up")}}, Character: &CharacterFacts{policySubject, policyActor}}
		policyExpect(t, p, player, req, Decision{Allowed: true})
		facts.summary.Relations[1].ParticipantStatus = policyPointer("withdrawn")
		policyExpect(t, p, player, req, Decision{RuleCode: "OWNERSHIP"})
		policyExpect(t, p, owner, req, Decision{true, true, "OWNERSHIP"})
		facts.summary.Relations[1].ParticipantStatus = policyPointer("played")
		facts.summary.Character.OwnerID = policyOther
		policyExpect(t, p, player, req, Decision{RuleCode: "OWNERSHIP"})
		facts.summary.Character = nil
		_, e = p.Decide(t.Context(), admin, req)
		policyCheckError(t, e, apierr.Internal)
		facts.err = errors.New("summary outage")
		d, e := p.Decide(t.Context(), owner, req)
		if !errors.Is(e, facts.err) || d.Allowed {
			t.Fatalf("%+v %v", d, e)
		}
		facts.err = nil
	})
}

func testPolicyExactSDLInventory(t *testing.T) {
	// Match gqlgen.yml: packages/contracts/graphql/**/*.graphql
	root := filepath.Join("..", "..", "..", "..", "..", "packages", "contracts", "graphql")
	var files []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || !strings.HasSuffix(path, ".graphql") {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil || len(files) == 0 {
		t.Fatalf("SDL %v %d", err, len(files))
	}
	sources := make([]*ast.Source, 0, len(files))
	for _, file := range files {
		body, e := os.ReadFile(file)
		if e != nil {
			t.Fatal(e)
		}
		sources = append(sources, &ast.Source{Name: file, Input: string(body)})
	}
	schema, err := gqlparser.LoadSchema(sources...)
	if err != nil {
		t.Fatal(err)
	}
	expected := map[Operation]string{
		"Mutation.acknowledgeSuppressedNotifications": "SELF",
		"Mutation.addQuestParticipant":                "QUEST_DM",
		"Mutation.adjustPcxp":                         "CHAR_OWNER",
		"Mutation.assignArchon":                       "ADMIN",
		"Mutation.assignLieutenant":                   "LIEUTENANT_WRITE",
		"Mutation.attestQuestParticipation":           "QUEST_DM",
		"Mutation.closeQuest":                         "QUEST_DM",
		"Mutation.createBackstory":                    "ADMIN",
		"Mutation.createCharacter":                    "CHAR_CREATE",
		"Mutation.createDocument":                     "DOC_CREATE",
		"Mutation.createMap":                          "MAP_STEWARD",
		"Mutation.createQuest":                        "QUEST_CREATE",
		"Mutation.createRegion":                       "ADMIN",
		"Mutation.createTimeAnchor":                   "ADMIN",
		"Mutation.decideDmProfileVerification":        "STAFF",
		"Mutation.decideVerification":                 "STAFF",
		"Mutation.deleteCharacter":                    "CHAR_OWNER",
		"Mutation.deleteCharacterLog":                 "CHAR_OWNER",
		"Mutation.deleteDocument":                     "DOC_WRITE",
		"Mutation.deleteQuest":                        "QUEST_DM",
		"Mutation.deleteRegion":                       "REGION_STEWARD",
		"Mutation.editPublishedDocument":              "DOC_WRITE",
		"Mutation.grantUnlock":                        "ADMIN",
		"Mutation.linkPointcrawlEntry":                "MAP_STEWARD",
		"Mutation.logCharacterEvent":                  "CHAR_OWNER",
		"Mutation.markNotificationsRead":              "SELF",
		"Mutation.publishDocument":                    "DOC_WRITE",
		"Mutation.redriveDiscordDelivery":             "ADMIN",
		"Mutation.removeQuestFromArc":                 "QUEST_DM",
		"Mutation.removeQuestParticipant":             "QUEST_DM",
		"Mutation.restoreCharacter":                   "CHAR_OWNER",
		"Mutation.restoreDocument":                    "DOC_WRITE",
		"Mutation.restoreQuest":                       "QUEST_DM",
		"Mutation.restoreRegion":                      "REGION_STEWARD",
		"Mutation.retireCharacter":                    "CHAR_OWNER",
		"Mutation.revokeArchon":                       "ADMIN",
		"Mutation.revokeLieutenant":                   "LIEUTENANT_WRITE",
		"Mutation.selectQuestParticipants":            "QUEST_DM",
		"Mutation.setCharacterGuild":                  "CHAR_OWNER",
		"Mutation.setDocumentVisibility":              "DOC_WRITE",
		"Mutation.setMemberRoles":                     "ADMIN",
		"Mutation.setMemberRolesBatch":                "ADMIN",
		"Mutation.setMyAvailability":                  "PLAYER_SELF",
		"Mutation.setQuestPointcrawlLinks":            "QUEST_DM",
		"Mutation.setPointcrawlEdge":                  "MAP_STEWARD",
		"Mutation.setPointcrawlNodeState":             "ADMIN",
		"Mutation.setUnlockableActive":                "ADMIN",
		"Mutation.signupForQuest":                     "CHAR_SIGNUP",
		"Mutation.submitDmProfileForVerification":     "DM_SELF",
		"Mutation.submitForVerification":              "CHAR_OWNER",
		"Mutation.syncCharacterDdb":                   "CHAR_OWNER",
		"Mutation.syncQuestDiscord":                   "QUEST_DM",
		"Mutation.transitionQuestStatus":              "QUEST_DM",
		"Mutation.transitionRegion":                   "ADMIN",
		"Mutation.unlinkPointcrawlEntry":              "MAP_STEWARD",
		"Mutation.unpublishDocument":                  "DOC_WRITE",
		"Mutation.updateBackstory":                    "ADMIN",
		"Mutation.updateCharacterProfile":             "CHAR_OWNER",
		"Mutation.updateDocument":                     "DOC_WRITE",
		"Mutation.updateGameCalendar":                 "ADMIN",
		"Mutation.updateDiscordSettings":              "ADMIN",
		"Mutation.updateHomeBanner":                   "ADMIN",
		"Mutation.updateMyDmProfile":                  "DM_SELF",
		"Mutation.updateMyProfile":                    "SELF",
		"Mutation.updateMySettings":                   "SELF",
		"Mutation.setMyPrivateNotes":                  "SELF",
		"Mutation.updateQuest":                        "QUEST_DM",
		"Mutation.updateQuestAnnouncementRoleSetting": "ADMIN",
		"Mutation.updateMap":                          "MAP_STEWARD",
		"Mutation.updateRegion":                       "REGION_STEWARD",
		"Mutation.updateTimeAnchor":                   "ADMIN",
		"Mutation.upsertCreationCatalogEntry":         "ADMIN",
		"Mutation.upsertDowntimeProject":              "CHAR_OWNER",
		"Mutation.upsertPointcrawlNode":               "MAP_STEWARD",
		"Mutation.upsertQuestArc":                     "ARC_AUTHOR",
		"Mutation.upsertQuestSummary":                 "SUMMARY_AUTHOR",
		"Mutation.upsertUnlockable":                   "ADMIN",
		"Mutation.withdrawFromQuest":                  "CHAR_SIGNUP",
		"Query.adminCharacterDirectory":               "STAFF",
		"Query.adminCommunityStats":                   "ADMIN",
		"Query.adminOperations":                       "ADMIN",
		"Query.archonAssignments":                     "ADMIN",
		"Query.backstories":                           "BACKSTORY_PUBLIC_OR_ADMIN",
		"Query.character":                             "PUBLIC",
		"Query.characterLogs":                         "PUBLIC",
		"Query.characterProgression":                  "PUBLIC",
		"Query.characterSummaries":                    "PUBLIC",
		"Query.characterVerificationHistory":          "CHAR_HISTORY",
		"Query.characters":                            "PUBLIC",
		"Query.coPlayers":                             "PUBLIC",
		"Query.codexCategories":                       "DOC_AUDIENCE",
		"Query.codexDirectory":                        "DOC_AUDIENCE",
		"Query.codexEntry":                            "DOC_AUDIENCE",
		"Query.communityDirectory":                    "PUBLIC",
		"Query.creationCatalog":                       "CATALOG_PUBLIC_OR_ADMIN",
		"Query.discordDeliveryMode":                   "ADMIN",
		"Query.discordSettings":                       "ADMIN",
		"Query.dmSessionHistory":                      "PUBLIC",
		"Query.dmStats":                               "PUBLIC",
		"Query.dmSummaries":                           "PUBLIC",
		"Query.document":                              "DOC_AUDIENCE",
		"Query.documentBacklinks":                     "DOC_AUDIENCE",
		"Query.documentById":                          "DOC_AUDIENCE",
		"Query.documentRevisions":                     "DOC_REVISIONS",
		"Query.documents":                             "DOC_AUDIENCE",
		"Query.documentsTrash":                        "ADMIN",
		"Query.downtimeProjects":                      "PUBLIC",
		"Query.gameCalendar":                          "PUBLIC",
		"Query.gameDate":                              "PUBLIC",
		"Query.home":                                  "PUBLIC",
		"Query.homeBanner":                            "PUBLIC",
		"Query.lieutenantAssignments":                 "LIEUTENANT_READ",
		"Query.map":                                   "PUBLIC",
		"Query.maps":                                  "PUBLIC",
		"Query.member":                                "PUBLIC",
		"Query.memberActivityStats":                   "PUBLIC",
		"Query.memberAvailability":                    "PUBLIC",
		"Query.memberByDiscordId":                     "DISCORD_SELF_OR_ADMIN",
		"Query.memberMe":                              "SELF",
		"Query.memberProfile":                         "PUBLIC",
		"Query.memberRoleHistory":                     "ADMIN",
		"Query.members":                               "PUBLIC",
		"Query.myAvailability":                        "SELF",
		"Query.myCharacters":                          "SELF",
		"Query.myNotifications":                       "SELF",
		"Query.myPersonalization":                     "SELF",
		"Query.myPrivateNotes":                        "SELF",
		"Query.myQuestSignups":                        "SELF",
		"Query.myUnlocks":                             "SELF",
		"Query.myUnreadNotificationCount":             "SELF",
		"Query.openQuestSeats":                        "PUBLIC",
		"Query.participationsByCharacter":             "PUBLIC",
		"Query.pendingCharacterVerifications":         "STAFF",
		"Query.pendingDmProfileVerifications":         "STAFF",
		"Query.previewBody":                           "PREVIEW",
		"Query.auditBody":                             "PREVIEW",
		"Query.quest":                                 "PUBLIC",
		"Query.questAnnouncementRoleSetting":          "PUBLIC",
		"Query.questVoiceChannels":                    "DM_SELF",
		"Query.questArc":                              "PUBLIC",
		"Query.questArcs":                             "PUBLIC",
		"Query.questBoard":                            "PUBLIC",
		"Query.questGenreOptions":                     "PUBLIC",
		"Query.questStateCounts":                      "PUBLIC",
		"Query.questSummaries":                        "PUBLIC",
		"Query.quests":                                "PUBLIC",
		"Query.realDates":                             "PUBLIC",
		"Query.recentlyClosedQuests":                  "PUBLIC",
		"Query.regionActivity":                        "PUBLIC",
		"Query.regionCounts":                          "PUBLIC",
		"Query.regions":                               "PUBLIC",
		"Query.search":                                "PUBLIC",
		"Query.searchableKinds":                       "PUBLIC",
		"Query.siteStats":                             "PUBLIC",
		"Query.timeAnchors":                           "ADMIN",
		"Query.unlockablesCatalog":                    "PUBLIC",
	}
	actual := map[Operation]bool{}
	for _, root := range []*ast.Definition{schema.Query, schema.Mutation} {
		for _, field := range root.Fields {
			if strings.HasPrefix(field.Name, "__") || strings.HasPrefix(field.Name, "_") {
				continue
			}
			op := Operation(root.Name + "." + field.Name)
			actual[op] = true
			if _, ok := expected[op]; !ok {
				t.Errorf("uncovered SDL operation %s", op)
			}
			if _, ok := operationRules[op]; !ok {
				t.Errorf("unimplemented policy operation %s", op)
			}
		}
	}
	if len(expected) != 156 || len(actual) != len(expected) || len(operationRules) != len(expected) {
		t.Fatalf("coverage expected%d SDL%d registry%d", len(expected), len(actual), len(operationRules))
	}
	p, _, facts := policyTestProvider(t)
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	admin := policyAuthority(t, policyActor, []Role{Admin}, true, false)
	owner := policyAuthority(t, policyActor, []Role{Player}, false, true)
	for op, group := range expected {
		t.Run(string(op), func(t *testing.T) {
			if !actual[op] {
				t.Fatal("extra policy identity")
			}
			var request Request
			var err error
			wantPlayer := Decision{Allowed: true}
			wantAdmin := Decision{Allowed: true}
			switch group {
			case "PUBLIC", "SELF", "CHAR_CREATE":
				request, err = ForOperation(op)
			case "ADMIN", "STAFF", "DM_SELF", "PLAYER_SELF", "DM_INBOX", "LIEUTENANT_WRITE":
				request, err = ForOperation(op)
				if group != "PLAYER_SELF" {
					wantPlayer = Decision{RuleCode: "ROLE"}
				}
				if group == "DM_INBOX" {
					wantAdmin = Decision{true, true, "ROLE"}
				}
			case "DISCORD_SELF_OR_ADMIN":
				request, err = ForDiscordLookup(DiscordLookupFacts{"111111111111111111"})
			case "CATALOG_PUBLIC_OR_ADMIN":
				request = ForCreationCatalog(false)
			case "BACKSTORY_PUBLIC_OR_ADMIN":
				request = ForBackstories(false)
			case "DOC_AUDIENCE":
				request, err = ForDocumentRead(op, []DocumentRef{{policySubject}})
				facts.audience = []AudienceResult{{policySubject, AudienceOrdinary}}
			case "DOC_REVISIONS", "DOC_WRITE":
				request, err = ForDocumentWrite(op, DocumentWriteFacts{ID: policySubject, AuthorID: policyActor, Kind: "codex_entry", Category: policyPointer("Lore")})
			case "LIEUTENANT_READ":
				request, err = ForLieutenantAssignments(LieutenantReadFacts{Documents: []DocumentWriteFacts{{policySubject, policyActor, "codex_entry", policyPointer("NPC"), nil, nil}}})
			case "PREVIEW":
				request, err = ForPreview(PreviewFacts{Audience: PreviewPlayer})
				if op == "Query.auditBody" {
					request, err = ForAuditBody()
				}
			case "CHAR_OWNER", "CHAR_SIGNUP", "CHAR_HISTORY":
				request, err = ForCharacter(op, CharacterFacts{policySubject, policyActor})
			case "DOC_CREATE":
				request, err = ForDocumentCreate(DocumentCreateFacts{AuthorID: policyActor, Kind: "codex_entry", Category: policyPointer("Lore")})
			case "MAP_STEWARD":
				request, err = ForMap(op, MapFacts{ID: policyPointer(policySubject), RegionID: policyPointer(policyRegion)})
				wantPlayer = Decision{RuleCode: "ROLE"}
			case "REGION_STEWARD":
				request, err = ForRegion(op, RegionFacts{policyRegion})
				wantPlayer = Decision{RuleCode: "ROLE"}
			case "QUEST_DM":
				request, err = ForQuest(op, QuestFacts{ID: policySubject, DMID: policyActor})
			case "QUEST_CREATE":
				request, err = ForQuestCreate(QuestCreateFacts{policyActor})
				wantPlayer = Decision{RuleCode: "ROLE"}
			case "ARC_AUTHOR":
				request, err = ForArc(ArcFacts{policyPointer(policySubject), policyPointer(policyActor)})
			case "SUMMARY_AUTHOR":
				request, err = ForSummary(SummaryFacts{QuestIDs: []string{policyRegion}})
				facts.summary = SummaryEvidence{Relations: []SummaryRelation{{policyRegion, policyOther, policyPointer(policyActor), policyPointer("played")}}}
			default:
				t.Fatalf("missing behavioral case for %s", group)
			}
			request = policyMustRequest(t, request, err)
			policyExpect(t, p, player, request, wantPlayer)
			policyExpect(t, p, admin, request, wantAdmin)
			wantOwner := wantPlayer
			if !wantOwner.Allowed {
				wantOwner.Allowed = true
				wantOwner.UsedOverride = true
			}
			policyExpect(t, p, owner, request, wantOwner)
		})
	}
}

func testPolicyScopeActivation(t *testing.T) {
	p, _, facts := policyTestProvider(t)
	req, err := ForDocumentRead("Query.documents", nil)
	req = policyMustRequest(t, req, err)
	admin := policyAuthority(t, policyActor, []Role{Admin}, false, false)
	facts.scopeOverride = policyPointer(policySubject)
	policyExpect(t, p, admin, req, Decision{true, true, "AUDIENCE"})
	player := policyAuthority(t, policyActor, []Role{Player}, false, false)
	_, err = p.Decide(t.Context(), player, req)
	policyCheckError(t, err, apierr.Internal)
	facts.scopeOverride = policyPointer("fabricated-scope")
	_, err = p.Decide(t.Context(), admin, req)
	policyCheckError(t, err, apierr.Internal)
	facts.scopeOverride = nil
	policyExpect(t, p, admin, req, Decision{Allowed: true})
}

func testPolicyCharacterHistory(t *testing.T) {
	p, _, _ := policyTestProvider(t)
	_, err := ForOperation("Query.characterVerificationHistory")
	policyCheckError(t, err, apierr.Internal)
	req, err := ForCharacter("Query.characterVerificationHistory", CharacterFacts{policySubject, policyActor})
	req = policyMustRequest(t, req, err)
	for _, test := range []struct {
		name  string
		actor Authority
		want  Decision
	}{
		{"owning player", policyAuthority(t, policyActor, []Role{Player}, false, false), Decision{Allowed: true}},
		{"foreign player", policyAuthority(t, policyOther, []Role{Player}, false, false), Decision{RuleCode: "OWNERSHIP"}},
		{"foreign verifier", policyAuthority(t, policyOther, []Role{Verifier}, false, false), Decision{Allowed: true}},
		{"foreign admin", policyAuthority(t, policyOther, []Role{Admin}, false, false), Decision{Allowed: true}},
		{"foreign configured owner", policyAuthority(t, policyOther, []Role{Player}, false, true), Decision{true, true, "OWNERSHIP"}},
		{"owning configured owner", policyAuthority(t, policyActor, []Role{Player}, false, true), Decision{Allowed: true}},
		{"foreign DM", policyAuthority(t, policyOther, []Role{DM}, true, false), Decision{RuleCode: "OWNERSHIP"}},
	} {
		t.Run(test.name, func(t *testing.T) { policyExpect(t, p, test.actor, req, test.want) })
	}
}
