package spatial

import (
	"context"
	"fmt"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

type ProductPostgres struct {
	DB dbgen.DBTX
}

func NewProductPostgres(db dbgen.DBTX) (*ProductPostgres, error) {
	if db == nil || (reflect.ValueOf(db).Kind() == reflect.Pointer && reflect.ValueOf(db).IsNil()) {
		return nil, fmt.Errorf("spatial database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "spatial product surface pending")
}

func (p *ProductPostgres) AdmitLocationLink(context.Context, auth.Authority, string, string) (document.LocationAdmission, error) {
	return document.LocationAdmission{}, p.pending()
}
