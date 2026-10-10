package document

import "github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

type Status string

const (
	StatusDraft     Status = "draft"
	StatusPublished Status = "published"
)

type Document struct {
	ID         string
	Kind       string
	Slug       string
	Title      string
	Status     Status
	Visibility Visibility
	AuthorID   string
	Body       string
}

var (
	ErrNotFound  = apierr.New(apierr.NotFound, "document not found")
	ErrForbidden = apierr.New(apierr.Forbidden, "document not readable")
)

// EffectiveBody returns the body if scope allows, otherwise ErrNotFound (no existence oracle).
func (d Document) EffectiveBody(scope ViewerScope) (string, error) {
	if d.Status != StatusPublished && d.AuthorID != scope.MemberID && !scope.IsAdmin {
		return "", ErrNotFound
	}
	if d.Status == StatusPublished && !scope.Allows(d.Visibility, d.AuthorID, nil) {
		return "", ErrNotFound
	}
	return d.Body, nil
}
