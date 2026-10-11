package notification

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"net/http"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

const maxMarkReadBodyBytes = 8192

// CommandRoutes registers commands even when persistence is unavailable, so
// missing dependencies fail closed instead of becoming a misleading success.
func CommandRoutes(mux httpserver.Router, c Commands) {
	mux.Handle("POST /v1/me/notifications/read", auth.Require(auth.Authenticated, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authority, ok := auth.AuthorityFromContext(r.Context())
		if !ok {
			apierr.Write(w, r, errAuthorityUnavailable)
			return
		}
		ids, err := decodeMarkRead(r)
		if err != nil {
			apierr.Write(w, r, err)
			return
		}
		if err := c.MarkRead(r.Context(), authority.Claims().MemberID, ids); err != nil {
			apierr.Write(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})))
}

func decodeMarkRead(r *http.Request) ([]string, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" || r.Body == nil {
		return nil, errInvalidReadRequest
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxMarkReadBodyBytes+1))
	if err != nil || len(body) > maxMarkReadBodyBytes {
		return nil, errInvalidReadRequest
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	// Token-level shape validation rejects duplicate keys, nulls, unknown
	// properties and trailing values that ordinary struct decoding can accept.
	token, err := dec.Token()
	if err != nil || token != json.Delim('{') {
		return nil, errInvalidReadRequest
	}
	token, err = dec.Token()
	if err != nil || token != "ids" {
		return nil, errInvalidReadRequest
	}
	token, err = dec.Token()
	if err != nil || token != json.Delim('[') {
		return nil, errInvalidReadRequest
	}
	ids := make([]string, 0)
	for dec.More() {
		if len(ids) == maxMarkReadIDs {
			return nil, errInvalidReadRequest
		}
		var id string
		if err := dec.Decode(&id); err != nil {
			return nil, errInvalidReadRequest
		}
		ids = append(ids, id)
	}
	token, err = dec.Token()
	if err != nil || token != json.Delim(']') || dec.More() {
		return nil, errInvalidReadRequest
	}
	token, err = dec.Token()
	if err != nil || token != json.Delim('}') {
		return nil, errInvalidReadRequest
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errInvalidReadRequest
	}
	return normalizeReadIDs(ids)
}
