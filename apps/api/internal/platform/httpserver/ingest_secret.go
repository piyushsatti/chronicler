package httpserver

import (
	"crypto/subtle"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

// AuthorizeIngestSecret admits a machine caller whose X-Ingest-Secret header
// matches the configured secret; an unset secret disables the routes.
func AuthorizeIngestSecret(r *http.Request, secret string) error {
	if secret == "" {
		return apierr.New(apierr.Forbidden, "ingest not configured")
	}
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Ingest-Secret")), []byte(secret)) != 1 {
		return apierr.New(apierr.Unauthenticated, "invalid ingest secret")
	}
	return nil
}
