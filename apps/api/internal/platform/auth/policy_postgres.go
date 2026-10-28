package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
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

func (p PoolPolicyProviders) SummaryRelations(ctx context.Context, questIDs []string, characterID *string) (SummaryEvidence, error) {
	ids := make([]pgtype.UUID, len(questIDs))
	for i, questID := range questIDs {
		id, err := db.ParseUUID(questID)
		if err != nil {
			return SummaryEvidence{}, err
		}
		ids[i] = id
	}
	var character pgtype.UUID
	if characterID != nil {
		var err error
		character, err = db.ParseUUID(*characterID)
		if err != nil {
			return SummaryEvidence{}, err
		}
	}
	rows, err := dbgen.New(p.DB).ProductQuestSummaryRelations(ctx, dbgen.ProductQuestSummaryRelationsParams{QuestIds: ids, CharacterID: character})
	if err != nil {
		return SummaryEvidence{}, err
	}
	evidence := SummaryEvidence{Relations: make([]SummaryRelation, 0, len(rows))}
	for _, row := range rows {
		if !row.QuestDmID.Valid {
			return SummaryEvidence{}, apierr.New(apierr.NotFound, "quest not found")
		}
		relation := SummaryRelation{QuestID: db.UUIDString(row.QuestID), QuestDMID: db.UUIDString(row.QuestDmID)}
		if row.ParticipantOwnerID.Valid && row.ParticipantStatus.Valid {
			owner, status := db.UUIDString(row.ParticipantOwnerID), row.ParticipantStatus.String
			relation.ParticipantOwnerID, relation.ParticipantStatus = &owner, &status
		}
		if characterID != nil {
			if !row.CharacterID.Valid || !row.CharacterOwnerID.Valid {
				return SummaryEvidence{}, apierr.New(apierr.NotFound, "character not found")
			}
			evidence.Character = &CharacterFacts{ID: db.UUIDString(row.CharacterID), OwnerID: db.UUIDString(row.CharacterOwnerID)}
		}
		evidence.Relations = append(evidence.Relations, relation)
	}
	return evidence, nil
}

func NewPoolPolicy(db dbgen.DBTX) (*Policy, error) {
	if product.MissingDependency(db) {
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
