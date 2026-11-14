package notification

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

const (
	producerA         = "10000000-0000-4000-8000-000000000001"
	producerB         = "10000000-0000-4000-8000-000000000002"
	producerC         = "10000000-0000-4000-8000-000000000003"
	producerDee       = "10000000-0000-4000-8000-000000000004"
	producerVerifier  = "10000000-0000-4000-8000-000000000005"
	producerReed      = "10000000-0000-4000-8000-000000000008"
	producerCharacter = "10000000-0000-4000-8000-000000000030"
	producerDocument  = "10000000-0000-4000-8000-000000000010"
	producerQuest     = "10000000-0000-4000-8000-000000000050"
	producerRequest   = "10000000-0000-4000-8000-000000000130"
	producerProof     = "10000000-0000-4000-8000-000000000078"
	producerEvent     = "10000000-0000-4000-8000-000000000220"
)

type producerPorts struct {
	owner, author                                             string
	questRecipients                                           []string
	err, preferenceErr, eventErr, recipientErr                error
	missingPreference, duplicatePreference, foreignPreference bool
	eventID                                                   string
	events                                                    []Event
	recipientIDs                                              []string
	recipientEvent                                            string
	recipientAt                                               time.Time
	preferenceReads                                           int
	preferredIDs                                              []string
	characterLookups, documentLookups, questLookups           int
	lookedCharacter, lookedQuest, lookedChange                string
}

func (p *producerPorts) CharacterOwner(_ context.Context, id string) (string, error) {
	p.characterLookups++
	p.lookedCharacter = id
	return p.owner, p.err
}
func (p *producerPorts) DocumentAuthor(_ context.Context, id string) (string, error) {
	p.documentLookups++
	return p.author, p.err
}
func (p *producerPorts) QuestRecipientIDs(_ context.Context, quest, change string) ([]string, error) {
	p.questLookups++
	p.lookedQuest = quest
	p.lookedChange = change
	return append([]string(nil), p.questRecipients...), p.err
}
func (p *producerPorts) ReadPreferences(_ context.Context, ids []string) ([]Preferences, error) {
	p.preferenceReads++
	p.preferredIDs = append([]string(nil), ids...)
	if p.preferenceErr != nil {
		return nil, p.preferenceErr
	}
	result := make([]Preferences, 0, len(ids))
	for _, id := range ids {
		result = append(result, Preferences{MemberID: id})
	}
	if p.missingPreference && len(result) > 0 {
		result = result[1:]
	}
	if p.duplicatePreference && len(result) > 0 {
		result = append(result, result[0])
	}
	if p.foreignPreference {
		result = append(result, Preferences{MemberID: producerReed})
	}
	return result, nil
}
func (p *producerPorts) InsertInbox(_ context.Context, event Event, ids []string) error {
	p.events = append(p.events, event)
	if p.eventErr != nil {
		return p.eventErr
	}
	p.recipientEvent = p.eventID
	p.recipientIDs = append([]string(nil), ids...)
	p.recipientAt = event.OccurredAt
	return p.recipientErr
}
func (p *producerPorts) repos() ProducerRepos {
	return ProducerRepos{Writer: p, Preferences: p, Recipients: RecipientComposition{Character: p, Document: p, Quest: p}}
}
func producerPointer(s string) *string { return &s }
func producerInput(kind EventKind) Event {
	event := Event{Key: "immutable-test-event", Kind: kind, ActorID: producerC, OccurredAt: time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC), Facts: Facts{Version: 1, EventKind: kind}}
	switch kind {
	case CharacterVerificationDecided:
		event.SubjectType = "character"
		event.SubjectID = producerCharacter
		event.ActorID = producerVerifier
		event.Facts.VerificationID = producerPointer(producerProof)
		event.Facts.CharacterID = producerPointer(producerCharacter)
		event.Facts.Verdict = producerPointer("approved")
	case QuestSignupConfirmed, QuestWaitlistPromoted:
		event.SubjectType = "quest"
		event.SubjectID = producerQuest
		event.Facts.CharacterID = producerPointer(producerCharacter)
		event.Facts.ToStatus = producerPointer("signed_up")
		if kind == QuestSignupConfirmed {
			event.ActorID = producerA
		} else {
			event.ActorID = producerA
			event.Facts.FromStatus = producerPointer("waitlisted")
		}
	case DocumentEdited, DocumentPublished:
		event.SubjectType = "document"
		event.SubjectID = producerDocument
		event.ActorID = producerDee
		event.Facts.RevisionID = producerPointer(producerProof)
	case DMMentioned:
		event.SubjectType = "document"
		event.SubjectID = producerDocument
		event.Facts.RevisionID = producerPointer(producerProof)
		event.Facts.NewMentionMemberIDs = []string{producerB, producerReed, producerB, producerC}
	case QuestScheduled:
		event.Facts.ChangedFields = []string{"scheduledAt"}
		event.Facts.RecipientMemberIDs = []string{producerB, producerA, producerC, producerB}
		event.SubjectType = "quest"
		event.SubjectID = producerQuest
	case DMRequestDecided:
		event.Facts.Decision = producerPointer("approved")
		event.SubjectType = "request"
		event.SubjectID = producerRequest
		event.Facts.DecisionID = producerPointer(producerProof)
		event.Facts.RequestID = producerPointer(producerRequest)
	}
	return event
}
func TestPhase3TaskNOT08Acceptance(t *testing.T) {
	for _, tc := range []struct {
		kind  EventKind
		owner string
		want  []string
	}{
		{CharacterVerificationDecided, producerA, []string{producerA}},
		{QuestSignupConfirmed, producerA, []string{producerA}},
		{QuestWaitlistPromoted, producerB, []string{producerB}},
		{DocumentEdited, "", []string{producerA}},
		{DocumentPublished, "", []string{producerA}},
		{DMMentioned, "", []string{producerB, producerReed}},
		{QuestScheduled, "", []string{producerA, producerB}},
	} {
		t.Run(string(tc.kind), func(t *testing.T) {
			ports := &producerPorts{owner: tc.owner, author: producerA, questRecipients: []string{producerB, producerA, producerC, producerB}, eventID: producerEvent}
			event := producerInput(tc.kind)
			before := append([]string(nil), event.Facts.NewMentionMemberIDs...)
			if err := NewProducer().Record(context.Background(), ports.repos(), event); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(ports.recipientIDs, tc.want) {
				t.Fatalf("addressed=%v want=%v", ports.recipientIDs, tc.want)
			}
			if len(ports.events) != 1 || ports.recipientEvent != producerEvent || !ports.recipientAt.Equal(event.OccurredAt) {
				t.Fatalf("event/recipient provenance mismatch: %#v", ports)
			}
			if ports.preferenceReads != 1 || !reflect.DeepEqual(ports.preferredIDs, tc.want) {
				t.Fatal("required inbox recipients must survive all-false preferences in one set read")
			}
			if !reflect.DeepEqual(event.Facts.NewMentionMemberIDs, before) {
				t.Fatal("producer mutated caller-owned fact slice")
			}
			if tc.kind == QuestScheduled && ports.questLookups != 0 {
				t.Fatal("schedule must use the originating participant snapshot")
			}
			if tc.kind == DMMentioned && ports.characterLookups+ports.documentLookups+ports.questLookups != 0 {
				t.Fatal("resolved mentions must not be filtered through current roles/audience or another recipient lookup")
			}
		})
	}
}
func TestProducerActorRules(t *testing.T) {
	for _, kind := range []EventKind{CharacterVerificationDecided, DocumentEdited, DocumentPublished, DMMentioned} {
		t.Run(string(kind), func(t *testing.T) {
			event := producerInput(kind)
			event.ActorID = producerA
			ports := &producerPorts{owner: producerA, author: producerA, eventID: producerEvent}
			if kind == DMMentioned {
				event.Facts.NewMentionMemberIDs = []string{producerA}
			}
			if err := NewProducer().Record(context.Background(), ports.repos(), event); err != nil {
				t.Fatal(err)
			}
			var want []string
			if kind == CharacterVerificationDecided {
				want = []string{producerA}
			}
			if kind == DMRequestDecided {
				want = []string{producerB}
			}
			if !reflect.DeepEqual(ports.recipientIDs, want) {
				t.Fatalf("actor rule addressed=%v want=%v", ports.recipientIDs, want)
			}
		})
	}
}
func TestProducerFailuresPropagate(t *testing.T) {
	failure := errors.New("owned dependency failure")
	for _, stage := range []string{"recipient", "preferences", "event", "recipient-write"} {
		t.Run(stage, func(t *testing.T) {
			ports := &producerPorts{owner: producerA, eventID: producerEvent}
			switch stage {
			case "recipient":
				ports.err = failure
			case "preferences":
				ports.preferenceErr = failure
			case "event":
				ports.eventErr = failure
			case "recipient-write":
				ports.recipientErr = failure
			}
			if err := NewProducer().Record(context.Background(), ports.repos(), producerInput(CharacterVerificationDecided)); !errors.Is(err, failure) {
				t.Fatalf("error=%v", err)
			}
			if (stage == "recipient" || stage == "preferences") && len(ports.events) != 0 {
				t.Fatal("pre-write dependency failure inserted an event")
			}
			if stage == "event" && ports.recipientEvent != "" {
				t.Fatal("failed event insertion continued to recipients")
			}
		})
	}
}
func TestProducerRejectsCorruptInputsBeforeWrites(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*Event, *producerPorts)
	}{
		{"unknown kind", func(e *Event, p *producerPorts) { e.Kind = "UNKNOWN"; e.Facts.EventKind = e.Kind }},
		{"wrong semantic version", func(e *Event, p *producerPorts) { e.Facts.Version = 2 }},
		{"wrong fact kind", func(e *Event, p *producerPorts) { e.Facts.EventKind = DocumentEdited }},
		{"wrong subject", func(e *Event, p *producerPorts) { e.SubjectType = "document" }},
		{"missing history", func(e *Event, p *producerPorts) { e.Facts.VerificationID = nil }},
		{"invalid verdict", func(e *Event, p *producerPorts) { e.Facts.Verdict = producerPointer("pending") }},
		{"foreign character", func(e *Event, p *producerPorts) { e.Facts.CharacterID = producerPointer(producerDocument) }},
		{"wrong-kind fact", func(e *Event, p *producerPorts) { e.Facts.RequestID = producerPointer(producerRequest) }},
		{"missing actor", func(e *Event, p *producerPorts) { e.ActorID = "" }},
		{"missing clock", func(e *Event, p *producerPorts) { e.OccurredAt = time.Time{} }},
		{"invalid recipient", func(e *Event, p *producerPorts) { p.owner = "not-an-id" }},
		{"missing preferences", func(e *Event, p *producerPorts) { p.missingPreference = true }},
		{"duplicate preferences", func(e *Event, p *producerPorts) { p.duplicatePreference = true }},
		{"foreign preferences", func(e *Event, p *producerPorts) { p.foreignPreference = true }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ports := &producerPorts{owner: producerA, eventID: producerEvent}
			event := producerInput(CharacterVerificationDecided)
			tc.edit(&event, ports)
			if err := NewProducer().Record(context.Background(), ports.repos(), event); err == nil {
				t.Fatal("corrupt event accepted")
			}
			if len(ports.events) != 0 || ports.recipientEvent != "" {
				t.Fatal("corrupt event wrote durable rows")
			}
		})
	}
}

func TestReviewSelectionConfirmedFromWaitlist(t *testing.T) {
	event := producerInput(QuestSignupConfirmed)
	event.Facts.FromStatus = producerPointer("waitlisted")
	ports := &producerPorts{owner: producerA, eventID: producerEvent}
	if err := NewProducer().Record(context.Background(), ports.repos(), event); err != nil {
		t.Fatalf("accepted selectQuestParticipants waitlisted-to-signed_up notification refused: %v", err)
	}
	if !reflect.DeepEqual(ports.recipientIDs, []string{producerA}) {
		t.Fatalf("recipients=%v", ports.recipientIDs)
	}
}

func TestProducerSignupSelectionPreservesTransition(t *testing.T) {
	for _, tc := range []struct {
		from, to string
		valid    bool
	}{
		{"waitlisted", "signed_up", true}, {"withdrawn", "signed_up", true}, {"withdrawn", "waitlisted", true},
		{"waitlisted", "waitlisted", false}, {"signed_up", "signed_up", false}, {"played", "signed_up", false}, {"no_show", "signed_up", false}, {"accepted", "signed_up", false},
	} {
		t.Run(tc.from+"-to-"+tc.to, func(t *testing.T) {
			event := producerInput(QuestSignupConfirmed)
			event.Facts.FromStatus = producerPointer(tc.from)
			event.Facts.ToStatus = producerPointer(tc.to)
			ports := &producerPorts{owner: producerA, eventID: producerEvent}
			err := NewProducer().Record(context.Background(), ports.repos(), event)
			if !tc.valid {
				if err == nil || len(ports.events) != 0 {
					t.Fatalf("invalid transition accepted: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(ports.events) != 1 || ports.events[0].Kind != QuestSignupConfirmed || *ports.events[0].Facts.FromStatus != tc.from || *ports.events[0].Facts.ToStatus != tc.to {
				t.Fatal("producer rewrote immutable selection kind/prior state")
			}
			if !reflect.DeepEqual(ports.recipientIDs, []string{producerA}) {
				t.Fatalf("recipients=%v", ports.recipientIDs)
			}
		})
	}
}

func TestProducerRejectsRetiredRequestAndQuestChangeProof(t *testing.T) {
	for _, event := range []Event{producerInput(DMRequestDecided), producerInput(QuestSignupConfirmed)} {
		if event.Kind == QuestSignupConfirmed {
			event.Facts.QuestChangeID = producerPointer(producerProof)
		}
		ports := &producerPorts{owner: producerA, eventID: producerEvent}
		if err := NewProducer().Record(context.Background(), ports.repos(), event); err == nil || len(ports.events) != 0 {
			t.Fatal("retired proof accepted")
		}
	}
}
