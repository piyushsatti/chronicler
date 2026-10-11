package document

import (
	"context"
	"log/slog"
)

// AuditSQLOverride consumes activation evidence evaluated atomically by the
// same SQL Specification as the listing/count. Never log query text, protected
// metadata, row counts, policy text or body bytes on this audit surface.
func AuditSQLOverride(ctx context.Context, scope ViewerScope, activated bool, surface, operation string) {
	if scope.Privileged() && activated {
		slog.InfoContext(ctx, "audience.admin_override", "member_id", scope.MemberID, "scope", "listing", "surface", surface, "operation", operation)
	}
}
