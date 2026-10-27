package document

import (
	"context"
	"encoding/json"
	"reflect"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/idempotency"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type ProductCommands struct {
	Runner uow.Runner[ProductCommandRepos]
	Clock  product.Clock
	IDs    product.IDGenerator
}

func commandDependencyMissing(value any) bool {
	if value == nil {
		return true
	}
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Func, reflect.Map, reflect.Slice, reflect.Chan:
		return v.IsNil()
	}
	return false
}

func NewProductCommands(runner uow.Runner[ProductCommandRepos], clock product.Clock, ids product.IDGenerator) (*ProductCommands, error) {
	for _, dep := range []any{runner, clock, ids} {
		if commandDependencyMissing(dep) {
			return nil, apierr.New(apierr.Internal, "document command dependencies required")
		}
	}
	return &ProductCommands{Runner: runner, Clock: clock, IDs: ids}, nil
}

func commandPublicID(value *string) error {
	if value == nil {
		return nil
	}
	_, err := productDocumentID(*value)
	return err
}

func documentWriteFacts(view *DocumentView) auth.DocumentWriteFacts {
	if view == nil {
		return auth.DocumentWriteFacts{}
	}
	return auth.DocumentWriteFacts{ID: view.Id, AuthorID: view.AuthorId, Kind: view.Kind, Category: view.Category, LinkedRegionIDs: view.LinkedRegionIDs}
}

func runDocumentWrite[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation auth.Operation,
	replayName string,
	spec any,
	meta product.CommandMeta,
	subjectID string,
	lock func(context.Context, DocumentWriteRepository) (*DocumentView, error),
	store func(context.Context, ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		var err error
		result, err = executeDocumentWrite(ctx, repos, s, actor, operation, replayName, spec, meta, subjectID, fingerprint, lock, store)
		return err
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func executeDocumentWrite[T any](ctx context.Context, repos ProductCommandRepos, s ProductCommands, actor auth.Authority, operation auth.Operation, replayName string, spec any, meta product.CommandMeta, subjectID, fingerprint string, lock func(context.Context, DocumentWriteRepository) (*DocumentView, error), store func(context.Context, ProductCommandRepos, auth.Authority, time.Time) (T, error)) (T, error) {
	var zero T
	fresh, request, decision, err := authorizeDocumentWrite(ctx, repos, actor, operation, spec, lock)
	if err != nil {
		return zero, err
	}
	claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, replayName, meta.IdempotencyKey, fingerprint)
	if err != nil {
		return zero, err
	}
	if claim.Replay {
		return replayDocumentWrite[T](ctx, repos.Document, fresh, claim.Receipt)
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return zero, err
	}
	result, err := store(auth.WithAuthority(ctx, fresh), repos, fresh, at)
	if err != nil {
		return zero, err
	}
	if err := completeDocumentWrite(ctx, repos, claim, fresh, request, decision, subjectID, at, result); err != nil {
		return zero, err
	}
	return result, nil
}

func authorizeDocumentWrite(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation, spec any, lock func(context.Context, DocumentWriteRepository) (*DocumentView, error)) (auth.Authority, auth.Request, auth.Decision, error) {
	if err := requireDocumentCommandDependencies(repos); err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Forbidden, "member authority changed")
	}
	before, err := lock(ctx, repos.Document)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if before == nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.NotFound, "document not found")
	}
	if err := admitDocumentDisclosure(*before, fresh); err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	facts := documentWriteFacts(before)
	facts.NewCategory = editedCategory(spec)
	request, err := auth.ForDocumentWrite(operation, facts)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if !decision.Allowed {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Forbidden, "document command forbidden")
	}
	if err := admitDocumentBody(ctx, repos.Document, fresh, spec); err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	return fresh, request, decision, nil
}

// editedCategory returns the category an edit command sets, so policy can gate
// moves into a restricted category as well as edits of one.
func editedCategory(spec any) *string {
	switch v := spec.(type) {
	case UpdateDocumentSpec:
		if v.Input.Category.Set {
			return v.Input.Category.Value
		}
	case EditPublishedDocumentSpec:
		if v.Input.Category.Set {
			return v.Input.Category.Value
		}
	}
	return nil
}

func requireDocumentCommandDependencies(repos ProductCommandRepos) error {
	for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
		if commandDependencyMissing(dependency) {
			return apierr.New(apierr.Internal, "document transaction dependencies required")
		}
	}
	return nil
}

func replayDocumentWrite[T any](ctx context.Context, repo DocumentWriteRepository, actor auth.Authority, receipt []byte) (T, error) {
	var result T
	if err := json.Unmarshal(receipt, &result); err != nil {
		return result, err
	}
	if replayed, ok := any(&result).(*DocumentView); ok {
		current, err := repo.ReadCommandDocument(ctx, actor, replayed.Id)
		if err != nil {
			return result, err
		}
		*replayed = current
	}
	return result, nil
}

func completeDocumentWrite[T any](ctx context.Context, repos ProductCommandRepos, claim idempotency.Claim, actor auth.Authority, request auth.Request, decision auth.Decision, subjectID string, at time.Time, result T) error {
	if decision.UsedOverride {
		if commandDependencyMissing(repos.Audit) {
			return apierr.New(apierr.Internal, "override recorder required")
		}
		if err := repos.Audit.Record(ctx, claim, auth.OverrideFact{
			ActorID: actor.Claims().MemberID, Operation: request.Operation(), SubjectType: "document", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at,
		}); err != nil {
			return err
		}
	}
	receipt, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return repos.Replay.Complete(ctx, claim, receipt)
}

func runDocumentOp[T any](
	ctx context.Context,
	s ProductCommands,
	actor auth.Authority,
	operation auth.Operation,
	replayName string,
	spec any,
	meta product.CommandMeta,
	subjectID string,
	store func(context.Context, ProductCommandRepos, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		var err error
		result, err = executeDocumentOperation(ctx, repos, s, actor, operation, replayName, spec, meta, subjectID, fingerprint, store)
		return err
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
}

func executeDocumentOperation[T any](ctx context.Context, repos ProductCommandRepos, s ProductCommands, actor auth.Authority, operation auth.Operation, replayName string, spec any, meta product.CommandMeta, subjectID, fingerprint string, store func(context.Context, ProductCommandRepos, auth.Authority, time.Time) (T, error)) (T, error) {
	var zero T
	fresh, request, decision, err := authorizeDocumentOperation(ctx, repos, actor, operation)
	if err != nil {
		return zero, err
	}
	claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, replayName, meta.IdempotencyKey, fingerprint)
	if err != nil {
		return zero, err
	}
	if claim.Replay {
		return replayCommand[T](claim.Receipt)
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return zero, err
	}
	result, err := store(auth.WithAuthority(ctx, fresh), repos, fresh, at)
	if err != nil {
		return zero, err
	}
	if err := completeDocumentWrite(ctx, repos, claim, fresh, request, decision, subjectID, at, result); err != nil {
		return zero, err
	}
	return result, nil
}

func replayCommand[T any](receipt []byte) (T, error) {
	var result T
	err := json.Unmarshal(receipt, &result)
	return result, err
}

func authorizeDocumentOperation(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, operation auth.Operation) (auth.Authority, auth.Request, auth.Decision, error) {
	if err := requireDocumentCommandDependencies(repos); err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Forbidden, "member authority changed")
	}
	request, err := auth.ForOperation(operation)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, err
	}
	if !decision.Allowed {
		return auth.Authority{}, auth.Request{}, auth.Decision{}, apierr.New(apierr.Forbidden, "document command forbidden")
	}
	return fresh, request, decision, nil
}

func (s ProductCommands) CreateDocument(ctx context.Context, actor auth.Authority, spec CreateDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	request, err := auth.ForDocumentCreate(auth.DocumentCreateFacts{
		AuthorID: actor.Claims().MemberID,
		Kind:     spec.Input.Kind,
		Category: spec.Input.Category,
	})
	if err != nil {
		return DocumentView{}, err
	}
	var result DocumentView
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return DocumentView{}, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		var err error
		result, err = createDocumentInTransaction(ctx, repos, s, actor, request, spec, meta, fingerprint)
		return err
	})
	return result, err
}

func createDocumentInTransaction(ctx context.Context, repos ProductCommandRepos, s ProductCommands, actor auth.Authority, request auth.Request, spec CreateDocumentSpec, meta product.CommandMeta, fingerprint string) (DocumentView, error) {
	fresh, decision, err := authorizeCreateDocument(ctx, repos, actor, request)
	if err != nil {
		return DocumentView{}, err
	}
	claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, "createDocument", meta.IdempotencyKey, fingerprint)
	if err != nil {
		return DocumentView{}, err
	}
	if claim.Replay {
		return replayDocumentWrite[DocumentView](ctx, repos.Document, fresh, claim.Receipt)
	}
	at, err := product.UTCNow(s.Clock)
	if err != nil {
		return DocumentView{}, err
	}
	docID, revID := s.IDs(), s.IDs()
	result, err := repos.Document.StoreCreateDocument(auth.WithAuthority(ctx, fresh), CreateDocumentWrite{
		ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec,
		Locked: CreateDocumentState{SubjectID: docID}, RevisionID: &revID,
	})
	if err != nil {
		return DocumentView{}, err
	}
	if err := completeDocumentWrite(ctx, repos, claim, fresh, request, decision, docID, at, result); err != nil {
		return DocumentView{}, err
	}
	return result, nil
}

func authorizeCreateDocument(ctx context.Context, repos ProductCommandRepos, actor auth.Authority, request auth.Request) (auth.Authority, auth.Decision, error) {
	fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
	if err != nil {
		return auth.Authority{}, auth.Decision{}, err
	}
	decision, err := repos.Policy.Decide(ctx, fresh, request)
	if err != nil {
		return auth.Authority{}, auth.Decision{}, err
	}
	if !decision.Allowed {
		return auth.Authority{}, auth.Decision{}, apierr.New(apierr.Forbidden, "document command forbidden")
	}
	return fresh, decision, nil
}

func (s ProductCommands) UpdateDocument(ctx context.Context, actor auth.Authority, spec UpdateDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := validateDocumentEdit(spec.Input); err != nil {
		return DocumentView{}, err
	}
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.updateDocument", "updateDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockUpdateDocument(ctx, spec)
			if err != nil {
				return nil, err
			}
			if !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, err := repo.LockUpdateDocument(ctx, spec)
			if err != nil {
				return DocumentView{}, err
			}
			return repo.StoreUpdateDocument(ctx, UpdateDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) PublishDocument(ctx context.Context, actor auth.Authority, spec PublishDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.publishDocument", "publishDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockPublishDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, _ := repo.LockPublishDocument(ctx, spec)
			revisionID := s.IDs()
			view, err := repo.StorePublishDocument(ctx, PublishDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state, RevisionID: &revisionID,
			})
			if err != nil {
				return DocumentView{}, err
			}
			if err := recordDocumentEvents(ctx, repos, documentRevisionEvents(notification.DocumentPublished, view.Id, revisionID, fresh.Claims().MemberID, at, nil)); err != nil {
				return DocumentView{}, err
			}
			return view, nil
		},
	)
}

func (s ProductCommands) UnpublishDocument(ctx context.Context, actor auth.Authority, spec UnpublishDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.unpublishDocument", "unpublishDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockUnpublishDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, _ := repo.LockUnpublishDocument(ctx, spec)
			return repo.StoreUnpublishDocument(ctx, UnpublishDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) EditPublishedDocument(ctx context.Context, actor auth.Authority, spec EditPublishedDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := validateDocumentEdit(spec.Input); err != nil {
		return DocumentView{}, err
	}
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.editPublishedDocument", "editPublishedDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockEditPublishedDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, err := repo.LockEditPublishedDocument(ctx, spec)
			if err != nil {
				return DocumentView{}, err
			}
			body := state.RawBody
			if spec.Input.Body.Set && spec.Input.Body.Value != nil {
				body = *spec.Input.Body.Value
			}
			mentions, err := newDocumentMentions(ctx, repos.Mentions, state.RawBody, body, fresh.Claims().MemberID)
			if err != nil {
				return DocumentView{}, err
			}
			revisionID := s.IDs()
			view, err := repo.StoreEditPublishedDocument(ctx, EditPublishedDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
				RevisionID: &revisionID, NewMentionMemberIDs: mentions,
			})
			if err != nil {
				return DocumentView{}, err
			}
			if err := recordDocumentEvents(ctx, repos, documentRevisionEvents(notification.DocumentEdited, view.Id, revisionID, fresh.Claims().MemberID, at, mentions)); err != nil {
				return DocumentView{}, err
			}
			return view, nil
		},
	)
}

func (s ProductCommands) SetDocumentVisibility(ctx context.Context, actor auth.Authority, spec SetDocumentVisibilitySpec, meta product.CommandMeta) (DocumentView, error) {
	if err := validateDocumentAudience(spec.Input); err != nil {
		return DocumentView{}, err
	}
	if spec.ExpectedRevision < 1 {
		return DocumentView{}, apierr.New(apierr.Invalid, "document version required")
	}
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.setDocumentVisibility", "setDocumentVisibility", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockSetDocumentVisibility(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, _ := repo.LockSetDocumentVisibility(ctx, spec)
			return repo.StoreSetDocumentVisibility(ctx, SetDocumentVisibilityWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) DeleteDocument(ctx context.Context, actor auth.Authority, spec DeleteDocumentSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return product.CommandReceipt{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.deleteDocument", "deleteDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockDeleteDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
			repo := repos.Document
			state, _ := repo.LockDeleteDocument(ctx, spec)
			return repo.StoreDeleteDocument(ctx, DeleteDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) RestoreDocument(ctx context.Context, actor auth.Authority, spec RestoreDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.restoreDocument", "restoreDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockRestoreDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (DocumentView, error) {
			repo := repos.Document
			state, _ := repo.LockRestoreDocument(ctx, spec)
			return repo.StoreRestoreDocument(ctx, RestoreDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) AssignLieutenant(ctx context.Context, actor auth.Authority, spec AssignLieutenantSpec, meta product.CommandMeta) (LieutenantAssignmentView, error) {
	if err := commandPublicID(&spec.MemberId); err != nil {
		return LieutenantAssignmentView{}, err
	}
	if err := commandPublicID(&spec.NpcDocumentId); err != nil {
		return LieutenantAssignmentView{}, err
	}
	return runDocumentOp(ctx, s, actor, "Mutation.assignLieutenant", "assignLieutenant", spec, meta, spec.NpcDocumentId,
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (LieutenantAssignmentView, error) {
			state, err := repos.Document.LockAssignLieutenant(ctx, spec)
			if err != nil {
				return LieutenantAssignmentView{}, err
			}
			return repos.Document.StoreAssignLieutenant(ctx, AssignLieutenantWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) RevokeLieutenant(ctx context.Context, actor auth.Authority, spec RevokeLieutenantSpec, meta product.CommandMeta) (product.CommandReceipt, error) {
	if err := commandPublicID(&spec.MemberId); err != nil {
		return product.CommandReceipt{}, err
	}
	if err := commandPublicID(&spec.NpcDocumentId); err != nil {
		return product.CommandReceipt{}, err
	}
	return runDocumentOp(ctx, s, actor, "Mutation.revokeLieutenant", "revokeLieutenant", spec, meta, spec.NpcDocumentId,
		func(ctx context.Context, repos ProductCommandRepos, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
			state, err := repos.Document.LockRevokeLieutenant(ctx, spec)
			if err != nil {
				return product.CommandReceipt{}, err
			}
			return repos.Document.StoreRevokeLieutenant(ctx, RevokeLieutenantWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}
