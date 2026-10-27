package delivery

import (
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/piyushsatti/chronicler/apps/api/internal/document"
)

// DiscordMessageLimit is the documented cap on message content
// ("Message contents (up to 2000 characters)"):
// https://docs.discord.com/developers/resources/message#create-message
// Length is counted in UTF-16 code units, which is never smaller than the
// code-point count, so a post that fits here fits however Discord counts.
const DiscordMessageLimit = 2000

// AnnounceQuest is everything the announcement needs, read from the database.
type AnnounceQuest struct {
	PublicID        string
	ShortCode       string
	Status          string
	Title           string
	ScheduledAt     time.Time
	DurationHours   float64
	AppliedRevision int
	MessageID       string
	EventID         string
	ThreadID        string
	VoiceChannelID  string
	DMDiscordID     string
	Brief           document.Document
}

// announceViewer is the audience of the public post: an ordinary signed-in
// member with no roles, who is not the author and is named in no marker.
func announceViewer() document.ViewerScope {
	return document.ViewerScope{
		MemberID: "announcement-ordinary-member",
		ReaderOf: map[string]struct{}{},
	}
}

// MemberBriefBody projects the brief for an ordinary member through
// document.EffectiveBody, so [!dm] and [!dm:@handle] blocks never reach
// Discord. The raw Body is never used. A brief an ordinary member cannot read
// at all yields no body.
func MemberBriefBody(brief document.Document) string {
	body, err := brief.EffectiveBody(announceViewer())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(body)
}

// AnnouncementInput is the data the post is built from.
type AnnouncementInput struct {
	RoleID         string
	Title          string
	ShortCode      string
	Body           string
	ScheduledAt    time.Time
	DurationHours  float64
	DMDiscordID    string
	VoiceChannelID string
	EventURL       string
	SignupURL      string
}

func discordLen(s string) int { return len(utf16.Encode([]rune(s))) }

// BuildAnnouncement renders the plain-text post. When the whole post would pass
// the Discord limit, only the body is cut (on a word boundary, with "…");
// every other line stays intact. The second result reports whether it was cut.
func BuildAnnouncement(in AnnouncementInput) (string, bool, error) {
	fixed := announcementLines(in, "")
	if discordLen(strings.Join(fixed, "\n")) > DiscordMessageLimit {
		return "", false, fmt.Errorf("announcement lines alone exceed %d characters", DiscordMessageLimit)
	}
	body := strings.TrimSpace(in.Body)
	full := strings.Join(announcementLines(in, body), "\n")
	if body == "" || discordLen(full) <= DiscordMessageLimit {
		return full, false, nil
	}
	room := DiscordMessageLimit - discordLen(strings.Join(fixed, "\n")) - 1 // body line's newline
	cut := cutOnWord(body, room)
	return strings.Join(announcementLines(in, cut), "\n"), true, nil
}

func announcementLines(in AnnouncementInput, body string) []string {
	lines := make([]string, 0, 8)
	if in.RoleID != "" {
		lines = append(lines, "<@&"+in.RoleID+">")
	}
	lines = append(lines, fmt.Sprintf("# %s (%s)", in.Title, in.ShortCode))
	if body != "" {
		lines = append(lines, body)
	}
	lines = append(lines, "")
	details := fmt.Sprintf("<t:%d:F> · %s hours · DM <@%s>", in.ScheduledAt.Unix(), formatHours(in.DurationHours), in.DMDiscordID)
	if in.VoiceChannelID != "" {
		details += " · Voice: <#" + in.VoiceChannelID + ">"
	}
	lines = append(lines, details)
	if in.EventURL != "" {
		lines = append(lines, "Event: "+in.EventURL)
	}
	lines = append(lines, "Sign up: "+in.SignupURL)
	return lines
}

func formatHours(h float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", h), "0"), ".")
}

// cutOnWord shortens text to at most limit UTF-16 units including a closing
// "…", ending at a word boundary. It returns "" when nothing fits.
func cutOnWord(text string, limit int) string {
	const ellipsis = "…"
	budget := limit - discordLen(ellipsis)
	if budget <= 0 {
		return ""
	}
	used, end := 0, 0
	for i, r := range text {
		width := 1
		if r > 0xFFFF {
			width = 2
		}
		if used+width > budget {
			end = i
			break
		}
		used += width
		end = i + utf8.RuneLen(r)
	}
	head := text[:end]
	if end < len(text) {
		// A word is only whole if the next rune is a space; otherwise back up.
		next, _ := utf8.DecodeRuneInString(text[end:])
		if !unicode.IsSpace(next) {
			if idx := strings.LastIndexFunc(head, unicode.IsSpace); idx >= 0 {
				head = head[:idx]
			} else {
				return ""
			}
		}
	}
	head = strings.TrimRightFunc(head, unicode.IsSpace)
	if head == "" {
		return ""
	}
	return head + ellipsis
}
