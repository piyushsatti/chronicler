package character

import "github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

type Status string

const (
	StatusPending Status = "pending"
	StatusActive  Status = "active"
	StatusRetired Status = "retired"
)

type Character struct {
	ID        string
	ShortCode string
	Name      string
	OwnerID   string
	Status    Status
	PCXP      int
}

var ErrNotFound = apierr.New(apierr.NotFound, "character not found")
