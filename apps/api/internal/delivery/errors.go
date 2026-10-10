package delivery

import "errors"

// ErrBadPayload marks a discord job body that is not QuestDiscordPayload.
var ErrBadPayload = errors.New("invalid quest discord job payload")
