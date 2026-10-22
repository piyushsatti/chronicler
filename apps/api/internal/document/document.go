package document

import (
	"encoding/json"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusPublished Status = "published"
)

type Document struct {
	ID           string
	Kind         string
	Slug         string
	Title        string
	Status       Status
	Visibility   Visibility
	AuthorID     string
	Body         string          // raw inside repositories; scoped bytes on every Queries result
	Policy       json.RawMessage // nil and JSON null compile legacy visibility
	BodyComplete bool            `json:"-"`
}

var (
	ErrNotFound  = apierr.New(apierr.NotFound, "document not found")
	ErrForbidden = apierr.New(apierr.Forbidden, "document not readable")
)

// Readable applies only the outer document gate. Queries always project Body
// through EffectiveBody before returning it to a consumer.
func (d Document) Readable(scope ViewerScope) bool { return Specify(d).Allows(scope) }
