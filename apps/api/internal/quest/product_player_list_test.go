package quest

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func TestPlayerListEmptySuccessIsNotApplied(t *testing.T) {
	if playerListDeliveryStatus(string(jobs.Succeeded), []byte(`{"message_id":"999"}`)) != "applied" {
		t.Fatal("posted roster")
	}
	for _, payload := range [][]byte{nil, []byte(`{}`), []byte(`{"message_id":""}`)} {
		if playerListDeliveryStatus(string(jobs.Succeeded), payload) != "queued" {
			t.Fatalf("payload=%s", payload)
		}
	}
	raw, err := os.ReadFile("../../db/queries/jobs.sql")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "COALESCE(background_jobs.completion_payload->>'message_id','')=''") {
		t.Fatal("succeeded roster without a message id must be requeued")
	}
}

func TestSeatedDiscordIDRejectsNonSnowflake(t *testing.T) {
	if delivery.ValidSnowflake("discord-player") || delivery.ValidSnowflake("") || !delivery.ValidSnowflake("123456789012345678") {
		t.Fatal("snowflake rule")
	}
}

type replayLockedQuest struct {
	QuestWriteRepository
	owner string
	calls int
}

func (q *replayLockedQuest) LockRestoreQuest(context.Context, RestoreQuestSpec) (RestoreQuestState, error) {
	q.calls++
	return RestoreQuestState{OwnerID: q.owner, Exists: q.owner != ""}, nil
}

func TestAdmitLockedQuestReplayKeepsRosterCommands(t *testing.T) {
	facts := arcGuardPolicyFacts{}
	policy, err := auth.NewPolicy(auth.PolicyProviders{Assignments: facts, Audience: facts, Identities: facts, SummaryRelationships: facts})
	if err != nil {
		t.Fatal(err)
	}
	const (
		owner   = "10000000-0000-4000-8000-000000000001"
		other   = "10000000-0000-4000-8000-000000000002"
		questID = "30000000-0000-4000-8000-000000000001"
	)
	actor, err := auth.NewAuthorityWithOwner(owner, []auth.Role{auth.DM}, "active", "approved", "owner", "")
	if err != nil {
		t.Fatal(err)
	}
	quests := &replayLockedQuest{owner: other}
	repos := ProductCommandRepos{Policy: policy, Quest: quests}
	decision := auth.Decision{Allowed: true}
	for _, operation := range []auth.Operation{
		"Mutation.addQuestParticipant",
		"Mutation.removeQuestParticipant",
		"Mutation.publishQuestPlayerList",
	} {
		request, err := auth.ForQuest(operation, auth.QuestFacts{ID: questID, DMID: owner})
		if err != nil {
			t.Fatal(err)
		}
		err = admitLockedQuestReplay(t.Context(), repos, actor, request, decision, questID)
		var target *apierr.Error
		if !errors.As(err, &target) || target.Code != apierr.Forbidden {
			t.Fatalf("%s err=%v", operation, err)
		}
	}
	if quests.calls != 3 {
		t.Fatalf("calls=%d", quests.calls)
	}
	quests.owner = ""
	request, err := auth.ForQuest("Mutation.publishQuestPlayerList", auth.QuestFacts{ID: questID, DMID: owner})
	if err != nil {
		t.Fatal(err)
	}
	err = admitLockedQuestReplay(t.Context(), repos, actor, request, decision, questID)
	var target *apierr.Error
	if !errors.As(err, &target) || target.Code != apierr.NotFound {
		t.Fatalf("deleted err=%v", err)
	}
}
