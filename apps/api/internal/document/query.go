package document

import (
	"context"
	"log/slog"
)

// Queries retains the mounted revision and trash protocols.
type Queries struct {
	Repo      ReadRepository
	Revisions func(ctx context.Context, documentID string, limit, offset int) ([]Revision, error)
	Trash     func(ctx context.Context, limit, offset int) ([]TrashItem, error)
}

// projectDocument is the sole returned-body boundary for direct, enumerated and
// batch reads. Repository bodies stay raw; returned values are request-scoped.
func projectDocument(ctx context.Context, d Document, scope ViewerScope) (Document, error) {
	projection, err := d.projectBody(scope)
	if err != nil {
		return Document{}, err
	}
	if projection.Overridden {
		ordinary := scope
		ordinary.IsAdmin = false
		auditScope := "block"
		if !d.Readable(ordinary) {
			auditScope = "document"
		}
		slog.InfoContext(ctx, "audience.admin_override", "document_id", d.ID, "member_id", scope.MemberID, "scope", auditScope)
	}
	d.Body = projection.Body
	d.BodyComplete = projection.Complete
	return d, nil
}
