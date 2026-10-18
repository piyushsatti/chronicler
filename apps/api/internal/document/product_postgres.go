package document

import (
	"context"
	"fmt"
	"reflect"

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
		return nil, fmt.Errorf("document database executor required")
	}
	return &ProductPostgres{DB: db}, nil
}

func (p *ProductPostgres) pending() error {
	return apierr.New(apierr.Internal, "document product surface pending")
}

func (p *ProductPostgres) ReadCodexCategories(context.Context, auth.Authority, CodexCategoriesSpec) ([]CategoryCountView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadCodexDirectory(context.Context, auth.Authority, CodexDirectorySpec) (CodexDirectoryResult, error) {
	return CodexDirectoryResult{}, p.pending()
}
func (p *ProductPostgres) ReadCodexEntry(context.Context, auth.Authority, CodexEntrySpec) (*CodexEntryCardView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadDocument(context.Context, auth.Authority, DocumentSpec) (*DocumentView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadDocumentBacklinks(context.Context, auth.Authority, DocumentBacklinksSpec) ([]DocumentLinkView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadDocumentById(context.Context, auth.Authority, DocumentByIdSpec) (*DocumentView, error) {
	return nil, p.pending()
}
func (p *ProductPostgres) ReadDocumentRevisions(context.Context, auth.Authority, DocumentRevisionsSpec) (DocumentRevisionPage, error) {
	return DocumentRevisionPage{}, p.pending()
}
func (p *ProductPostgres) ReadDocuments(context.Context, auth.Authority, DocumentsSpec) (DocumentListResult, error) {
	return DocumentListResult{}, p.pending()
}
func (p *ProductPostgres) ReadDocumentsTrash(context.Context, auth.Authority, DocumentsTrashSpec) (DocumentListResult, error) {
	return DocumentListResult{}, p.pending()
}
func (p *ProductPostgres) ReadLieutenantAssignments(context.Context, auth.Authority, LieutenantAssignmentsSpec) (LieutenantPage, error) {
	return LieutenantPage{}, p.pending()
}
func (p *ProductPostgres) ReadPreviewBody(context.Context, auth.Authority, PreviewBodySpec) (string, error) {
	return "", p.pending()
}

func (p *ProductPostgres) ReadableDocumentIDs(_ context.Context, _ auth.Authority, ids []string) (map[string]bool, error) {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = false
	}
	return out, nil
}

func emptyBatchResults[T any](keys int) []product.BatchResult[T] {
	out := make([]product.BatchResult[T], keys)
	return out
}

func (p *ProductPostgres) ReadBatchDocuments(_ context.Context, _ auth.Authority, keys []DocumentKey) ([]product.BatchResult[DocumentView], error) {
	return emptyBatchResults[DocumentView](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchDmTables(_ context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[DocumentView], error) {
	return emptyBatchResults[DocumentView](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchSummaryDerived(_ context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[SummaryDerivedView], error) {
	return emptyBatchResults[SummaryDerivedView](len(keys)), nil
}
func (p *ProductPostgres) ReadBatchDocumentSubjects(_ context.Context, _ auth.Authority, keys []DocumentSubjectsKey) ([]product.BatchResult[SubjectLinkList], error) {
	return emptyBatchResults[SubjectLinkList](len(keys)), nil
}

func (p *ProductPostgres) LockAssignLieutenant(context.Context, AssignLieutenantSpec) (AssignLieutenantState, error) {
	return AssignLieutenantState{}, p.pending()
}
func (p *ProductPostgres) StoreAssignLieutenant(context.Context, AssignLieutenantWrite) (LieutenantAssignmentView, error) {
	return LieutenantAssignmentView{}, p.pending()
}
func (p *ProductPostgres) LockCreateDocument(context.Context, CreateDocumentSpec) (CreateDocumentState, error) {
	return CreateDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreCreateDocument(context.Context, CreateDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockDeleteDocument(context.Context, DeleteDocumentSpec) (DeleteDocumentState, error) {
	return DeleteDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreDeleteDocument(context.Context, DeleteDocumentWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockEditPublishedDocument(context.Context, EditPublishedDocumentSpec) (EditPublishedDocumentState, error) {
	return EditPublishedDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreEditPublishedDocument(context.Context, EditPublishedDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockPublishDocument(context.Context, PublishDocumentSpec) (PublishDocumentState, error) {
	return PublishDocumentState{}, p.pending()
}
func (p *ProductPostgres) StorePublishDocument(context.Context, PublishDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockRestoreDocument(context.Context, RestoreDocumentSpec) (RestoreDocumentState, error) {
	return RestoreDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreRestoreDocument(context.Context, RestoreDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockRevokeLieutenant(context.Context, RevokeLieutenantSpec) (RevokeLieutenantState, error) {
	return RevokeLieutenantState{}, p.pending()
}
func (p *ProductPostgres) StoreRevokeLieutenant(context.Context, RevokeLieutenantWrite) (product.CommandReceipt, error) {
	return product.CommandReceipt{}, p.pending()
}
func (p *ProductPostgres) LockSetDocumentVisibility(context.Context, SetDocumentVisibilitySpec) (SetDocumentVisibilityState, error) {
	return SetDocumentVisibilityState{}, p.pending()
}
func (p *ProductPostgres) StoreSetDocumentVisibility(context.Context, SetDocumentVisibilityWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockUnpublishDocument(context.Context, UnpublishDocumentSpec) (UnpublishDocumentState, error) {
	return UnpublishDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreUnpublishDocument(context.Context, UnpublishDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) LockUpdateDocument(context.Context, UpdateDocumentSpec) (UpdateDocumentState, error) {
	return UpdateDocumentState{}, p.pending()
}
func (p *ProductPostgres) StoreUpdateDocument(context.Context, UpdateDocumentWrite) (DocumentView, error) {
	return DocumentView{}, p.pending()
}
func (p *ProductPostgres) StoreSummary(context.Context, auth.Authority, SummaryWrite) (WriteResult, error) {
	return WriteResult{}, p.pending()
}
func (p *ProductPostgres) FindAvailableSlug(context.Context, string) (string, error) {
	return "", p.pending()
}

func (p *ProductPostgres) AdmitLocationLink(_ context.Context, _ auth.Authority, documentID, targetRegionID string) (LocationAdmission, error) {
	return LocationAdmission{DocumentID: documentID, TargetRegionID: targetRegionID}, p.pending()
}

func (p *ProductPostgres) ResolveMentionHandles(context.Context, []string) (map[string]string, error) {
	return map[string]string{}, p.pending()
}
