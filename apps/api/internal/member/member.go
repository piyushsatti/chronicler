package member

import "github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

type Status string

const (
	StatusActive  Status = "active"
	StatusRetired Status = "retired"
)

type Member struct {
	ID          string
	DiscordID   string
	Handle      string
	DisplayName string
	Roles       []string
	Status      Status
}

var ErrNotFound = apierr.New(apierr.NotFound, "member not found")
