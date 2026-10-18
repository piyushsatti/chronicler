package notification

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

const (
	cursorVersion        = 1
	cursorDomainMessage  = "chronicler:notification-cursor:v1"
	maxCursorTokenBytes  = 1024
	cursorTimeLayout     = "2006-01-02T15:04:05.000000Z"
)

// Cursor is the decoded inbox pagination position (NOT05).
type Cursor struct {
	Version        int32
	MemberID       string
	UnreadOnly     bool
	CreatedAt      time.Time
	NotificationID string
}

// CursorCodec signs and verifies opaque myNotifications cursors.
type CursorCodec interface {
	Encode(cursor Cursor) (string, error)
	Decode(token, memberID string, unreadOnly bool) (Cursor, error)
}

// HMACCursorCodec implements CursorCodec per notification-cursor-contract.md.
type HMACCursorCodec struct {
	key []byte
}

func NewCursorCodec(jwtSecret []byte) (*HMACCursorCodec, error) {
	if len(jwtSecret) == 0 {
		return nil, fmt.Errorf("notification cursor codec: jwt secret required")
	}
	mac := hmac.New(sha256.New, jwtSecret)
	_, _ = mac.Write([]byte(cursorDomainMessage))
	return &HMACCursorCodec{key: mac.Sum(nil)}, nil
}

type cursorPayload struct {
	Version    int32  `json:"version"`
	MemberID   string `json:"memberId"`
	UnreadOnly bool   `json:"unreadOnly"`
	CreatedAt  string `json:"createdAt"`
	ID         string `json:"id"`
}

func (c *HMACCursorCodec) Encode(cur Cursor) (string, error) {
	if cur.Version != cursorVersion {
		return "", apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	memberID, err := canonicalUUID(cur.MemberID)
	if err != nil {
		return "", err
	}
	notificationID, err := canonicalUUID(cur.NotificationID)
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(cursorPayload{
		Version:    cursorVersion,
		MemberID:   memberID,
		UnreadOnly: cur.UnreadOnly,
		CreatedAt:  cur.CreatedAt.UTC().Format(cursorTimeLayout),
		ID:         notificationID,
	})
	if err != nil {
		return "", err
	}
	sig := hmacSHA256(c.key, payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func (c *HMACCursorCodec) Decode(token, memberID string, unreadOnly bool) (Cursor, error) {
	if len(token) > maxCursorTokenBytes {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(sig) != sha256.Size {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	expected := hmacSHA256(c.key, payload)
	if !hmac.Equal(sig, expected) {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	var p cursorPayload
	dec := json.NewDecoder(strings.NewReader(string(payload)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&p); err != nil {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	if p.Version != cursorVersion {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	wantMember, err := canonicalUUID(memberID)
	if err != nil {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	gotMember, err := canonicalUUID(p.MemberID)
	if err != nil || gotMember != wantMember || p.UnreadOnly != unreadOnly {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	createdAt, err := time.Parse(cursorTimeLayout, p.CreatedAt)
	if err != nil {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	notificationID, err := canonicalUUID(p.ID)
	if err != nil {
		return Cursor{}, apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	return Cursor{
		Version:        p.Version,
		MemberID:       gotMember,
		UnreadOnly:     p.UnreadOnly,
		CreatedAt:      createdAt.UTC(),
		NotificationID: notificationID,
	}, nil
}

func hmacSHA256(key, payload []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(payload)
	return mac.Sum(nil)
}

func canonicalUUID(id string) (string, error) {
	parsed, err := uuid.Parse(id)
	if err != nil || parsed == uuid.Nil {
		return "", apierr.New(apierr.Invalid, "invalid notification cursor")
	}
	return strings.ToLower(parsed.String()), nil
}
