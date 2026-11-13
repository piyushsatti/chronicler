package character

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestCreateCharacterReplaySkipsDdbFetch(t *testing.T) {
	const (
		ownerID  = "11111111-1111-4111-8111-111111111111"
		sheetURL = "https://www.dndbeyond.com/characters/152579009"
		regionID = "33333333-3333-4333-8333-333333333333"
		storyID  = "44444444-4444-4444-8444-444444444444"
	)
	payload := []byte(`{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[]}`)
	updated := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	actor, err := auth.NewAuthority(ownerID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments: submissionAssign{}, Audience: submissionAudience{}, Identities: submissionIdentity{}, SummaryRelationships: submissionSummary{},
	})
	if err != nil {
		t.Fatal(err)
	}
	flag := &submissionTx{}
	repo := &submissionCharacterRepo{}
	replay := &submissionReplay{}
	commands, err := NewProductCommands(submissionRunner{repos: ProductCommandRepos{
		Character: repo, Policy: policy, Authority: func(context.Context, string) (auth.Authority, error) { return actor, nil },
		Replay: replay,
	}, flag: flag}, func() time.Time { return updated }, func() string { return ownerID })
	if err != nil {
		t.Fatal(err)
	}
	client := &submissionDdb{flag: flag, payload: payload}
	commands.Ddb = client
	spec := CreateCharacterSpec{Input: CreateCharacterFields{Name: "Kept", RegionId: strPtr(regionID), BackstoryId: strPtr(storyID), DdbUrl: strPtr(sheetURL)}}
	meta := product.CommandMeta{IdempotencyKey: "create-sync"}

	view, err := commands.CreateCharacter(context.Background(), actor, spec, meta)
	if err != nil || view.Name != "Kept" || client.calls != 1 || client.inTx != 0 || repo.stores != 1 || string(repo.payload) != string(payload) {
		t.Fatalf("view=%+v err=%v calls=%d inTx=%d stores=%d payload=%s", view, err, client.calls, client.inTx, repo.stores, repo.payload)
	}
	view, err = commands.CreateCharacter(context.Background(), actor, spec, meta)
	if err != nil || view.Name != "Kept" || client.calls != 1 || repo.stores != 1 {
		t.Fatalf("replay fetched again view=%+v err=%v calls=%d stores=%d", view, err, client.calls, repo.stores)
	}
}

func TestSubmitForVerificationSyncsBeforeTheRequest(t *testing.T) {
	const (
		ownerID     = "11111111-1111-4111-8111-111111111111"
		characterID = "22222222-2222-4222-8222-222222222222"
		sheetURL    = "https://www.dndbeyond.com/characters/152579009"
	)
	payload := []byte(`{"level":1,"xp":0,"armorClass":null,"maxHp":null,"species":"Goliath","classes":"Barbarian 1","background":null,"proficiencies":[]}`)
	updated := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	actor, err := auth.NewAuthority(ownerID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments:          submissionAssign{},
		Audience:             submissionAudience{},
		Identities:           submissionIdentity{},
		SummaryRelationships: submissionSummary{},
	})
	if err != nil {
		t.Fatal(err)
	}
	flag := &submissionTx{}
	repo := &submissionCharacterRepo{state: SubmitForVerificationState{
		Exists: true, OwnerID: ownerID, UpdatedAt: &updated,
		Before: &CharacterView{Id: characterID, OwnerId: ownerID, DdbUrl: strPtr(sheetURL), UpdatedAt: updated},
	}}
	replay := &submissionReplay{}
	commands, err := NewProductCommands(submissionRunner{repos: ProductCommandRepos{
		Character: repo, Policy: policy, Authority: func(context.Context, string) (auth.Authority, error) { return actor, nil },
		Replay: replay, Admissions: submissionAdmissions{ownerID: ownerID},
	}, flag: flag}, func() time.Time { return updated }, func() string { return characterID })
	if err != nil {
		t.Fatal(err)
	}
	client := &submissionDdb{flag: flag, payload: payload}
	commands.Ddb = client
	spec := SubmitForVerificationSpec{CharacterId: characterID, ExpectedUpdatedAt: updated}
	meta := product.CommandMeta{IdempotencyKey: "submit-sync"}

	view, err := commands.SubmitForVerification(context.Background(), actor, spec, meta)
	if err != nil || view.VerificationSubmittedAt == nil || client.calls != 1 || client.inTx != 0 || repo.stores != 1 || string(repo.payload) != string(payload) {
		t.Fatalf("view=%+v err=%v calls=%d inTx=%d stores=%d payload=%s", view, err, client.calls, client.inTx, repo.stores, repo.payload)
	}

	client.err = DdbError{Code: DdbErrorUnavailable}
	meta.IdempotencyKey = "submit-stale"
	view, err = commands.SubmitForVerification(context.Background(), actor, spec, meta)
	if err != nil || view.VerificationSubmittedAt == nil || client.calls != 2 || client.inTx != 0 || repo.stores != 2 || repo.payload != nil {
		t.Fatalf("failed sync blocked submission view=%+v err=%v calls=%d inTx=%d stores=%d payload=%s", view, err, client.calls, client.inTx, repo.stores, repo.payload)
	}

	view, err = commands.SubmitForVerification(context.Background(), actor, spec, meta)
	if err != nil || view.VerificationSubmittedAt == nil || client.calls != 2 || repo.stores != 2 {
		t.Fatalf("replay fetched again view=%+v err=%v calls=%d stores=%d", view, err, client.calls, repo.stores)
	}
}

type submissionTx struct{ in bool }

type submissionRunner struct {
	repos ProductCommandRepos
	flag  *submissionTx
}

func (r submissionRunner) Do(_ context.Context, fn func(ProductCommandRepos) error) error {
	r.flag.in = true
	defer func() { r.flag.in = false }()
	return fn(r.repos)
}

type submissionDdb struct {
	flag    *submissionTx
	payload []byte
	err     error
	calls   int
	inTx    int
}

func (d *submissionDdb) Fetch(context.Context, string) (DdbSnapshot, DdbProvenance, error) {
	d.calls++
	if d.flag.in {
		d.inTx++
	}
	if d.err != nil {
		return DdbSnapshot{}, DdbProvenance{}, d.err
	}
	return DdbSnapshot{Payload: d.payload}, DdbProvenance{}, nil
}

type submissionCharacterRepo struct {
	CharacterWriteRepository
	state   SubmitForVerificationState
	payload json.RawMessage
	stores  int
}

func (r *submissionCharacterRepo) LockSubmitForVerification(context.Context, SubmitForVerificationSpec) (SubmitForVerificationState, error) {
	return r.state, nil
}

func (r *submissionCharacterRepo) LockCreateCharacter(context.Context, CreateCharacterSpec) (CreateCharacterState, error) {
	return CreateCharacterState{}, nil
}

func (r *submissionCharacterRepo) StoreCreateCharacter(_ context.Context, write CreateCharacterWrite) (CharacterView, error) {
	r.stores++
	r.payload = write.DdbPayload
	return CharacterView{Id: write.Locked.SubjectID, Name: write.Input.Input.Name, OwnerId: write.ActorID}, nil
}

func (r *submissionCharacterRepo) StoreSubmitForVerification(_ context.Context, write SubmitForVerificationWrite) (CharacterView, error) {
	r.stores++
	r.payload = write.DdbPayload
	at := write.At
	return CharacterView{Id: write.Input.CharacterId, VerificationSubmittedAt: &at, UpdatedAt: at}, nil
}

type submissionReplay struct{ done map[string]json.RawMessage }

func (m *submissionReplay) Claim(_ context.Context, actorID, operation, key, fingerprint string) (idempotency.Claim, error) {
	if receipt, ok := m.done[operation+"\x00"+key]; ok {
		return idempotency.Claim{Replay: true, Receipt: receipt, ActorID: actorID, Operation: operation, Key: key, Fingerprint: fingerprint}, nil
	}
	return idempotency.Claim{ActorID: actorID, Operation: operation, Key: key, Fingerprint: fingerprint}, nil
}

func (m *submissionReplay) RecordOverride(context.Context, idempotency.Claim, idempotency.CommandOverrideFact) error {
	return nil
}

func (m *submissionReplay) Complete(_ context.Context, claim idempotency.Claim, receipt json.RawMessage) error {
	if m.done == nil {
		m.done = map[string]json.RawMessage{}
	}
	m.done[claim.Operation+"\x00"+claim.Key] = receipt
	return nil
}

type submissionAdmissions struct{ ownerID string }

func (a submissionAdmissions) ReadImmutableOwner(context.Context, string) (string, error) {
	return a.ownerID, nil
}
func (submissionAdmissions) LockAdmissions(context.Context, []string) ([]Admission, error) {
	return nil, nil
}
func (submissionAdmissions) LockAdmission(context.Context, string) (Admission, error) {
	return Admission{}, nil
}

type submissionAssign struct{}

func (submissionAssign) HasArchon(context.Context, string, string) (bool, error) { return false, nil }
func (submissionAssign) HasLieutenant(context.Context, string, string) (bool, error) {
	return false, nil
}

type submissionAudience struct{}

func (submissionAudience) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	return auth.AudienceAssessment{}, nil
}

type submissionIdentity struct{}

func (submissionIdentity) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}

type submissionSummary struct{}

func (submissionSummary) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}

func strPtr(value string) *string { return &value }
