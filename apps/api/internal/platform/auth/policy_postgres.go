package auth

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// PoolPolicyProviders binds read-only policy fact lookups to the shared pool.
type PoolPolicyProviders struct {
	DB dbgen.DBTX
}

func (p PoolPolicyProviders) HasArchon(ctx context.Context, memberID, regionID string) (bool, error) {
	member, err := db.ParseUUID(memberID)
	if err != nil {
		return false, err
	}
	region, err := db.ParseUUID(regionID)
	if err != nil {
		return false, err
	}
	count, err := dbgen.New(p.DB).CountProductArchonAssignments(ctx, dbgen.CountProductArchonAssignmentsParams{
		MemberID: member,
		RegionID: region,
	})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (p PoolPolicyProviders) HasLieutenant(ctx context.Context, memberID, documentID string) (bool, error) {
	member, err := db.ParseUUID(memberID)
	if err != nil {
		return false, err
	}
	document, err := db.ParseUUID(documentID)
	if err != nil {
		return false, err
	}
	count, err := dbgen.New(p.DB).CountProductLieutenantAssignments(ctx, dbgen.CountProductLieutenantAssignmentsParams{
		MemberID:      member,
		NpcDocumentID: document,
	})
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (p PoolPolicyProviders) Assess(_ context.Context, _ AudienceContext, refs []DocumentRef) (AudienceAssessment, error) {
	results := make([]AudienceResult, len(refs))
	for i, ref := range refs {
		results[i] = AudienceResult{SubjectID: ref.ID, Outcome: AudienceOrdinary}
	}
	return AudienceAssessment{Results: results}, nil
}

func (p PoolPolicyProviders) DiscordIdentity(ctx context.Context, memberID string) (DiscordIdentity, error) {
	id, err := db.ParseUUID(memberID)
	if err != nil {
		return DiscordIdentity{}, err
	}
	row, err := dbgen.New(p.DB).ProductMemberDiscordIdentity(ctx, id)
	if err != nil {
		return DiscordIdentity{}, err
	}
	return DiscordIdentity{MemberID: memberID, DiscordID: row.DiscordID}, nil
}

func (p PoolPolicyProviders) SummaryRelations(_ context.Context, questIDs []string, _ *string) (SummaryEvidence, error) {
	relations := make([]SummaryRelation, len(questIDs))
	for i, questID := range questIDs {
		relations[i] = SummaryRelation{QuestID: questID}
	}
	return SummaryEvidence{Relations: relations}, nil
}

func NewPoolPolicy(db dbgen.DBTX) (*Policy, error) {
	if missingPolicyDependency(db) {
		return nil, apierr.New(apierr.Internal, "policy database required")
	}
	providers := PoolPolicyProviders{DB: db}
	assignments, err := NewAssignments(providers, providers)
	if err != nil {
		return nil, err
	}
	return NewPolicy(PolicyProviders{
		Assignments:          assignments,
		Audience:             providers,
		Identities:           providers,
		SummaryRelationships: providers,
	})
}
