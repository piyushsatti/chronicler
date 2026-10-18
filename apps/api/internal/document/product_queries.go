package document

import (
	"context"
	"reflect"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ProductQueries struct {
	Reads         ProductReadRepos
	Policy        *auth.Policy
	Clock         product.Clock
	OverrideReads auth.OverrideReadObserver
}

func NewProductQueries(reads ProductReadRepos, policy *auth.Policy, clock product.Clock, overrideReads auth.OverrideReadObserver) (*ProductQueries, error) {
	for _, dep := range []any{reads.Document, reads.Batch, policy, clock, overrideReads} {
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "document query dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "document query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func (s ProductQueries) authorizeRead(ctx context.Context, actor auth.Authority, request auth.Request, subject string) (func(), error) {
	decision, err := s.Policy.Decide(ctx, actor, request)
	if err != nil {
		return nil, err
	}
	if !decision.Allowed {
		return nil, apierr.New(apierr.Forbidden, "document read forbidden")
	}
	if !decision.UsedOverride {
		return func() {}, nil
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return nil, err
	}
	fact := auth.OverrideFact{ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "document", SubjectID: subject, RuleCode: decision.RuleCode, At: at}
	return func() { s.OverrideReads.Observe(ctx, fact) }, nil
}

func (s ProductQueries) publicRead(ctx context.Context, actor auth.Authority, op auth.Operation, subject string) (func(), error) {
	request, err := auth.ForOperation(op)
	if err != nil {
		return nil, err
	}
	return s.authorizeRead(ctx, actor, request, subject)
}

func (s ProductQueries) documentPage(limit, offset int32) error {
	if limit <= 0 || offset < 0 {
		return apierr.New(apierr.Invalid, "invalid document page")
	}
	return nil
}

func (s ProductQueries) BatchDocuments(ctx context.Context, actor auth.Authority, keys []DocumentKey) ([]product.BatchResult[DocumentView], error) {
	return s.Reads.Batch.ReadBatchDocuments(ctx, actor, keys)
}

func (s ProductQueries) BatchDmTables(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[DocumentView], error) {
	return s.Reads.Batch.ReadBatchDmTables(ctx, actor, keys)
}

func (s ProductQueries) BatchSummaryDerived(ctx context.Context, actor auth.Authority, keys []IDKey) ([]product.BatchResult[SummaryDerivedView], error) {
	return s.Reads.Batch.ReadBatchSummaryDerived(ctx, actor, keys)
}

func (s ProductQueries) BatchDocumentSubjects(ctx context.Context, actor auth.Authority, keys []DocumentSubjectsKey) ([]product.BatchResult[SubjectLinkList], error) {
	return s.Reads.Batch.ReadBatchDocumentSubjects(ctx, actor, keys)
}

func (s ProductQueries) Document(ctx context.Context, actor auth.Authority, spec DocumentSpec) (*DocumentView, error) {
	observe, err := s.publicRead(ctx, actor, "Query.document", spec.Slug)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Document.ReadDocument(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DocumentById(ctx context.Context, actor auth.Authority, spec DocumentByIdSpec) (*DocumentView, error) {
	observe, err := s.publicRead(ctx, actor, "Query.documentById", spec.Id)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Document.ReadDocumentById(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) Documents(ctx context.Context, actor auth.Authority, spec DocumentsSpec) (DocumentListResult, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return DocumentListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.documents", "")
	if err != nil {
		return DocumentListResult{}, err
	}
	value, err := s.Reads.Document.ReadDocuments(ctx, actor, spec)
	if err != nil {
		return DocumentListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DocumentBacklinks(ctx context.Context, actor auth.Authority, spec DocumentBacklinksSpec) ([]DocumentLinkView, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return nil, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.documentBacklinks", spec.Slug)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Document.ReadDocumentBacklinks(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DocumentRevisions(ctx context.Context, actor auth.Authority, spec DocumentRevisionsSpec) (DocumentRevisionPage, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return DocumentRevisionPage{}, err
	}
	parent, err := s.Reads.Document.ReadDocumentById(ctx, actor, DocumentByIdSpec{Id: spec.DocumentId})
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	request, err := auth.ForDocumentWrite("Query.documentRevisions", auth.DocumentWriteFacts{
		ID: parent.Id, AuthorID: parent.AuthorId, Kind: parent.Kind, Category: parent.Category,
	})
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	observe, err := s.authorizeRead(ctx, actor, request, spec.DocumentId)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	value, err := s.Reads.Document.ReadDocumentRevisions(ctx, actor, spec)
	if err != nil {
		return DocumentRevisionPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) DocumentsTrash(ctx context.Context, actor auth.Authority, spec DocumentsTrashSpec) (DocumentListResult, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return DocumentListResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.documentsTrash", "")
	if err != nil {
		return DocumentListResult{}, err
	}
	value, err := s.Reads.Document.ReadDocumentsTrash(ctx, actor, spec)
	if err != nil {
		return DocumentListResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) PreviewBody(ctx context.Context, actor auth.Authority, spec PreviewBodySpec) (string, error) {
	var authorID *string
	if spec.AuthorId != nil {
		authorID = spec.AuthorId
	}
	request, err := auth.ForPreview(auth.PreviewFacts{
		Audience: auth.PreviewAudience(spec.Audience),
		AuthorID: authorID,
	})
	if err != nil {
		return "", err
	}
	observe, err := s.authorizeRead(ctx, actor, request, "")
	if err != nil {
		return "", err
	}
	value, err := s.Reads.Document.ReadPreviewBody(ctx, actor, spec)
	if err != nil {
		return "", err
	}
	observe()
	return value, nil
}

func (s ProductQueries) LieutenantAssignments(ctx context.Context, actor auth.Authority, spec LieutenantAssignmentsSpec) (LieutenantPage, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return LieutenantPage{}, err
	}
	facts := auth.LieutenantReadFacts{MemberFilter: spec.MemberId}
	if spec.NpcDocumentId != nil {
		doc, err := s.Reads.Document.ReadDocumentById(ctx, actor, DocumentByIdSpec{Id: *spec.NpcDocumentId})
		if err != nil {
			return LieutenantPage{}, err
		}
		facts.Documents = []auth.DocumentWriteFacts{{
			ID: doc.Id, AuthorID: doc.AuthorId, Kind: doc.Kind, Category: doc.Category,
		}}
	}
	request, err := auth.ForLieutenantAssignments(facts)
	if err != nil {
		return LieutenantPage{}, err
	}
	observe, err := s.authorizeRead(ctx, actor, request, "")
	if err != nil {
		return LieutenantPage{}, err
	}
	value, err := s.Reads.Document.ReadLieutenantAssignments(ctx, actor, spec)
	if err != nil {
		return LieutenantPage{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CodexCategories(ctx context.Context, actor auth.Authority, spec CodexCategoriesSpec) ([]CategoryCountView, error) {
	observe, err := s.publicRead(ctx, actor, "Query.codexCategories", "")
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Document.ReadCodexCategories(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CodexDirectory(ctx context.Context, actor auth.Authority, spec CodexDirectorySpec) (CodexDirectoryResult, error) {
	if err := s.documentPage(spec.Limit, spec.Offset); err != nil {
		return CodexDirectoryResult{}, err
	}
	observe, err := s.publicRead(ctx, actor, "Query.codexDirectory", "")
	if err != nil {
		return CodexDirectoryResult{}, err
	}
	value, err := s.Reads.Document.ReadCodexDirectory(ctx, actor, spec)
	if err != nil {
		return CodexDirectoryResult{}, err
	}
	observe()
	return value, nil
}

func (s ProductQueries) CodexEntry(ctx context.Context, actor auth.Authority, spec CodexEntrySpec) (*CodexEntryCardView, error) {
	observe, err := s.publicRead(ctx, actor, "Query.codexEntry", spec.Slug)
	if err != nil {
		return nil, err
	}
	value, err := s.Reads.Document.ReadCodexEntry(ctx, actor, spec)
	if err != nil {
		return nil, err
	}
	observe()
	return value, nil
}
