package auth

import (
	"context"
	"github.com/google/uuid"
	"log/slog"
	"reflect"
	"slices"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

// Operation is the exact case-sensitive SDL Query or Mutation wire identity.
type Operation string

type Decision struct {
	Allowed      bool
	UsedOverride bool
	RuleCode     string
}

type OverrideFact struct {
	ActorID     string
	Operation   Operation
	SubjectType string
	SubjectID   string
	RuleCode    string
	At          time.Time
}

type ArchonReader interface {
	HasArchon(ctx context.Context, memberID, regionID string) (bool, error)
}

type LieutenantReader interface {
	HasLieutenant(ctx context.Context, memberID, documentID string) (bool, error)
}

type AssignmentReader interface {
	ArchonReader
	LieutenantReader
}

type Assignments struct {
	Archons     ArchonReader
	Lieutenants LieutenantReader
}

func NewAssignments(archons ArchonReader, lieutenants LieutenantReader) (*Assignments, error) {
	if missingPolicyDependency(archons) || missingPolicyDependency(lieutenants) {
		return nil, apierr.New(apierr.Internal, "assignment providers required")
	}
	return &Assignments{Archons: archons, Lieutenants: lieutenants}, nil
}

func (a *Assignments) HasArchon(ctx context.Context, memberID, regionID string) (bool, error) {
	return a.Archons.HasArchon(ctx, memberID, regionID)
}

func (a *Assignments) HasLieutenant(ctx context.Context, memberID, documentID string) (bool, error) {
	return a.Lieutenants.HasLieutenant(ctx, memberID, documentID)
}

type OverrideReadObserver interface {
	Observe(ctx context.Context, fact OverrideFact)
}

type OverrideRecorder interface {
	Record(ctx context.Context, fact OverrideFact) error
}

type SafeOverrideObserver struct{ Logger *slog.Logger }

func NewSafeOverrideObserver(logger *slog.Logger) (*SafeOverrideObserver, error) {
	if logger == nil {
		return nil, apierr.New(apierr.Internal, "override logger required")
	}
	return &SafeOverrideObserver{Logger: logger}, nil
}

type PostgresOverrideRecorder struct{ DB jobs.SQLExecutor }

func NewOverrideRecorder(db jobs.SQLExecutor) (*PostgresOverrideRecorder, error) {
	if missingPolicyDependency(db) {
		return nil, apierr.New(apierr.Internal, "override executor required")
	}
	return &PostgresOverrideRecorder{DB: db}, nil
}

func missingPolicyDependency(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return v.IsNil()
	default:
		return false
	}
}

// Observe receives only safe factual metadata, after the caller has established
// that this evaluation used an actual override. Reads never persist an audit.
func (o *SafeOverrideObserver) Observe(ctx context.Context, fact OverrideFact) {
	if !overrideRuleCode(fact.RuleCode) {
		return
	}
	o.Logger.InfoContext(ctx, "authorization override",
		"actorId", fact.ActorID, "operation", string(fact.Operation),
		"subjectType", fact.SubjectType, "subjectId", fact.SubjectID,
		"ruleCode", fact.RuleCode, "at", fact.At)
}

// Record uses the injected current business transaction. It never acquires a
// connection, commits, or supplies a second clock for the command's fact.
func (r *PostgresOverrideRecorder) Record(ctx context.Context, fact OverrideFact) error {
	if !overrideRuleCode(fact.RuleCode) {
		return apierr.New(apierr.Invalid, "invalid override rule")
	}
	tag, err := r.DB.Exec(ctx, `INSERT INTO auth_override_audit
 (actor_id, operation, subject_type, subject_public_id, rule_code, recorded_at)
 VALUES ((SELECT id FROM members WHERE public_id = $1::uuid), $2, $3, $4::uuid, $5, $6)`,
		fact.ActorID, string(fact.Operation), fact.SubjectType, fact.SubjectID, fact.RuleCode, fact.At)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return apierr.New(apierr.Internal, "override audit was not recorded")
	}
	return nil
}

func overrideRuleCode(code string) bool {
	switch code {
	case "ROLE", "OWNERSHIP", "ASSIGNMENT", "AUDIENCE":
		return true
	default:
		return false
	}
}

// Request binds an exact operation to owning-domain facts. Transport arguments
// never supply owner identities, assignment verdicts, or bypass eligibility.
type Request struct {
	operation Operation
	input     policyInput
}

func (r Request) Operation() Operation { return r.operation }

type policyInput interface{ policyInput() }
type noPolicyFacts struct{}

func (noPolicyFacts) policyInput() {}

type CharacterFacts struct{ ID, OwnerID string }

func (CharacterFacts) policyInput() {}

type QuestFacts struct {
	ID, DMID string
	Hexes    []QuestHexFacts
}

func (QuestFacts) policyInput() {}

type QuestHexFacts struct {
	ID, Role string
	RegionID *string
}
type RegionFacts struct{ ID string }

func (RegionFacts) policyInput() {}

type MapFacts struct {
	ID        *string
	RegionID  *string
	Submap    *MapRef
	Locations []DocumentWriteFacts
}

func (MapFacts) policyInput() {}

type MapRef struct {
	ID       string
	RegionID *string
}
type DocumentWriteFacts struct {
	ID, AuthorID, Kind string
	Category           *string
	LinkedRegionIDs    []string
}

func (DocumentWriteFacts) policyInput() {}

type DocumentCreateFacts struct {
	AuthorID, Kind  string
	Category        *string
	LinkedRegionIDs []string
}

func (DocumentCreateFacts) policyInput() {}

type PreviewAudience string

const (
	PreviewPlayer PreviewAudience = "PLAYER"
	PreviewDM     PreviewAudience = "DM"
)

type PreviewFacts struct {
	Audience PreviewAudience
	AuthorID *string
}

func (PreviewFacts) policyInput() {}

type RequestDecisionFacts struct{ ID, TargetDMID string }

func (RequestDecisionFacts) policyInput() {}

type DiscordLookupFacts struct{ RequestedDiscordID string }

func (DiscordLookupFacts) policyInput() {}

type SummaryFacts struct {
	DocumentID, AuthorID, CharacterID *string
	QuestIDs                          []string
}

func (SummaryFacts) policyInput() {}

type ArcFacts struct{ ID, AuthorID *string }

func (ArcFacts) policyInput() {}

type QuestCreateFacts struct{ RequestedDMID string }

func (QuestCreateFacts) policyInput() {}

type LieutenantReadFacts struct {
	Documents    []DocumentWriteFacts
	MemberFilter *string
}

func (LieutenantReadFacts) policyInput() {}

type catalogFacts struct{ includeAll bool }

func (catalogFacts) policyInput() {}

type backstoryFacts struct{ includeRetired bool }

func (backstoryFacts) policyInput() {}

type DocumentRef struct{ ID string }
type documentReadFacts struct{ refs []DocumentRef }

func (documentReadFacts) policyInput() {}

type AudienceOutcome uint8

const (
	AudienceDenied AudienceOutcome = iota
	AudienceOrdinary
	AudienceOverridden
)

type AudienceResult struct {
	SubjectID string
	Outcome   AudienceOutcome
}
type AudienceAssessment struct {
	Results                []AudienceResult
	ScopeOverrideSubjectID *string
}

type AudienceContext struct {
	actor  Authority
	bypass bool
}

func (v AudienceContext) Authority() Authority      { return v.actor }
func (v AudienceContext) SharedBypassEnabled() bool { return v.bypass }

type DocumentAudienceReader interface {
	Assess(context.Context, AudienceContext, []DocumentRef) (AudienceAssessment, error)
}
type DiscordIdentity struct{ MemberID, DiscordID string }
type MemberIdentityReader interface {
	DiscordIdentity(context.Context, string) (DiscordIdentity, error)
}
type SummaryRelation struct {
	QuestID, QuestDMID                    string
	ParticipantOwnerID, ParticipantStatus *string
}
type SummaryEvidence struct {
	Relations []SummaryRelation
	Character *CharacterFacts
}
type SummaryRelationshipReader interface {
	SummaryRelations(context.Context, []string, *string) (SummaryEvidence, error)
}
type PolicyProviders struct {
	Assignments          AssignmentReader
	Audience             DocumentAudienceReader
	Identities           MemberIdentityReader
	SummaryRelationships SummaryRelationshipReader
}
type Policy struct{ providers PolicyProviders }

func NewPolicy(providers PolicyProviders) (*Policy, error) {
	for _, dependency := range []any{providers.Assignments, providers.Audience, providers.Identities, providers.SummaryRelationships} {
		if missingPolicyDependency(dependency) {
			return nil, apierr.New(apierr.Internal, "policy providers required")
		}
	}
	return &Policy{providers: providers}, nil
}

type policyRule uint8

const (
	rulePublic policyRule = iota
	ruleSelf
	ruleAdmin
	ruleStaff
	ruleDMSelf
	rulePlayerSelf
	ruleDMInbox
	ruleDiscord
	ruleCatalog
	ruleBackstory
	ruleAudience
	ruleRevisions
	ruleLieutenantRead
	rulePreview
	ruleCharacter
	ruleCharacterCreate
	ruleCharacterHistory
	ruleSignup
	ruleDocumentCreate
	ruleDocumentWrite
	ruleLieutenantWrite
	ruleMap
	ruleRegion
	ruleQuest
	ruleQuestCreate
	ruleArc
	ruleSummary
	ruleRequest
)

var operationRules = map[Operation]policyRule{
	"Mutation.acknowledgeSuppressedNotifications": ruleSelf,
	"Mutation.adjustPcxp":                         ruleCharacter,
	"Mutation.assignArchon":                       ruleAdmin,
	"Mutation.assignLieutenant":                   ruleLieutenantWrite,
	"Mutation.attestQuestParticipation":           ruleQuest,
	"Mutation.closeQuest":                         ruleQuest,
	"Mutation.createBackstory":                    ruleAdmin,
	"Mutation.createCharacter":                    ruleCharacterCreate,
	"Mutation.createDocument":                     ruleDocumentCreate,
	"Mutation.createMap":                          ruleMap,
	"Mutation.createQuest":                        ruleQuestCreate,
	"Mutation.createRegion":                       ruleAdmin,
	"Mutation.createTimeAnchor":                   ruleAdmin,
	"Mutation.decideDmProfileVerification":        ruleStaff,
	"Mutation.decideVerification":                 ruleStaff,
	"Mutation.deleteCharacter":                    ruleCharacter,
	"Mutation.deleteCharacterLog":                 ruleCharacter,
	"Mutation.deleteDocument":                     ruleDocumentWrite,
	"Mutation.deleteQuest":                        ruleQuest,
	"Mutation.deleteRegion":                       ruleRegion,
	"Mutation.editPublishedDocument":              ruleDocumentWrite,
	"Mutation.grantUnlock":                        ruleAdmin,
	"Mutation.linkPointcrawlEntry":                ruleMap,
	"Mutation.logCharacterEvent":                  ruleCharacter,
	"Mutation.markNotificationsRead":              ruleSelf,
	"Mutation.publishDocument":                    ruleDocumentWrite,
	"Mutation.redriveDiscordDelivery":             ruleAdmin,
	"Mutation.removeQuestFromArc":                 ruleQuest,
	"Mutation.restoreCharacter":                   ruleCharacter,
	"Mutation.restoreDocument":                    ruleDocumentWrite,
	"Mutation.restoreQuest":                       ruleQuest,
	"Mutation.restoreRegion":                      ruleRegion,
	"Mutation.retireCharacter":                    ruleCharacter,
	"Mutation.revokeArchon":                       ruleAdmin,
	"Mutation.revokeLieutenant":                   ruleLieutenantWrite,
	"Mutation.selectQuestParticipants":            ruleQuest,
	"Mutation.setCharacterGuild":                  ruleCharacter,
	"Mutation.setDocumentVisibility":              ruleDocumentWrite,
	"Mutation.setMemberRoles":                     ruleAdmin,
	"Mutation.setMemberRolesBatch":                ruleAdmin,
	"Mutation.setMyAvailability":                  rulePlayerSelf,
	"Mutation.setPointcrawlEdge":                  ruleMap,
	"Mutation.setQuestPointcrawlLinks":             ruleQuest,
	"Mutation.setUnlockableActive":                ruleAdmin,
	"Mutation.signupForQuest":                     ruleSignup,
	"Mutation.submitDmProfileForVerification":     ruleDMSelf,
	"Mutation.submitForVerification":              ruleCharacter,
	"Mutation.syncCharacterDdb":                   ruleCharacter,
	"Mutation.syncQuestDiscord":                   ruleQuest,
	"Mutation.transitionQuestStatus":              ruleQuest,
	"Mutation.transitionRegion":                   ruleAdmin,
	"Mutation.unlinkPointcrawlEntry":              ruleMap,
	"Mutation.unpublishDocument":                  ruleDocumentWrite,
	"Mutation.updateBackstory":                    ruleAdmin,
	"Mutation.updateCharacterProfile":             ruleCharacter,
	"Mutation.updateDocument":                     ruleDocumentWrite,
	"Mutation.updateGameCalendar":                 ruleAdmin,
	"Mutation.updateHomeBanner":                   ruleAdmin,
	"Mutation.updateMyDmProfile":                  ruleDMSelf,
	"Mutation.updateMyProfile":                    ruleSelf,
	"Mutation.updateMySettings":                   ruleSelf,
	"Mutation.updateQuest":                        ruleQuest,
	"Mutation.updateQuestAnnouncementRoleSetting": ruleAdmin,
	"Mutation.updateRegion":                       ruleRegion,
	"Mutation.updateTimeAnchor":                   ruleAdmin,
	"Mutation.upsertCreationCatalogEntry":         ruleAdmin,
	"Mutation.upsertDowntimeProject":              ruleCharacter,
	"Mutation.upsertPointcrawlNode":               ruleMap,
	"Mutation.upsertQuestArc":                     ruleArc,
	"Mutation.upsertQuestSummary":                 ruleSummary,
	"Mutation.upsertUnlockable":                   ruleAdmin,
	"Mutation.withdrawFromQuest":                  ruleSignup,
	"Query.adminCharacterDirectory":               ruleStaff,
	"Query.adminOperations":                       ruleAdmin,
	"Query.archonAssignments":                     ruleAdmin,
	"Query.backstories":                           ruleBackstory,
	"Query.character":                             rulePublic,
	"Query.characterLogs":                         rulePublic,
	"Query.characterProgression":                  rulePublic,
	"Query.characterSummaries":                    rulePublic,
	"Query.characterVerificationHistory":          ruleCharacterHistory,
	"Query.characters":                            rulePublic,
	"Query.coPlayers":                             rulePublic,
	"Query.codexCategories":                       ruleAudience,
	"Query.codexDirectory":                        ruleAudience,
	"Query.codexEntry":                            ruleAudience,
	"Query.communityDirectory":                    rulePublic,
	"Query.creationCatalog":                       ruleCatalog,
	"Query.discordDeliveryMode":                   ruleAdmin,
	"Query.dmSessionHistory":                      rulePublic,
	"Query.dmStats":                               rulePublic,
	"Query.dmSummaries":                           rulePublic,
	"Query.document":                              ruleAudience,
	"Query.documentBacklinks":                     ruleAudience,
	"Query.documentById":                          ruleAudience,
	"Query.documentRevisions":                     ruleRevisions,
	"Query.documents":                             ruleAudience,
	"Query.documentsTrash":                        ruleAdmin,
	"Query.downtimeProjects":                      rulePublic,
	"Query.gameCalendar":                          rulePublic,
	"Query.gameDate":                              rulePublic,
	"Query.home":                                  rulePublic,
	"Query.homeBanner":                            rulePublic,
	"Query.lieutenantAssignments":                 ruleLieutenantRead,
	"Query.map":                                   rulePublic,
	"Query.maps":                                  rulePublic,
	"Query.member":                                rulePublic,
	"Query.memberActivityStats":                   rulePublic,
	"Query.memberAvailability":                    rulePublic,
	"Query.memberByDiscordId":                     ruleDiscord,
	"Query.memberMe":                              ruleSelf,
	"Query.memberProfile":                         rulePublic,
	"Query.memberRoleHistory":                     ruleAdmin,
	"Query.members":                               rulePublic,
	"Query.myAvailability":                        ruleSelf,
	"Query.myCharacters":                          ruleSelf,
	"Query.myNotifications":                       ruleSelf,
	"Query.myPersonalization":                     ruleSelf,
	"Query.myQuestSignups":                        ruleSelf,
	"Query.myUnlocks":                             ruleSelf,
	"Query.myUnreadNotificationCount":             ruleSelf,
	"Query.openQuestSeats":                        rulePublic,
	"Query.participationsByCharacter":             rulePublic,
	"Query.pendingCharacterVerifications":         ruleStaff,
	"Query.pendingDmProfileVerifications":         ruleStaff,
	"Query.previewBody":                           rulePreview,
	"Query.quest":                                 rulePublic,
	"Query.questAnnouncementRoleSetting":          rulePublic,
	"Query.questArc":                              rulePublic,
	"Query.questArcs":                             rulePublic,
	"Query.questBoard":                            rulePublic,
	"Query.questGenreOptions":                     rulePublic,
	"Query.questStateCounts":                      rulePublic,
	"Query.questSummaries":                        rulePublic,
	"Query.quests":                                rulePublic,
	"Query.realDates":                             rulePublic,
	"Query.recentlyClosedQuests":                  rulePublic,
	"Query.regionActivity":                        rulePublic,
	"Query.regionCounts":                          rulePublic,
	"Query.regions":                               rulePublic,
	"Query.search":                                rulePublic,
	"Query.searchableKinds":                       rulePublic,
	"Query.siteStats":                             rulePublic,
	"Query.timeAnchors":                           ruleAdmin,
	"Query.unlockablesCatalog":                    rulePublic,
}

func policyContractError() error { return apierr.New(apierr.Internal, "invalid authorization facts") }
func canonicalPolicyID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed != uuid.Nil && parsed.String() == id
}
func optionalPolicyID(id *string) bool { return id == nil || canonicalPolicyID(*id) }
func copyPolicyString(value *string) *string {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}
func copyDocumentFacts(f DocumentWriteFacts) DocumentWriteFacts {
	f.Category = copyPolicyString(f.Category)
	f.LinkedRegionIDs = slices.Clone(f.LinkedRegionIDs)
	return f
}
func knownDocumentKind(kind string) bool {
	switch kind {
	case "codex_entry", "rule", "summary", "quest_brief", "community":
		return true
	}
	return false
}
func validRegionSet(ids []string) bool {
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if !canonicalPolicyID(id) {
			return false
		}
		if _, ok := seen[id]; ok {
			return false
		}
		seen[id] = struct{}{}
	}
	return true
}
func validDocumentFacts(f DocumentWriteFacts) bool {
	return canonicalPolicyID(f.ID) && canonicalPolicyID(f.AuthorID) && knownDocumentKind(f.Kind) && validRegionSet(f.LinkedRegionIDs)
}
func policyRequest(op Operation, input policyInput, allowed ...policyRule) (Request, error) {
	rule, known := operationRules[op]
	if !known {
		return Request{}, apierr.New(apierr.Forbidden, "unknown operation")
	}
	if !slices.Contains(allowed, rule) {
		return Request{}, policyContractError()
	}
	return Request{operation: op, input: input}, nil
}
func ForOperation(op Operation) (Request, error) {
	return policyRequest(op, noPolicyFacts{}, rulePublic, ruleSelf, ruleAdmin, ruleStaff, ruleDMSelf, rulePlayerSelf, ruleDMInbox, ruleCharacterCreate, ruleLieutenantWrite)
}
func ForCharacter(op Operation, facts CharacterFacts) (Request, error) {
	if !canonicalPolicyID(facts.ID) || !canonicalPolicyID(facts.OwnerID) {
		return Request{}, policyContractError()
	}
	return policyRequest(op, facts, ruleCharacter, ruleSignup, ruleCharacterHistory)
}
func ForQuest(op Operation, facts QuestFacts) (Request, error) {
	if !canonicalPolicyID(facts.ID) || !canonicalPolicyID(facts.DMID) {
		return Request{}, policyContractError()
	}
	facts.Hexes = slices.Clone(facts.Hexes)
	for i, hex := range facts.Hexes {
		if op != "Mutation.setQuestPointcrawlLinks" || !canonicalPolicyID(hex.ID) || !optionalPolicyID(hex.RegionID) || (hex.Role != "expected" && hex.Role != "visited") {
			return Request{}, policyContractError()
		}
		facts.Hexes[i].RegionID = copyPolicyString(hex.RegionID)
	}
	return policyRequest(op, facts, ruleQuest)
}
func ForMap(op Operation, facts MapFacts) (Request, error) {
	if !optionalPolicyID(facts.ID) || !optionalPolicyID(facts.RegionID) || (op != "Mutation.createMap" && facts.ID == nil) {
		return Request{}, policyContractError()
	}
	facts.ID = copyPolicyString(facts.ID)
	facts.RegionID = copyPolicyString(facts.RegionID)
	if facts.Submap != nil {
		submap := *facts.Submap
		if !canonicalPolicyID(submap.ID) || !optionalPolicyID(submap.RegionID) {
			return Request{}, policyContractError()
		}
		submap.RegionID = copyPolicyString(submap.RegionID)
		facts.Submap = &submap
	}
	facts.Locations = slices.Clone(facts.Locations)
	for i, location := range facts.Locations {
		if !validDocumentFacts(location) || location.Kind != "codex_entry" || location.Category == nil || *location.Category != "Locations" {
			return Request{}, policyContractError()
		}
		facts.Locations[i] = copyDocumentFacts(location)
	}
	return policyRequest(op, facts, ruleMap)
}
func ForRegion(op Operation, facts RegionFacts) (Request, error) {
	if !canonicalPolicyID(facts.ID) {
		return Request{}, policyContractError()
	}
	return policyRequest(op, facts, ruleRegion)
}
func ForDocumentWrite(op Operation, facts DocumentWriteFacts) (Request, error) {
	if !validDocumentFacts(facts) {
		return Request{}, policyContractError()
	}
	return policyRequest(op, copyDocumentFacts(facts), ruleDocumentWrite, ruleRevisions)
}
func ForDocumentCreate(facts DocumentCreateFacts) (Request, error) {
	if !canonicalPolicyID(facts.AuthorID) || !knownDocumentKind(facts.Kind) || !validRegionSet(facts.LinkedRegionIDs) {
		return Request{}, policyContractError()
	}
	facts.Category = copyPolicyString(facts.Category)
	facts.LinkedRegionIDs = slices.Clone(facts.LinkedRegionIDs)
	return policyRequest("Mutation.createDocument", facts, ruleDocumentCreate)
}
func ForDocumentRead(op Operation, refs []DocumentRef) (Request, error) {
	for _, ref := range refs {
		if !canonicalPolicyID(ref.ID) {
			return Request{}, policyContractError()
		}
	}
	switch op {
	case "Query.document", "Query.documentById", "Query.codexEntry":
		if len(refs) != 1 {
			return Request{}, policyContractError()
		}
	}
	return policyRequest(op, documentReadFacts{refs: slices.Clone(refs)}, ruleAudience)
}
func ForCreationCatalog(includeAll bool) Request {
	return Request{operation: "Query.creationCatalog", input: catalogFacts{includeAll: includeAll}}
}
func ForBackstories(includeRetired bool) Request {
	return Request{operation: "Query.backstories", input: backstoryFacts{includeRetired: includeRetired}}
}
func ForPreview(facts PreviewFacts) (Request, error) {
	if (facts.Audience != PreviewPlayer && facts.Audience != PreviewDM) || !optionalPolicyID(facts.AuthorID) {
		return Request{}, policyContractError()
	}
	facts.AuthorID = copyPolicyString(facts.AuthorID)
	return policyRequest("Query.previewBody", facts, rulePreview)
}
func ForDiscordLookup(facts DiscordLookupFacts) (Request, error) {
	if facts.RequestedDiscordID == "" {
		return Request{}, policyContractError()
	}
	return policyRequest("Query.memberByDiscordId", facts, ruleDiscord)
}
func ForRequestDecision(facts RequestDecisionFacts) (Request, error) {
	if !canonicalPolicyID(facts.ID) || !canonicalPolicyID(facts.TargetDMID) {
		return Request{}, policyContractError()
	}
	return policyRequest("Mutation.decideRequest", facts, ruleRequest)
}
func ForSummary(facts SummaryFacts) (Request, error) {
	if !optionalPolicyID(facts.DocumentID) || !optionalPolicyID(facts.AuthorID) || !optionalPolicyID(facts.CharacterID) || (facts.DocumentID == nil) != (facts.AuthorID == nil) || len(facts.QuestIDs) == 0 || !validRegionSet(facts.QuestIDs) {
		return Request{}, policyContractError()
	}
	facts.DocumentID = copyPolicyString(facts.DocumentID)
	facts.AuthorID = copyPolicyString(facts.AuthorID)
	facts.CharacterID = copyPolicyString(facts.CharacterID)
	facts.QuestIDs = slices.Clone(facts.QuestIDs)
	return policyRequest("Mutation.upsertQuestSummary", facts, ruleSummary)
}
func ForArc(facts ArcFacts) (Request, error) {
	if !optionalPolicyID(facts.ID) || !optionalPolicyID(facts.AuthorID) || (facts.ID == nil) != (facts.AuthorID == nil) {
		return Request{}, policyContractError()
	}
	facts.ID = copyPolicyString(facts.ID)
	facts.AuthorID = copyPolicyString(facts.AuthorID)
	return policyRequest("Mutation.upsertQuestArc", facts, ruleArc)
}
func ForQuestCreate(facts QuestCreateFacts) (Request, error) {
	if !canonicalPolicyID(facts.RequestedDMID) {
		return Request{}, policyContractError()
	}
	return policyRequest("Mutation.createQuest", facts, ruleQuestCreate)
}
func ForLieutenantAssignments(facts LieutenantReadFacts) (Request, error) {
	if !optionalPolicyID(facts.MemberFilter) {
		return Request{}, policyContractError()
	}
	facts.MemberFilter = copyPolicyString(facts.MemberFilter)
	facts.Documents = slices.Clone(facts.Documents)
	for i, document := range facts.Documents {
		if !validDocumentFacts(document) || document.Kind != "codex_entry" || document.Category == nil || *document.Category != "NPC" {
			return Request{}, policyContractError()
		}
		facts.Documents[i] = copyDocumentFacts(document)
	}
	return policyRequest("Query.lieutenantAssignments", facts, ruleLieutenantRead)
}

// Failed predicates keep their meaning until the shared override decision. A
// single audit fact records the first skipped predicate in this fixed order.
type policyFailures struct{ role, ownership, assignment, audience bool }

func (f policyFailures) first() string {
	switch {
	case f.role:
		return "ROLE"
	case f.ownership:
		return "OWNERSHIP"
	case f.assignment:
		return "ASSIGNMENT"
	case f.audience:
		return "AUDIENCE"
	}
	return ""
}
func policyResult(f policyFailures, bypass bool) Decision {
	code := f.first()
	if code == "" {
		return Decision{Allowed: true}
	}
	if bypass {
		return Decision{Allowed: true, UsedOverride: true, RuleCode: code}
	}
	return Decision{RuleCode: code}
}
func (p *Policy) locationFailures(ctx context.Context, actor Authority, regions []string) (policyFailures, error) {
	f := policyFailures{role: !actor.claims.Has(Archon) && !actor.claims.Has(Admin)}
	if len(regions) == 0 {
		return f, nil
	}
	for _, region := range regions {
		assigned, err := p.providers.Assignments.HasArchon(ctx, actor.claims.MemberID, region)
		if err != nil {
			return policyFailures{}, err
		}
		f.assignment = f.assignment || !assigned
	}
	return f, nil
}
func (p *Policy) mapFailures(ctx context.Context, actor Authority, region *string) (policyFailures, error) {
	if region == nil {
		return policyFailures{role: !actor.claims.Has(Admin)}, nil
	}
	return p.locationFailures(ctx, actor, []string{*region})
}
func mergePolicyFailures(a, b policyFailures) policyFailures {
	return policyFailures{a.role || b.role, a.ownership || b.ownership, a.assignment || b.assignment, a.audience || b.audience}
}
func (p *Policy) Decide(ctx context.Context, actor Authority, request Request) (Decision, error) {
	rule, known := operationRules[request.operation]
	if !known {
		return Decision{}, nil
	}
	if request.input == nil {
		return Decision{}, policyContractError()
	}
	if p == nil || missingPolicyDependency(p.providers.Assignments) || missingPolicyDependency(p.providers.Audience) || missingPolicyDependency(p.providers.Identities) || missingPolicyDependency(p.providers.SummaryRelationships) {
		return Decision{}, policyContractError()
	}
	admin := actor.claims.Has(Admin)
	bypass := !actor.claims.Anonymous() && (admin || actor.IsPlatformOwner())
	// Every nonpublic branch below requires resolved active authority, never Claims.
	requiresActor := rule != rulePublic && rule != ruleAudience && rule != ruleCatalog && rule != ruleBackstory
	if requiresActor && actor.claims.Anonymous() {
		return Decision{}, nil
	}
	f := policyFailures{}
	switch rule {
	case rulePublic, ruleSelf, ruleAdmin, ruleStaff, ruleDMSelf, rulePlayerSelf, ruleDMInbox, ruleCharacterCreate, ruleLieutenantWrite:
		if _, ok := request.input.(noPolicyFacts); !ok {
			return Decision{}, policyContractError()
		}
		switch rule {
		case ruleAdmin, ruleLieutenantWrite:
			f.role = !admin
		case ruleStaff:
			f.role = !admin && !actor.claims.Has(Verifier)
		case ruleDMSelf:
			f.role = !admin && !actor.claims.Has(DM)
		case rulePlayerSelf:
			f.role = !admin && !actor.claims.Has(Player)
		case ruleDMInbox:
			f.role = !actor.LiveDM()
		}
	case ruleCatalog:
		facts, ok := request.input.(catalogFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		f.role = facts.includeAll && !admin
	case ruleBackstory:
		facts, ok := request.input.(backstoryFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		f.role = facts.includeRetired && !admin
	case ruleCharacterHistory:
		facts, ok := request.input.(CharacterFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		f.ownership = facts.OwnerID != actor.claims.MemberID && !admin && !actor.claims.Has(Verifier)
	case ruleCharacter, ruleSignup:
		facts, ok := request.input.(CharacterFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		return policyResult(policyFailures{ownership: facts.OwnerID != actor.claims.MemberID}, false), nil
	case ruleRequest:
		facts, ok := request.input.(RequestDecisionFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		return policyResult(policyFailures{role: !actor.LiveDM(), ownership: facts.TargetDMID != actor.claims.MemberID}, false), nil
	case ruleQuestCreate:
		if _, ok := request.input.(QuestCreateFacts); !ok {
			return Decision{}, policyContractError()
		}
		f.role = !actor.LiveDM() && !admin
	case ruleArc:
		facts, ok := request.input.(ArcFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		if facts.ID == nil {
			f.role = !actor.LiveDM() && !admin
		} else {
			f.ownership = *facts.AuthorID != actor.claims.MemberID
		}
	case rulePreview:
		facts, ok := request.input.(PreviewFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		f.role = facts.Audience == PreviewDM && !actor.claims.Has(DM) && !admin
		f.ownership = facts.AuthorID != nil && *facts.AuthorID != actor.claims.MemberID
	case ruleDiscord:
		facts, ok := request.input.(DiscordLookupFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		identity, err := p.providers.Identities.DiscordIdentity(ctx, actor.claims.MemberID)
		if err != nil {
			return Decision{}, err
		}
		if identity.MemberID != actor.claims.MemberID || identity.DiscordID == "" {
			return Decision{}, policyContractError()
		}
		f.role = !admin && identity.DiscordID != facts.RequestedDiscordID
	case ruleDocumentCreate:
		facts, ok := request.input.(DocumentCreateFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		if facts.Kind == "quest_brief" {
			return Decision{}, apierr.New(apierr.Invalid, "quest brief requires Quest command")
		}
		f.ownership = facts.AuthorID != actor.claims.MemberID
		if facts.Kind == "rule" {
			f.role = !admin && !actor.claims.Has(Verifier)
		}
		if facts.Kind == "codex_entry" && facts.Category != nil && *facts.Category == "Locations" {
			gates, err := p.locationFailures(ctx, actor, facts.LinkedRegionIDs)
			if err != nil {
				return Decision{}, err
			}
			f = mergePolicyFailures(f, gates)
		}
	case ruleDocumentWrite, ruleRevisions:
		facts, ok := request.input.(DocumentWriteFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		if rule == ruleDocumentWrite && facts.Kind == "quest_brief" {
			return Decision{}, apierr.New(apierr.Invalid, "quest brief requires Quest command")
		}
		f.ownership = facts.AuthorID != actor.claims.MemberID
		if rule == ruleDocumentWrite && facts.Kind == "rule" {
			f.role = !admin && !actor.claims.Has(Verifier)
		}
		if facts.Kind == "codex_entry" && facts.Category != nil && *facts.Category == "Locations" {
			gates, err := p.locationFailures(ctx, actor, facts.LinkedRegionIDs)
			if err != nil {
				return Decision{}, err
			}
			if rule == ruleDocumentWrite {
				f = gates
			} else if !f.ownership {
				f = policyFailures{}
			} else {
				f = gates
			}
		}
	case ruleRegion:
		facts, ok := request.input.(RegionFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		gates, err := p.locationFailures(ctx, actor, []string{facts.ID})
		if err != nil {
			return Decision{}, err
		}
		f = gates
	case ruleMap:
		facts, ok := request.input.(MapFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		gates, err := p.mapFailures(ctx, actor, facts.RegionID)
		if err != nil {
			return Decision{}, err
		}
		f = gates
		if facts.Submap != nil {
			gates, err = p.mapFailures(ctx, actor, facts.Submap.RegionID)
			if err != nil {
				return Decision{}, err
			}
			f = mergePolicyFailures(f, gates)
		}
		for _, location := range facts.Locations {
			gates, err = p.locationFailures(ctx, actor, location.LinkedRegionIDs)
			if err != nil {
				return Decision{}, err
			}
			f = mergePolicyFailures(f, gates)
		}
	case ruleQuest:
		facts, ok := request.input.(QuestFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		f.ownership = facts.DMID != actor.claims.MemberID
		for _, hex := range facts.Hexes {
			if hex.Role == "visited" {
				gates, err := p.mapFailures(ctx, actor, hex.RegionID)
				if err != nil {
					return Decision{}, err
				}
				f = mergePolicyFailures(f, gates)
			}
		}
	case ruleLieutenantRead:
		facts, ok := request.input.(LieutenantReadFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		for _, document := range facts.Documents {
			assigned, err := p.providers.Assignments.HasLieutenant(ctx, actor.claims.MemberID, document.ID)
			if err != nil {
				return Decision{}, err
			}
			if document.AuthorID != actor.claims.MemberID && !assigned && !admin {
				f.assignment = true
			}
		}
	case ruleAudience:
		facts, ok := request.input.(documentReadFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		assessment, err := p.providers.Audience.Assess(ctx, AudienceContext{actor: actor, bypass: bypass}, slices.Clone(facts.refs))
		if err != nil {
			return Decision{}, err
		}
		results := assessment.Results
		if assessment.ScopeOverrideSubjectID != nil {
			if !bypass || !canonicalPolicyID(*assessment.ScopeOverrideSubjectID) {
				return Decision{}, policyContractError()
			}
			f.audience = true
		}
		if len(results) != len(facts.refs) {
			return Decision{}, policyContractError()
		}
		for i, result := range results {
			if result.SubjectID != facts.refs[i].ID {
				return Decision{}, policyContractError()
			}
			switch result.Outcome {
			case AudienceDenied:
				return Decision{RuleCode: "AUDIENCE"}, nil
			case AudienceOrdinary:
			case AudienceOverridden:
				if !bypass {
					return Decision{}, policyContractError()
				}
				f.audience = true
			default:
				return Decision{}, policyContractError()
			}
		}
	case ruleSummary:
		facts, ok := request.input.(SummaryFacts)
		if !ok {
			return Decision{}, policyContractError()
		}
		evidence, err := p.providers.SummaryRelationships.SummaryRelations(ctx, slices.Clone(facts.QuestIDs), copyPolicyString(facts.CharacterID))
		if err != nil {
			return Decision{}, err
		}
		if len(evidence.Relations) != len(facts.QuestIDs) {
			return Decision{}, policyContractError()
		}
		if facts.CharacterID != nil {
			if evidence.Character == nil || evidence.Character.ID != *facts.CharacterID || !canonicalPolicyID(evidence.Character.OwnerID) {
				return Decision{}, policyContractError()
			}
			f.ownership = evidence.Character.OwnerID != actor.claims.MemberID
		} else if evidence.Character != nil {
			return Decision{}, policyContractError()
		}
		f.role = !actor.claims.Has(Player) && !actor.LiveDM() && !admin
		f.ownership = f.ownership || (facts.AuthorID != nil && *facts.AuthorID != actor.claims.MemberID)
		for i, relation := range evidence.Relations {
			if relation.QuestID != facts.QuestIDs[i] || !canonicalPolicyID(relation.QuestDMID) {
				return Decision{}, policyContractError()
			}
			if (relation.ParticipantOwnerID == nil) != (relation.ParticipantStatus == nil) || !optionalPolicyID(relation.ParticipantOwnerID) {
				return Decision{}, policyContractError()
			}
			if relation.ParticipantStatus != nil {
				switch *relation.ParticipantStatus {
				case "signed_up", "waitlisted", "played", "no_show", "withdrawn":
				default:
					return Decision{}, policyContractError()
				}
			}
			dm := actor.LiveDM() && relation.QuestDMID == actor.claims.MemberID
			participant := relation.ParticipantOwnerID != nil && *relation.ParticipantOwnerID == actor.claims.MemberID && *relation.ParticipantStatus != "withdrawn"
			f.ownership = f.ownership || (!dm && !participant)
		}
	default:
		return Decision{}, policyContractError()
	}
	return policyResult(f, bypass), nil
}
