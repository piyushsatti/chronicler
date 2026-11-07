package delivery

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// ErrBadPayload marks a discord job body that is not QuestDiscordPayload.
var ErrBadPayload = errors.New("invalid quest discord job payload")

// ErrDiscordForbidden marks a Discord 403: the bot lacks a permission or
// channel access. Retrying cannot fix it, so the job is parked for repair.
var ErrDiscordForbidden = errors.New("discord forbidden")

// ErrDiscordEventState requires operator repair of a stored event identity.
var ErrDiscordEventState = errors.New("discord event state requires repair")

// SafeCodeDiscordPermission is the safe error code stored on a delivery job
// parked for a Discord 403. The web maps it to an operator sentence.
const SafeCodeDiscordPermission = "DISCORD_PERMISSION"

// Operator codes for the other delivery failures. The worker stores these
// only for a 403; every other failure leaves the code empty and keeps the
// reason in error_message. The admin read derives the code from that text.
const (
	SafeCodeDiscordUnauthorized  = "DISCORD_UNAUTHORIZED"
	SafeCodeDiscordNotFound      = "DISCORD_NOT_FOUND"
	SafeCodeDiscordRateLimit     = "DISCORD_RATE_LIMIT"
	SafeCodeDiscordUnavailable   = "DISCORD_UNAVAILABLE"
	SafeCodeDiscordNotConfigured = "DISCORD_NOT_CONFIGURED"
	SafeCodeDiscordUnreachable   = "DISCORD_UNREACHABLE"
	SafeCodeDiscordRejected      = "DISCORD_REJECTED"
)

var (
	discordStatusPattern    = regexp.MustCompile(`(?i)discord api status (\d{3})`)
	discordTransportPattern = regexp.MustCompile(`(?i)discord (?:create|patch) message:`)
)

// SafeCodeForErrorText maps the delivery worker's stored error text to one
// operator code. It never returns the provider body. Blank text has no code.
func SafeCodeForErrorText(message string) string {
	text := strings.TrimSpace(message)
	if text == "" {
		return ""
	}
	if match := discordStatusPattern.FindStringSubmatch(text); match != nil {
		status, err := strconv.Atoi(match[1])
		if err != nil {
			return SafeCodeDiscordRejected
		}
		switch status {
		case http.StatusUnauthorized:
			return SafeCodeDiscordUnauthorized
		case http.StatusForbidden:
			return SafeCodeDiscordPermission
		case http.StatusNotFound:
			return SafeCodeDiscordNotFound
		case http.StatusTooManyRequests:
			return SafeCodeDiscordRateLimit
		}
		if status >= 500 {
			return SafeCodeDiscordUnavailable
		}
		return SafeCodeDiscordRejected
	}
	if strings.Contains(strings.ToLower(text), "discord delivery not configured") {
		return SafeCodeDiscordNotConfigured
	}
	if discordTransportPattern.MatchString(text) {
		return SafeCodeDiscordUnreachable
	}
	return SafeCodeDiscordRejected
}

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
