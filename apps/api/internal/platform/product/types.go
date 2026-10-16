package product

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

type Clock func() time.Time

type IDGenerator func() string

type Date string

type Time string

type Page struct {
	Limit  int32
	Offset int32
}

type Optional[T any] struct {
	Set   bool
	Value *T
}

type BatchResult[T any] struct {
	Value *T
	Err   error
}

type CommandMeta struct {
	IdempotencyKey string
}

type CommandReceipt struct {
	Replayed bool
}

type GameDateView struct {
	Day         int32
	EraAbbrev   string
	PeriodIndex int32
	PeriodName  string
	PeriodType  string
	Year        int32
}

func UTCNow(clock Clock) (time.Time, error) {
	if clock == nil {
		return time.Time{}, errors.New("product clock is required")
	}
	now := clock()
	if now.IsZero() {
		return time.Time{}, errors.New("product clock returned zero time")
	}
	return now.UTC().Truncate(time.Microsecond), nil
}

func Fingerprint(normalizedSpec any) (string, error) {
	encoded, err := json.Marshal(normalizedSpec)
	if err != nil {
		return "", fmt.Errorf("marshal command fingerprint: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var tree any
	if err := decoder.Decode(&tree); err != nil {
		return "", fmt.Errorf("decode command fingerprint: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return "", errors.New("command fingerprint contains trailing JSON")
		}
		return "", fmt.Errorf("decode command fingerprint trailing data: %w", err)
	}
	canonical, err := json.Marshal(tree)
	if err != nil {
		return "", fmt.Errorf("marshal canonical command fingerprint: %w", err)
	}
	digest := sha256.Sum256(canonical)
	return hex.EncodeToString(digest[:]), nil
}
