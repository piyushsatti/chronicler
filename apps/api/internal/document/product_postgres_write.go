package document

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) FindAvailableSlug(ctx context.Context, base string) (string, error) {
	candidate, err := p.queries().FindProductDocumentSlug(ctx, base)
	if err != nil {
		return "", mapNotFound(err)
	}
	switch typed := candidate.(type) {
	case string:
		return typed, nil
	case []byte:
		return string(typed), nil
	default:
		return "", apierr.New(apierr.Internal, "invalid slug allocation result")
	}
}

func (p *ProductPostgres) ResolveMentionHandles(ctx context.Context, handles []string) (map[string]string, error) {
	out := make(map[string]string, len(handles))
	for _, handle := range handles {
		var id pgtype.UUID
		err := p.DB.QueryRow(ctx, `SELECT public_id FROM members WHERE handle=$1`, handle).Scan(&id)
		if err != nil {
			continue
		}
		if id.Valid {
			out[handle] = db.UUIDString(id)
		}
	}
	return out, nil
}

func commandStateFromLock(row dbgen.LockProductDocumentByIDRow) (DocumentView, []string, []string, error) {
	return lockDocumentBase(row)
}

func (p *ProductPostgres) lockByID(ctx context.Context, id string) (dbgen.LockProductDocumentByIDRow, error) {
	docID, err := productDocumentID(id)
	if err != nil {
		return dbgen.LockProductDocumentByIDRow{}, err
	}
	row, err := p.queries().LockProductDocumentByID(ctx, docID)
	if err != nil {
		return dbgen.LockProductDocumentByIDRow{}, mapNotFound(err)
	}
	return row, nil
}

func writeState(view DocumentView, lieutenants, quests []string) (subjectID, ownerID string, version int64, updatedAt *time.Time, before *DocumentView) {
	copyView := view
	return view.Id, view.AuthorId, int64(view.Version), &view.UpdatedAt, &copyView
}

func (p *ProductPostgres) LockCreateDocument(context.Context, CreateDocumentSpec) (CreateDocumentState, error) {
	return CreateDocumentState{Exists: false}, nil
}

func (p *ProductPostgres) StoreCreateDocument(ctx context.Context, write CreateDocumentWrite) (DocumentView, error) {
	input := write.ValidatedInput.Input
	authorID, err := productDocumentID(write.ActorID)
	if err != nil {
		return DocumentView{}, err
	}
	publicID := write.Locked.SubjectID
	if publicID == "" {
		return DocumentView{}, apierr.New(apierr.Internal, "document id required")
	}
	docID, err := productDocumentID(publicID)
	if err != nil {
		return DocumentView{}, err
	}
	slug, err := p.FindAvailableSlug(ctx, SlugBase(input.Title))
	if err != nil {
		return DocumentView{}, err
	}
	policy, err := policyBytes(input.Policy)
	if err != nil {
		return DocumentView{}, err
	}
	fm, err := frontmatterYAML(input.Frontmatter)
	if err != nil {
		return DocumentView{}, err
	}
	revID := docID
	if write.RevisionID != nil {
		revID, err = productDocumentID(*write.RevisionID)
		if err != nil {
			return DocumentView{}, err
		}
	}
	if _, err = p.queries().InsertProductDocument(ctx, dbgen.InsertProductDocumentParams{
		ID: docID, Kind: input.Kind, Slug: slug, Title: input.Title, Category: optionalProductText(input.Category),
		Visibility: input.Visibility, Policy: policy, Body: input.Body, FrontmatterYaml: fm,
		AuthorID: authorID, At: pgNow(write.At),
	}); err != nil {
		return DocumentView{}, err
	}
	if _, err = p.queries().InsertProductDocumentRevision(ctx, dbgen.InsertProductDocumentRevisionParams{
		ID: revID, DocumentID: docID, Rev: 1, Reason: "created", Title: input.Title, Body: input.Body, FrontmatterYaml: fm,
		RecordedBy: authorID, At: pgNow(write.At), Visibility: pgtype.Text{String: input.Visibility, Valid: true},
	}); err != nil {
		return DocumentView{}, err
	}
	return p.loadDocumentView(ctx, publicID)
}

func (p *ProductPostgres) LockUpdateDocument(ctx context.Context, spec UpdateDocumentSpec) (UpdateDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return UpdateDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return UpdateDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return UpdateDocumentState{
		Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before,
		LieutenantIDs: lieutenants, LinkedQuestIDs: quests,
		RawBody: row.Body, Frontmatter: json.RawMessage(row.FrontmatterYaml.String), Policy: row.Policy,
	}, nil
}

func (p *ProductPostgres) applyDocumentUpdate(ctx context.Context, write any, id string, expected int32, mutate func(*dbgen.UpdateProductDocumentParams)) (DocumentView, error) {
	row, err := p.lockByID(ctx, id)
	if err != nil {
		return DocumentView{}, err
	}
	view, err := mapLockRow(row)
	if err != nil {
		return DocumentView{}, err
	}
	params := dbgen.UpdateProductDocumentParams{
		Title: view.Title, Category: pgtype.Text{}, Body: row.Body,
		FrontmatterYaml: row.FrontmatterYaml, Policy: row.Policy, Visibility: view.Visibility,
		Status: view.Status, PublishedAt: row.PublishedAt, PublishedBy: row.PublishedBy,
		DeletedAt: row.DeletedAt, DeletedBy: row.DeletedBy,
		ID: mustProductUUID(id), ExpectedVersion: expected,
	}
	switch w := write.(type) {
	case UpdateDocumentWrite:
		params.At = pgNow(w.At)
	case PublishDocumentWrite:
		params.At = pgNow(w.At)
	case DeleteDocumentWrite:
		params.At = pgNow(w.At)
	case RestoreDocumentWrite:
		params.At = pgNow(w.At)
	case UnpublishDocumentWrite:
		params.At = pgNow(w.At)
	case EditPublishedDocumentWrite:
		params.At = pgNow(w.At)
	case SetDocumentVisibilityWrite:
		params.At = pgNow(w.At)
	}
	if mutate != nil {
		mutate(&params)
	}
	if _, err := p.queries().UpdateProductDocument(ctx, params); err != nil {
		return DocumentView{}, mapStaleUpdate(err)
	}
	return p.loadDocumentView(ctx, id)
}

func mustProductUUID(id string) pgtype.UUID {
	parsed, err := productDocumentID(id)
	if err != nil {
		return pgtype.UUID{}
	}
	return parsed
}

func (p *ProductPostgres) StoreUpdateDocument(ctx context.Context, write UpdateDocumentWrite) (DocumentView, error) {
	spec := write.ValidatedInput
	return p.applyDocumentUpdate(ctx, write, spec.Id, spec.Input.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		if spec.Input.Title.Set {
			params.Title = *spec.Input.Title.Value
		}
		if spec.Input.Body.Set {
			params.Body = *spec.Input.Body.Value
		}
		if spec.Input.Category.Set {
			params.Category = optionalProductText(spec.Input.Category.Value)
		}
		if spec.Input.Frontmatter.Set {
			fm, err := frontmatterYAML(*spec.Input.Frontmatter.Value)
			if err == nil {
				params.FrontmatterYaml = fm
			}
		}
	})
}

func (p *ProductPostgres) LockPublishDocument(ctx context.Context, spec PublishDocumentSpec) (PublishDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return PublishDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return PublishDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return PublishDocumentState{
		Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before,
		LieutenantIDs: lieutenants, LinkedQuestIDs: quests,
		RawBody: row.Body, Frontmatter: json.RawMessage(row.FrontmatterYaml.String), Policy: row.Policy,
	}, nil
}

func (p *ProductPostgres) StorePublishDocument(ctx context.Context, write PublishDocumentWrite) (DocumentView, error) {
	spec := write.ValidatedInput
	actorID, _ := productDocumentID(write.ActorID)
	return p.applyDocumentUpdate(ctx, write, spec.Id, spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.Status = string(StatusPublished)
		params.PublishedAt = pgNow(write.At)
		params.PublishedBy = actorID
	})
}

func (p *ProductPostgres) LockUnpublishDocument(ctx context.Context, spec UnpublishDocumentSpec) (UnpublishDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return UnpublishDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return UnpublishDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return UnpublishDocumentState{Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before, LieutenantIDs: lieutenants, LinkedQuestIDs: quests}, nil
}

func (p *ProductPostgres) StoreUnpublishDocument(ctx context.Context, write UnpublishDocumentWrite) (DocumentView, error) {
	spec := write.ValidatedInput
	return p.applyDocumentUpdate(ctx, write, spec.Id, spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.Status = string(StatusDraft)
		params.PublishedAt = pgtype.Timestamptz{}
		params.PublishedBy = pgtype.UUID{}
	})
}

func (p *ProductPostgres) LockEditPublishedDocument(ctx context.Context, spec EditPublishedDocumentSpec) (EditPublishedDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return EditPublishedDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return EditPublishedDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return EditPublishedDocumentState{
		Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before,
		LieutenantIDs: lieutenants, LinkedQuestIDs: quests,
		RawBody: row.Body, Frontmatter: json.RawMessage(row.FrontmatterYaml.String), Policy: row.Policy,
	}, nil
}

func (p *ProductPostgres) StoreEditPublishedDocument(ctx context.Context, write EditPublishedDocumentWrite) (DocumentView, error) {
	return p.StoreUpdateDocument(ctx, UpdateDocumentWrite{
		ActorID: write.ActorID, At: write.At, Input: UpdateDocumentSpec{Id: write.ValidatedInput.Id, Input: write.ValidatedInput.Input},
		ValidatedInput: UpdateDocumentSpec{Id: write.ValidatedInput.Id, Input: write.ValidatedInput.Input},
	})
}

func (p *ProductPostgres) LockDeleteDocument(ctx context.Context, spec DeleteDocumentSpec) (DeleteDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return DeleteDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return DeleteDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return DeleteDocumentState{Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before, LieutenantIDs: lieutenants, LinkedQuestIDs: quests}, nil
}

func (p *ProductPostgres) StoreDeleteDocument(ctx context.Context, write DeleteDocumentWrite) (product.CommandReceipt, error) {
	spec := write.ValidatedInput
	actorID, _ := productDocumentID(write.ActorID)
	_, err := p.applyDocumentUpdate(ctx, write, spec.Id, spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.DeletedAt = pgNow(write.At)
		params.DeletedBy = actorID
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}

func (p *ProductPostgres) LockRestoreDocument(ctx context.Context, spec RestoreDocumentSpec) (RestoreDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return RestoreDocumentState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return RestoreDocumentState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return RestoreDocumentState{Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before, LieutenantIDs: lieutenants, LinkedQuestIDs: quests}, nil
}

func (p *ProductPostgres) StoreRestoreDocument(ctx context.Context, write RestoreDocumentWrite) (DocumentView, error) {
	spec := write.ValidatedInput
	return p.applyDocumentUpdate(ctx, write, spec.Id, int32(write.Locked.Version), func(params *dbgen.UpdateProductDocumentParams) {
		params.DeletedAt = pgtype.Timestamptz{}
		params.DeletedBy = pgtype.UUID{}
	})
}

func (p *ProductPostgres) LockSetDocumentVisibility(ctx context.Context, spec SetDocumentVisibilitySpec) (SetDocumentVisibilityState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return SetDocumentVisibilityState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return SetDocumentVisibilityState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return SetDocumentVisibilityState{
		Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before,
		LieutenantIDs: lieutenants, LinkedQuestIDs: quests, Readers: spec.Input.ReaderIds, Policy: row.Policy,
	}, nil
}

func (p *ProductPostgres) StoreSetDocumentVisibility(ctx context.Context, write SetDocumentVisibilityWrite) (DocumentView, error) {
	spec := write.ValidatedInput
	docID, err := productDocumentID(spec.Id)
	if err != nil {
		return DocumentView{}, err
	}
	view, err := p.applyDocumentUpdate(ctx, write, spec.Id, spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.Visibility = spec.Input.Visibility
		policy, err := policyBytes(spec.Input.Policy)
		if err == nil {
			params.Policy = policy
		}
	})
	if err != nil {
		return DocumentView{}, err
	}
	if err := p.queries().ReplaceProductDocumentReaders(ctx, docID); err != nil {
		return DocumentView{}, err
	}
	if len(spec.Input.ReaderIds) > 0 {
		readerIDs := make([]pgtype.UUID, 0, len(spec.Input.ReaderIds))
		for _, reader := range spec.Input.ReaderIds {
			id, err := productDocumentID(reader)
			if err != nil {
				return DocumentView{}, err
			}
			readerIDs = append(readerIDs, id)
		}
		if err := p.queries().InsertProductDocumentReaders(ctx, dbgen.InsertProductDocumentReadersParams{
			DocumentID: docID, ReaderIds: readerIDs,
		}); err != nil {
			return DocumentView{}, err
		}
	}
	return view, nil
}

func (p *ProductPostgres) LockAssignLieutenant(ctx context.Context, spec AssignLieutenantSpec) (AssignLieutenantState, error) {
	row, err := p.lockByID(ctx, spec.NpcDocumentId)
	if err != nil {
		return AssignLieutenantState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return AssignLieutenantState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return AssignLieutenantState{Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before, LieutenantIDs: lieutenants, LinkedQuestIDs: quests}, nil
}

func (p *ProductPostgres) StoreAssignLieutenant(ctx context.Context, write AssignLieutenantWrite) (LieutenantAssignmentView, error) {
	spec := write.ValidatedInput
	memberID, err := productDocumentID(spec.MemberId)
	if err != nil {
		return LieutenantAssignmentView{}, err
	}
	npcID, err := productDocumentID(spec.NpcDocumentId)
	if err != nil {
		return LieutenantAssignmentView{}, err
	}
	grantor, err := productDocumentID(write.ActorID)
	if err != nil {
		return LieutenantAssignmentView{}, err
	}
	if err := p.queries().AssignProductLieutenant(ctx, dbgen.AssignProductLieutenantParams{
		GrantedBy: grantor, At: pgNow(write.At), NpcDocumentID: npcID, MemberID: memberID,
	}); err != nil {
		return LieutenantAssignmentView{}, err
	}
	return LieutenantAssignmentView{
		MemberId: spec.MemberId, NpcDocumentId: spec.NpcDocumentId, GrantedAt: write.At, GrantedBy: &write.ActorID,
	}, nil
}

func (p *ProductPostgres) LockRevokeLieutenant(ctx context.Context, spec RevokeLieutenantSpec) (RevokeLieutenantState, error) {
	row, err := p.lockByID(ctx, spec.NpcDocumentId)
	if err != nil {
		return RevokeLieutenantState{}, err
	}
	view, lieutenants, quests, err := commandStateFromLock(row)
	if err != nil {
		return RevokeLieutenantState{}, err
	}
	subject, owner, version, updated, before := writeState(view, lieutenants, quests)
	return RevokeLieutenantState{Exists: true, SubjectID: subject, OwnerID: owner, Version: version, UpdatedAt: updated, Before: before, LieutenantIDs: lieutenants, LinkedQuestIDs: quests}, nil
}

func (p *ProductPostgres) StoreRevokeLieutenant(ctx context.Context, write RevokeLieutenantWrite) (product.CommandReceipt, error) {
	spec := write.ValidatedInput
	memberID, err := productDocumentID(spec.MemberId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	npcID, err := productDocumentID(spec.NpcDocumentId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	if err := p.queries().RevokeProductLieutenant(ctx, dbgen.RevokeProductLieutenantParams{
		MemberID: memberID, NpcDocumentID: npcID,
	}); err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}
