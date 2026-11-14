package document

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	lockDocID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	lockActorID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
)

func TestPublishDocumentLockErrorPropagates(t *testing.T) {
	want := errors.New("pool timeout")
	repo := &lockWriteRepo{publishErr: want}
	_, err := lockCommands(t, repo).PublishDocument(context.Background(), lockActor(t), PublishDocumentSpec{Id: lockDocID, ExpectedRevision: 1}, product.CommandMeta{IdempotencyKey: "pub-err"})
	if !errors.Is(err, want) {
		t.Fatalf("err=%v want=%v", err, want)
	}
	if code, ok := apierrCode(err); ok && code == apierr.NotFound {
		t.Fatalf("mapped lock failure to NotFound")
	}
}

func TestPublishDocumentMissingRowNotFound(t *testing.T) {
	repo := &lockWriteRepo{publish: PublishDocumentState{Exists: false}}
	_, err := lockCommands(t, repo).PublishDocument(context.Background(), lockActor(t), PublishDocumentSpec{Id: lockDocID, ExpectedRevision: 1}, product.CommandMeta{IdempotencyKey: "pub-miss"})
	if code, ok := apierrCode(err); !ok || code != apierr.NotFound {
		t.Fatalf("err=%v want NotFound", err)
	}
}

func TestPublishDocumentStoreLockErrorPropagates(t *testing.T) {
	want := errors.New("store lock failed")
	view := lockView()
	repo := &lockWriteRepo{
		publish:      PublishDocumentState{Exists: true, Before: &view},
		publishStore: want,
	}
	_, err := lockCommands(t, repo).PublishDocument(context.Background(), lockActor(t), PublishDocumentSpec{Id: lockDocID, ExpectedRevision: 1}, product.CommandMeta{IdempotencyKey: "pub-store"})
	if !errors.Is(err, want) {
		t.Fatalf("err=%v want=%v", err, want)
	}
}

func TestUnpublishDocumentLockErrorPropagates(t *testing.T) {
	want := errors.New("db outage")
	repo := &lockWriteRepo{unpublishErr: want}
	_, err := lockCommands(t, repo).UnpublishDocument(context.Background(), lockActor(t), UnpublishDocumentSpec{Id: lockDocID, ExpectedRevision: 1}, product.CommandMeta{IdempotencyKey: "unpub-err"})
	if !errors.Is(err, want) {
		t.Fatalf("err=%v want=%v", err, want)
	}
	if code, ok := apierrCode(err); ok && code == apierr.NotFound {
		t.Fatalf("mapped lock failure to NotFound")
	}
}

func lockCommands(t *testing.T, repo *lockWriteRepo) *ProductCommands {
	t.Helper()
	actor := lockActor(t)
	policy, err := auth.NewPolicy(auth.PolicyProviders{
		Assignments:          lockPolicy{},
		Audience:             lockPolicy{},
		Identities:           lockPolicy{},
		SummaryRelationships: lockPolicy{},
	})
	if err != nil {
		t.Fatal(err)
	}
	commands, err := NewProductCommands(lockRunner{repos: ProductCommandRepos{
		Document:  repo,
		Policy:    policy,
		Authority: func(context.Context, string) (auth.Authority, error) { return actor, nil },
		Replay:    &lockReplay{},
	}}, func() time.Time { return time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC) }, func() string { return lockDocID })
	if err != nil {
		t.Fatal(err)
	}
	return commands
}

func lockActor(t *testing.T) auth.Authority {
	t.Helper()
	actor, err := auth.NewAuthority(lockActorID, []auth.Role{auth.Player}, "active", "")
	if err != nil {
		t.Fatal(err)
	}
	return actor
}

func lockView() DocumentView {
	return DocumentView{Id: lockDocID, AuthorId: lockActorID, Kind: "codex_entry", Status: "draft", Visibility: "public"}
}

func apierrCode(err error) (apierr.Code, bool) {
	apiErr, ok := errors.AsType[*apierr.Error](err)
	if !ok {
		return "", false
	}
	return apiErr.Code, true
}

type lockRunner struct{ repos ProductCommandRepos }

func (r lockRunner) Do(_ context.Context, fn func(ProductCommandRepos) error) error {
	return fn(r.repos)
}

type lockWriteRepo struct {
	DocumentWriteRepository
	publish       PublishDocumentState
	publishErr    error
	publishStore  error
	publishCalls  int
	unpublishErr  error
}

func (r *lockWriteRepo) LockPublishDocument(context.Context, PublishDocumentSpec) (PublishDocumentState, error) {
	r.publishCalls++
	if r.publishCalls == 1 {
		if r.publishErr != nil {
			return PublishDocumentState{}, r.publishErr
		}
		return r.publish, nil
	}
	if r.publishStore != nil {
		return PublishDocumentState{}, r.publishStore
	}
	return r.publish, nil
}

func (r *lockWriteRepo) LockUnpublishDocument(context.Context, UnpublishDocumentSpec) (UnpublishDocumentState, error) {
	if r.unpublishErr != nil {
		return UnpublishDocumentState{}, r.unpublishErr
	}
	return UnpublishDocumentState{}, nil
}

type lockReplay struct{}

func (lockReplay) Claim(_ context.Context, actorID, operation, key, fingerprint string) (idempotency.Claim, error) {
	return idempotency.Claim{ActorID: actorID, Operation: operation, Key: key, Fingerprint: fingerprint}, nil
}

func (lockReplay) RecordOverride(context.Context, idempotency.Claim, idempotency.CommandOverrideFact) error {
	return nil
}

func (lockReplay) Complete(context.Context, idempotency.Claim, json.RawMessage) error { return nil }

type lockPolicy struct{}

func (lockPolicy) HasArchon(context.Context, string, string) (bool, error)     { return false, nil }
func (lockPolicy) HasLieutenant(context.Context, string, string) (bool, error) { return false, nil }
func (lockPolicy) Assess(context.Context, auth.AudienceContext, []auth.DocumentRef) (auth.AudienceAssessment, error) {
	return auth.AudienceAssessment{}, nil
}
func (lockPolicy) DiscordIdentity(context.Context, string) (auth.DiscordIdentity, error) {
	return auth.DiscordIdentity{}, nil
}
func (lockPolicy) SummaryRelations(context.Context, []string, *string) (auth.SummaryEvidence, error) {
	return auth.SummaryEvidence{}, nil
}
