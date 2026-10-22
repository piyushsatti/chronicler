package document

import (
	"context"
	"fmt"
	"reflect"
	"slices"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("document database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "document product surface pending")
}

func (p *ProductPostgres) AdmitLocationLink(ctx context.Context, actor auth.Authority, documentID, targetRegionID string) (LocationAdmission, error) {
	admission := LocationAdmission{DocumentID: documentID, TargetRegionID: targetRegionID}
	if _, err := productDocumentID(targetRegionID); err != nil {
		return LocationAdmission{}, err
	}
	row, err := p.lockByID(ctx, documentID)
	if err != nil {
		return LocationAdmission{}, err
	}
	view, _, _, err := p.commandStateFromLock(ctx, row)
	if err != nil {
		return LocationAdmission{}, err
	}
	if err := admitDocumentDisclosure(view, actor); err != nil {
		return LocationAdmission{}, err
	}
	if view.DeletedAt != nil || view.Kind != "codex_entry" || view.Category == nil || *view.Category != "Locations" {
		return LocationAdmission{}, apierr.New(apierr.Invalid, "location entry required")
	}
	admission.LinkedRegionIDs = view.LinkedRegionIDs
	regions := append([]string{}, view.LinkedRegionIDs...)
	if !slices.Contains(regions, targetRegionID) {
		regions = append(regions, targetRegionID)
	}
	policy, err := auth.NewPoolPolicy(p.DB)
	if err != nil {
		return LocationAdmission{}, err
	}
	facts := documentWriteFacts(&view)
	facts.LinkedRegionIDs = regions
	request, err := auth.ForDocumentWrite("Mutation.updateDocument", facts)
	if err != nil {
		return LocationAdmission{}, err
	}
	decision, err := policy.Decide(ctx, actor, request)
	if err != nil {
		return LocationAdmission{}, err
	}
	if !decision.Allowed {
		return LocationAdmission{}, apierr.New(apierr.Forbidden, "location stewardship required")
	}
	admission.UsedOverride = decision.UsedOverride
	for _, regionID := range view.LinkedRegionIDs {
		if regionID != targetRegionID {
			if !actor.Claims().Has(auth.Admin) && !actor.IsPlatformOwner() {
				return LocationAdmission{}, apierr.New(apierr.Forbidden, "location belongs to another region")
			}
			admission.UsedOverride = true
		}
	}
	return admission, nil
}

func (p *ProductPostgres) loadDocumentView(ctx context.Context, id, actorID string) (DocumentView, error) {
	actor, ok := auth.AuthorityFromContext(ctx)
	if !ok || actor.Claims().MemberID != actorID {
		row, err := p.queries().GetMemberAuthority(ctx, mustProductUUID(actorID))
		if err != nil {
			return DocumentView{}, err
		}
		roles := make([]auth.Role, len(row.Roles))
		for i, role := range row.Roles {
			roles[i] = auth.Role(role)
		}
		actor, err = auth.NewAuthorityWithHandle(actorID, roles, row.Status, row.DmStatus, row.Handle)
		if err != nil {
			return DocumentView{}, err
		}
	}
	row, err := p.lockByID(ctx, id)
	if err != nil {
		return DocumentView{}, mapNotFound(err)
	}
	view, err := mapLockRow(row)
	if err != nil {
		return DocumentView{}, err
	}
	scope, err := p.viewerScope(ctx, actor)
	if err != nil {
		return DocumentView{}, err
	}
	projected, err := projectDocumentView(ctx, scope, view, row.Body)
	if err != nil {
		return DocumentView{}, err
	}
	view = projected
	err = p.setDocumentCapabilities(ctx, actor, []*DocumentView{&view})
	return view, err
}

func (p *ProductPostgres) ReadCommandDocument(ctx context.Context, actor auth.Authority, documentID string) (DocumentView, error) {
	return p.loadDocumentView(auth.WithAuthority(ctx, actor), documentID, actor.Claims().MemberID)
}
