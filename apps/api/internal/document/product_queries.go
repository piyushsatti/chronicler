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
