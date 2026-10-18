package document

import (
	"context"
	"encoding/json"
	"reflect"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
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
	return auth.DocumentWriteFacts{ID: view.Id, AuthorID: view.AuthorId, Kind: view.Kind, Category: view.Category}
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
	store func(context.Context, DocumentWriteRepository, auth.Authority, time.Time) (T, error),
) (T, error) {
	var result T
	fingerprint, err := product.Fingerprint(spec)
	if err != nil {
		return result, err
	}
	err = s.Runner.Do(ctx, func(repos ProductCommandRepos) error {
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "document transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		before, err := lock(ctx, repos.Document)
		if err != nil {
			return err
		}
		request, err := auth.ForDocumentWrite(operation, documentWriteFacts(before))
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "document command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, replayName, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			return json.Unmarshal(claim.Receipt, &result)
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = store(ctx, repos.Document, fresh, at)
		if err != nil {
			return err
		}
		if decision.UsedOverride {
			if commandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, auth.OverrideFact{
				ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "document", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at,
			}); err != nil {
				return err
			}
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
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
		for _, dependency := range []any{repos.Authority, repos.Policy, repos.Replay} {
			if commandDependencyMissing(dependency) {
				return apierr.New(apierr.Internal, "document transaction dependencies required")
			}
		}
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		if fresh.Claims().MemberID == "" || fresh.Claims().MemberID != actor.Claims().MemberID {
			return apierr.New(apierr.Forbidden, "member authority changed")
		}
		request, err := auth.ForOperation(operation)
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "document command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, replayName, meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			return json.Unmarshal(claim.Receipt, &result)
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		result, err = store(ctx, repos, fresh, at)
		if err != nil {
			return err
		}
		if decision.UsedOverride {
			if commandDependencyMissing(repos.Audit) {
				return apierr.New(apierr.Internal, "override recorder required")
			}
			if err := repos.Audit.Record(ctx, auth.OverrideFact{
				ActorID: fresh.Claims().MemberID, Operation: request.Operation(), SubjectType: "document", SubjectID: subjectID, RuleCode: decision.RuleCode, At: at,
			}); err != nil {
				return err
			}
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	if err != nil {
		var zero T
		return zero, err
	}
	return result, nil
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
		fresh, err := repos.Authority(ctx, actor.Claims().MemberID)
		if err != nil {
			return err
		}
		decision, err := repos.Policy.Decide(ctx, fresh, request)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return apierr.New(apierr.Forbidden, "document command forbidden")
		}
		claim, err := repos.Replay.Claim(ctx, fresh.Claims().MemberID, "createDocument", meta.IdempotencyKey, fingerprint)
		if err != nil {
			return err
		}
		if claim.Replay {
			return json.Unmarshal(claim.Receipt, &result)
		}
		at, err := product.UTCNow(s.Clock)
		if err != nil {
			return err
		}
		docID := s.IDs()
		revID := s.IDs()
		locked := CreateDocumentState{SubjectID: docID}
		result, err = repos.Document.StoreCreateDocument(ctx, CreateDocumentWrite{
			ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: locked, RevisionID: &revID,
		})
		if err != nil {
			return err
		}
		receipt, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return repos.Replay.Complete(ctx, claim, receipt)
	})
	return result, err
}

func (s ProductCommands) UpdateDocument(ctx context.Context, actor auth.Authority, spec UpdateDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
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
			if spec.Input.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
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
			if spec.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
			state, _ := repo.LockPublishDocument(ctx, spec)
			return repo.StorePublishDocument(ctx, PublishDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
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
			if spec.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
			state, _ := repo.LockUnpublishDocument(ctx, spec)
			return repo.StoreUnpublishDocument(ctx, UnpublishDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) EditPublishedDocument(ctx context.Context, actor auth.Authority, spec EditPublishedDocumentSpec, meta product.CommandMeta) (DocumentView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.editPublishedDocument", "editPublishedDocument", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockEditPublishedDocument(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			if spec.Input.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
			state, _ := repo.LockEditPublishedDocument(ctx, spec)
			return repo.StoreEditPublishedDocument(ctx, EditPublishedDocumentWrite{
				ActorID: fresh.Claims().MemberID, At: at, Input: spec, ValidatedInput: spec, Locked: state,
			})
		},
	)
}

func (s ProductCommands) SetDocumentVisibility(ctx context.Context, actor auth.Authority, spec SetDocumentVisibilitySpec, meta product.CommandMeta) (DocumentView, error) {
	if err := commandPublicID(&spec.Id); err != nil {
		return DocumentView{}, err
	}
	return runDocumentWrite(ctx, s, actor, "Mutation.setDocumentVisibility", "setDocumentVisibility", spec, meta, spec.Id,
		func(ctx context.Context, repo DocumentWriteRepository) (*DocumentView, error) {
			state, err := repo.LockSetDocumentVisibility(ctx, spec)
			if err != nil || !state.Exists || state.Before == nil {
				return nil, apierr.New(apierr.NotFound, "document not found")
			}
			if spec.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
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
			if spec.ExpectedRevision != int32(state.Version) {
				return nil, apierr.New(apierr.Conflict, "document revision mismatch")
			}
			return state.Before, nil
		},
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (product.CommandReceipt, error) {
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
		func(ctx context.Context, repo DocumentWriteRepository, fresh auth.Authority, at time.Time) (DocumentView, error) {
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
