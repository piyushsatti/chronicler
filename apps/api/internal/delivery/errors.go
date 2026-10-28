package delivery

import (
	"errors"
	"fmt"
	"net/http"
)

// ErrBadPayload marks a discord job body that is not QuestDiscordPayload.
var ErrBadPayload = errors.New("invalid quest discord job payload")

// ErrDiscordForbidden marks a Discord 403: the bot lacks a permission or
// channel access. Retrying cannot fix it, so the job is parked for repair.
var ErrDiscordForbidden = errors.New("discord forbidden")

// SafeCodeDiscordPermission is the safe error code stored on a delivery job
// parked for a Discord 403. The web maps it to an operator sentence.
const SafeCodeDiscordPermission = "DISCORD_PERMISSION"

// DiscordAPIError is a non-2xx Discord REST response. Its text is the
// "discord api status N[: body]" form the web matches on.
type DiscordAPIError struct {
	Status  int
	Snippet string
}

func (e *DiscordAPIError) Error() string {
	if e.Snippet == "" {
		return fmt.Sprintf("discord api status %d", e.Status)
	}
	return fmt.Sprintf("discord api status %d: %s", e.Status, e.Snippet)
}

// Is reports a 403 as ErrDiscordForbidden.
func (e *DiscordAPIError) Is(target error) bool {
	return target == ErrDiscordForbidden && e.Status == http.StatusForbidden
}
