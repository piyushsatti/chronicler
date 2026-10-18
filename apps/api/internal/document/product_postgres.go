package document

import (
	"context"
	"fmt"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
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

func (p *ProductPostgres) StoreSummary(context.Context, auth.Authority, SummaryWrite) (WriteResult, error) {
	return WriteResult{}, p.pending()
}

func (p *ProductPostgres) AdmitLocationLink(_ context.Context, _ auth.Authority, documentID, targetRegionID string) (LocationAdmission, error) {
	return LocationAdmission{DocumentID: documentID, TargetRegionID: targetRegionID}, p.pending()
}

func (p *ProductPostgres) loadDocumentView(ctx context.Context, id string) (DocumentView, error) {
	docID, err := productDocumentID(id)
	if err != nil {
		return DocumentView{}, err
	}
	row, err := p.queries().GetProductDocumentByID(ctx, dbgen.GetProductDocumentByIDParams{DocumentID: docID})
	if err != nil {
		return DocumentView{}, mapNotFound(err)
	}
	scope := ViewerScope{MemberID: db.UUIDString(row.AuthorID), Roles: []auth.Role{auth.Admin}, IsAdmin: true}
	return mapGetProductDocumentRow(row, scope, ctx)
}
