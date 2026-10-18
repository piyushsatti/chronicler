package spatial

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
	for _, dep := range []any{reads.Map, reads.Batch, policy, clock, overrideReads} {
		if dep == nil {
			return nil, apierr.New(apierr.Internal, "spatial query dependencies required")
		}
		v := reflect.ValueOf(dep)
		switch v.Kind() {
		case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
			if v.IsNil() {
				return nil, apierr.New(apierr.Internal, "spatial query dependencies required")
			}
		}
	}
	return &ProductQueries{Reads: reads, Policy: policy, Clock: clock, OverrideReads: overrideReads}, nil
}

func (s ProductQueries) BatchMapHexes(ctx context.Context, actor auth.Authority, keys []MapHexesKey) ([]product.BatchResult[HexList], error) {
	return s.Reads.Batch.ReadBatchMapHexes(ctx, actor, keys)
}

func (s ProductQueries) BatchMapEdges(ctx context.Context, actor auth.Authority, keys []MapEdgesKey) ([]product.BatchResult[EdgeList], error) {
	return s.Reads.Batch.ReadBatchMapEdges(ctx, actor, keys)
}

func (s ProductQueries) BatchMapNodes(ctx context.Context, actor auth.Authority, keys []MapNodesKey) ([]product.BatchResult[NodeList], error) {
	return s.Reads.Batch.ReadBatchMapNodes(ctx, actor, keys)
}

func (s ProductQueries) BatchMapNodeEdges(ctx context.Context, actor auth.Authority, keys []MapNodeEdgesKey) ([]product.BatchResult[NodeEdgeList], error) {
	return s.Reads.Batch.ReadBatchMapNodeEdges(ctx, actor, keys)
}

func (s ProductQueries) BatchHexLinks(ctx context.Context, actor auth.Authority, keys []HexLinksKey) ([]product.BatchResult[HexLinkList], error) {
	return s.Reads.Batch.ReadBatchHexLinks(ctx, actor, keys)
}

func (s ProductQueries) BatchNodeLinks(ctx context.Context, actor auth.Authority, keys []NodeLinksKey) ([]product.BatchResult[NodeLinkList], error) {
	return s.Reads.Batch.ReadBatchNodeLinks(ctx, actor, keys)
}

func (s ProductQueries) BatchPOIs(ctx context.Context, actor auth.Authority, keys []POIsKey) ([]product.BatchResult[PoiList], error) {
	return s.Reads.Batch.ReadBatchPOIs(ctx, actor, keys)
}
