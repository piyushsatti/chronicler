package spatial

import (
	"context"
	"fmt"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
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

func emptyBatch[T any](n int) []product.BatchResult[T] {
	return make([]product.BatchResult[T], n)
}

func (p *ProductPostgres) ReadHex(context.Context, auth.Authority, HexSpec) (*HexView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadHexHistory(context.Context, auth.Authority, HexHistorySpec) (HexChangePage, error) {
	return HexChangePage{}, p.pending()
}
func (p *ProductPostgres) ReadPoisForHex(context.Context, auth.Authority, PoisForHexSpec) (PoiPage, error) {
	return PoiPage{}, p.pending()
}
func (p *ProductPostgres) ReadRecentHexChanges(context.Context, auth.Authority, RecentHexChangesSpec) (HexChangePage, error) {
	return HexChangePage{}, p.pending()
}

func (p *ProductPostgres) ReadBatchMapHexes(_ context.Context, _ auth.Authority, keys []MapHexesKey) ([]product.BatchResult[HexList], error) {
	return emptyBatch[HexList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchMapEdges(_ context.Context, _ auth.Authority, keys []MapEdgesKey) ([]product.BatchResult[EdgeList], error) {
	return emptyBatch[EdgeList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchHexLinks(_ context.Context, _ auth.Authority, keys []HexLinksKey) ([]product.BatchResult[HexLinkList], error) {
	return emptyBatch[HexLinkList](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchPOIs(_ context.Context, _ auth.Authority, keys []POIsKey) ([]product.BatchResult[PoiList], error) {
	return emptyBatch[PoiList](len(keys)), nil
}

func (p *ProductPostgres) LockLinkHexEntry(context.Context, LinkHexEntrySpec) (LinkHexEntryState, error) {
	return LinkHexEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreLinkHexEntry(context.Context, LinkHexEntryWrite) (HexEntryLinkView, error) {
	return HexEntryLinkView{}, p.pending()
}
func (p *ProductPostgres) LockSetHexEdge(context.Context, SetHexEdgeSpec) (SetHexEdgeState, error) {
	return SetHexEdgeState{}, p.pending()
}
func (p *ProductPostgres) StoreSetHexEdge(context.Context, SetHexEdgeWrite) (HexEdgeView, error) {
	return HexEdgeView{}, p.pending()
}
func (p *ProductPostgres) LockUnlinkHexEntry(context.Context, UnlinkHexEntrySpec) (UnlinkHexEntryState, error) {
	return UnlinkHexEntryState{}, p.pending()
}
func (p *ProductPostgres) StoreUnlinkHexEntry(context.Context, UnlinkHexEntryWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockUpdateHex(context.Context, UpdateHexSpec) (UpdateHexState, error) {
	return UpdateHexState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateHex(context.Context, UpdateHexWrite) (HexView, error) {
	return HexView{}, p.pending()
}
func (p *ProductPostgres) LockUpsertPoi(context.Context, UpsertPoiSpec) (UpsertPoiState, error) {
	return UpsertPoiState{}, p.pending()
}
func (p *ProductPostgres) StoreUpsertPoi(context.Context, UpsertPoiWrite) (PoiView, error) {
	return PoiView{}, p.pending()
}

func (p *ProductPostgres) ResolveQuestHexIDs(context.Context, auth.Authority, []QuestHexCandidate) ([]HexAdmission, error) {
	return nil, p.pending()
}

func (p *ProductPostgres) AdmitLocationLink(context.Context, auth.Authority, string, string) (document.LocationAdmission, error) {
	return document.LocationAdmission{}, p.pending()
}
