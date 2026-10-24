package document

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type documentAssignmentFacts struct {
	actorID string
	archons map[string]bool
}

func (f documentAssignmentFacts) HasArchon(_ context.Context, memberID, regionID string) (bool, error) {
	return memberID == f.actorID && f.archons[regionID], nil
}

type documentCapabilityFacts struct {
	regions []string
	questDM string
	questID string
}

type deferDocumentCapabilities struct{}

func documentViewPointers(views []DocumentView) []*DocumentView {
	out := make([]*DocumentView, len(views))
	for i := range views {
		out[i] = &views[i]
	}
	return out
}

func (p *ProductPostgres) setDocumentCapabilities(ctx context.Context, actor auth.Authority, views []*DocumentView) error {
	if ctx.Value(deferDocumentCapabilities{}) != nil || actor.Claims().MemberID == "" {
		return nil
	}
	ids := documentCapabilityIDs(views)
	facts, assignments, err := p.loadDocumentCapabilityFacts(ctx, actor.Claims().MemberID, ids)
	if err != nil {
		return err
	}
	providers := auth.PoolPolicyProviders{DB: p.DB}
	assignmentProviders, err := auth.NewAssignments(assignments, providers)
	if err != nil {
		return err
	}
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments: assignmentProviders, Audience: providers, Identities: providers, SummaryRelationships: providers,
	})
	if err != nil {
		return err
	}
	return applyDocumentCapabilities(ctx, policy, actor, views, facts)
}

func documentCapabilityIDs(views []*DocumentView) []pgtype.UUID {
	ids := make([]pgtype.UUID, 0, len(views))
	for _, view := range views {
		if view != nil && (view.Kind == "quest_brief" || view.Kind == "codex_entry" && view.Category != nil && *view.Category == "Locations") {
			ids = append(ids, mustProductUUID(view.Id))
		}
	}
	return ids
}

func (p *ProductPostgres) loadDocumentCapabilityFacts(ctx context.Context, actorID string, ids []pgtype.UUID) (map[string]documentCapabilityFacts, documentAssignmentFacts, error) {
	facts := make(map[string]documentCapabilityFacts, len(ids))
	assignments := documentAssignmentFacts{actorID: actorID, archons: map[string]bool{}}
	if len(ids) == 0 {
		return facts, assignments, nil
	}
	rows, err := p.queries().LoadProductDocumentWriteFacts(ctx, dbgen.LoadProductDocumentWriteFactsParams{
		DocumentIds: ids, ActorID: mustProductUUID(actorID),
	})
	if err != nil {
		return nil, documentAssignmentFacts{}, err
	}
	for _, row := range rows {
		id := db.UUIDString(row.DocumentID)
		fact := facts[id]
		if row.RegionID.Valid {
			regionID := db.UUIDString(row.RegionID)
			fact.regions = append(fact.regions, regionID)
			assignments.archons[regionID] = row.AssignedArchon
		}
		if row.QuestDmID.Valid {
			fact.questDM = db.UUIDString(row.QuestDmID)
		}
		if row.QuestID.Valid {
			fact.questID = db.UUIDString(row.QuestID)
		}
		facts[id] = fact
	}
	return facts, assignments, nil
}

func applyDocumentCapabilities(ctx context.Context, policy *auth.Policy, actor auth.Authority, views []*DocumentView, facts map[string]documentCapabilityFacts) error {
	var err error
	for _, view := range views {
		if view == nil {
			continue
		}
		view.CanEditBody = false
		view.CanEditMetadata = false
		view.LinkedRegionIDs = facts[view.Id].regions
		var request auth.Request
		if view.Kind == "quest_brief" {
			dmID := facts[view.Id].questDM
			if dmID == "" {
				continue
			}
			request, err = auth.ForQuest("Mutation.updateQuest", auth.QuestFacts{ID: facts[view.Id].questID, DMID: dmID})
		} else {
			if view.AuthorId == "" {
				continue
			}
			request, err = auth.ForDocumentWrite("Mutation.updateDocument", documentWriteFacts(view))
		}
		if err != nil {
			return err
		}
		decision, err := policy.Decide(ctx, actor, request)
		if err != nil {
			return err
		}
		view.CanEditMetadata = decision.Allowed
		view.CanEditBody = decision.Allowed && view.BodyComplete
	}
	return nil
}

func completeBodyForWrite(view DocumentView, rawBody string, actor auth.Authority) error {
	doc, scope, err := lockedDocumentProjection(view, rawBody, actor)
	if err != nil {
		return err
	}
	projection, err := doc.projectBody(scope)
	if err != nil || !projection.Complete {
		return apierr.New(apierr.Forbidden, "whole-body editing requires the complete document")
	}
	return nil
}

func admitDocumentDisclosure(view DocumentView, actor auth.Authority) error {
	doc, scope, err := lockedDocumentProjection(view, "", actor)
	if err != nil {
		return err
	}
	if !doc.Readable(scope) && !actor.IsPlatformOwner() {
		return apierr.New(apierr.NotFound, "document not found")
	}
	return nil
}

func lockedDocumentProjection(view DocumentView, rawBody string, actor auth.Authority) (Document, ViewerScope, error) {
	policy, err := json.Marshal(view.Policy)
	if err != nil {
		return Document{}, ViewerScope{}, err
	}
	if view.Policy == nil {
		policy = nil
	}
	scope := ScopeFromAuthority(actor)
	for _, readerID := range view.ReaderIDs {
		if readerID == scope.MemberID {
			scope.ReaderOf[view.Id] = struct{}{}
		}
	}
	doc := Document{ID: view.Id, Kind: view.Kind, AuthorID: view.AuthorId, Status: Status(view.Status), Visibility: Visibility(view.Visibility), Policy: policy, Body: rawBody}
	return doc, scope, nil
}

func admitDocumentBody(ctx context.Context, repo DocumentWriteRepository, actor auth.Authority, spec any) error {
	var view *DocumentView
	var rawBody string
	switch input := spec.(type) {
	case UpdateDocumentSpec:
		if !input.Input.Body.Set {
			return nil
		}
		state, err := repo.LockUpdateDocument(ctx, input)
		if err != nil {
			return err
		}
		view, rawBody = state.Before, state.RawBody
	case EditPublishedDocumentSpec:
		if !input.Input.Body.Set {
			return nil
		}
		state, err := repo.LockEditPublishedDocument(ctx, input)
		if err != nil {
			return err
		}
		view, rawBody = state.Before, state.RawBody
	default:
		return nil
	}
	if view == nil {
		return apierr.New(apierr.NotFound, "document not found")
	}
	return completeBodyForWrite(*view, rawBody, actor)
}
