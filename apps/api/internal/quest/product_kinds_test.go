package quest

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func validCreateQuestFields(kinds []string) CreateQuestFields {
	return CreateQuestFields{
		Title: "Kinds check", BriefBody: "Brief", ScheduledAt: time.Date(2032, 1, 1, 18, 0, 0, 0, time.UTC),
		DurationHours: 3, SlotsMax: 4, Kinds: kinds,
	}
}

func requireInvalid(t *testing.T, err error, contains string) {
	t.Helper()
	apiErr, ok := errors.AsType[*apierr.Error](err)
	if !ok || apiErr.Code != apierr.Invalid {
		t.Fatalf("error = %v, want apierr.Invalid", err)
	}
	if !strings.Contains(apiErr.Message, contains) {
		t.Fatalf("message = %q, want it to contain %q", apiErr.Message, contains)
	}
}

func TestValidateQuestKindsAcceptsTheDatabaseVocabulary(t *testing.T) {
	if err := validateQuestKinds([]string{"standard", "event", "lieutenant", "hexcrawl", "one_shot", "mini_campaign"}); err != nil {
		t.Fatalf("validateQuestKinds() = %v", err)
	}
}

func TestCreateQuestRejectsUnknownKindAtServiceBoundary(t *testing.T) {
	_, err := ProductCommands{}.CreateQuest(context.Background(), auth.Authority{}, CreateQuestSpec{Input: validCreateQuestFields([]string{"standard", "oneshot"})}, product.CommandMeta{})
	requireInvalid(t, err, `"oneshot"`)
}

func TestCreateQuestRejectsExplicitlyEmptyKinds(t *testing.T) {
	_, err := ProductCommands{}.CreateQuest(context.Background(), auth.Authority{}, CreateQuestSpec{Input: validCreateQuestFields([]string{})}, product.CommandMeta{})
	requireInvalid(t, err, "at least one quest kind")
}

func TestUpdateQuestRejectsUnknownKindAtServiceBoundary(t *testing.T) {
	kinds := []string{"social"}
	spec := UpdateQuestSpec{Id: "0193b6a4-7c2e-7d4f-9a6b-2f6d3c1e8a90", Input: QuestEditFields{Kinds: product.Optional[[]string]{Set: true, Value: &kinds}}}
	_, err := ProductCommands{}.UpdateQuest(context.Background(), auth.Authority{}, spec, product.CommandMeta{})
	requireInvalid(t, err, `"social"`)
}

func TestUpdateQuestRejectsEmptyKinds(t *testing.T) {
	kinds := []string{}
	spec := UpdateQuestSpec{Id: "0193b6a4-7c2e-7d4f-9a6b-2f6d3c1e8a90", Input: QuestEditFields{Kinds: product.Optional[[]string]{Set: true, Value: &kinds}}}
	_, err := ProductCommands{}.UpdateQuest(context.Background(), auth.Authority{}, spec, product.CommandMeta{})
	requireInvalid(t, err, "at least one quest kind")
}
