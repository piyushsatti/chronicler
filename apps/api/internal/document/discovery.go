package document

import (
	"context"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// DiscoveryReader is the Document-owned read surface Site uses for home feed,
// document search hits, and published-document counts. Site never queries
// protected document text itself.
type DiscoveryReader interface {
	SearchDiscovery(ctx context.Context, actor auth.Authority, query string, kinds []string, page product.Page) (DiscoveryPage, error)
	RecentDiscovery(ctx context.Context, actor auth.Authority) ([]DiscoveryBucket, error)
	CountDiscovery(ctx context.Context, actor auth.Authority) (DiscoveryCounts, error)
}

type DiscoveryBucket struct {
	Category  *string
	Documents []DocumentView
}

type DiscoveryCount struct {
	Key   string
	Count int32
}

type DiscoveryCounts struct {
	ByKind     []DiscoveryCount
	ByCategory []DiscoveryCount
}

type DiscoveryPage struct {
	Items []DocumentSearchHitView
	Total int32
	Order string
}

const (
	discoverySearchOrder          = "rank_desc_updated_at_desc_id_desc"
	recentDiscoveryBucketLimit    = 6
	recentDiscoveryDocsPerBucket  = 5
	discoverySnippetMaxCodepoints = 240
)
