package document

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
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
	if len(handles) == 0 {
		return out, nil
	}
	rows, err := p.queries().ResolveProductMentionHandles(ctx, handles)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.Handle] = db.UUIDString(row.ID)
	}
	return out, nil
}

func (p *ProductPostgres) DocumentAuthor(ctx context.Context, documentID string) (string, error) {
	id, err := productDocumentID(documentID)
	if err != nil {
		return "", err
	}
	author, err := p.queries().ReadProductDocumentAuthor(ctx, id)
	if err != nil {
		return "", err
	}
	return db.UUIDString(author), nil
}

func (p *ProductPostgres) commandStateFromLock(ctx context.Context, row dbgen.LockProductDocumentByIDRow) (DocumentView, []string, []string, error) {
	view, lieutenants, quests, err := lockDocumentBase(row)
	if err != nil {
		return DocumentView{}, nil, nil, err
	}
	if view.Kind == "codex_entry" && view.Category != nil && *view.Category == "Locations" {
		rows, err := p.queries().LoadProductDocumentWriteFacts(ctx, dbgen.LoadProductDocumentWriteFactsParams{DocumentIds: []pgtype.UUID{row.ID}})
		if err != nil {
			return DocumentView{}, nil, nil, err
		}
		for _, fact := range rows {
			if fact.RegionID.Valid {
				view.LinkedRegionIDs = append(view.LinkedRegionIDs, db.UUIDString(fact.RegionID))
			}
		}
	}
	return view, lieutenants, quests, nil
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
	return p.storeAllocatedDocument(ctx, write, "", write.ActorID)
}

func (p *ProductPostgres) storeAllocatedDocument(ctx context.Context, write CreateDocumentWrite, slug, author string) (DocumentView, error) {
	created, err := p.insertAllocatedDocument(ctx, write, slug, author)
	if err != nil {
		return DocumentView{}, err
	}
	return p.loadDocumentView(ctx, created.ID, write.ActorID)
}

type insertedDocumentIdentity struct {
	ID      string
	Version int32
}

func (p *ProductPostgres) insertAllocatedDocument(ctx context.Context, write CreateDocumentWrite, slug, author string) (insertedDocumentIdentity, error) {
	input, err := validateAllocatedDocumentInput(write.ValidatedInput.Input)
	if err != nil {
		return insertedDocumentIdentity{}, err
	}
	authorID, err := productDocumentID(author)
	if err != nil {
		return insertedDocumentIdentity{}, err
	}
	publicID := write.Locked.SubjectID
	if publicID == "" {
		return insertedDocumentIdentity{}, apierr.New(apierr.Internal, "document id required")
	}
	docID, err := productDocumentID(publicID)
	if err != nil {
		return insertedDocumentIdentity{}, err
	}
	base := SlugBase(input.Title)
	// Keep the canonical Codex reader distinct from the /codex/new editor.
	if input.Kind == "codex_entry" && base == "new" {
		base = "new-entry"
	}
	if slug == "" {
		slug, err = p.FindAvailableSlug(ctx, base)
		if err != nil {
			return insertedDocumentIdentity{}, err
		}
	}
	policy, err := policyBytes(input.Policy)
	if err != nil {
		return insertedDocumentIdentity{}, err
	}
	fm, err := frontmatterYAML(input.Frontmatter)
	if err != nil {
		return insertedDocumentIdentity{}, err
	}
	revID := docID
	if write.RevisionID != nil {
		revID, err = productDocumentID(*write.RevisionID)
		if err != nil {
			return insertedDocumentIdentity{}, err
		}
	}
	created, err := p.queries().InsertProductDocument(ctx, dbgen.InsertProductDocumentParams{
		ID: docID, Kind: input.Kind, Slug: slug, Title: input.Title, Category: optionalProductText(input.Category),
		Visibility: input.Visibility, Policy: policy, Body: input.Body, FrontmatterYaml: fm,
		AuthorID: authorID, At: pgNow(write.At),
	})
	if err != nil {
		return insertedDocumentIdentity{}, mapDocumentWriteError(err)
	}
	actorID := mustProductUUID(write.ActorID)
	if _, err = p.queries().InsertProductDocumentRevision(ctx, dbgen.InsertProductDocumentRevisionParams{
		ID: revID, DocumentID: docID, Rev: 1, Reason: "created", Title: input.Title, Body: input.Body, FrontmatterYaml: fm,
		RecordedBy: actorID, At: pgNow(write.At), Visibility: pgtype.Text{String: input.Visibility, Valid: true}, Policy: policy,
	}); err != nil {
		return insertedDocumentIdentity{}, err
	}
	return insertedDocumentIdentity{ID: db.UUIDString(created.ID), Version: created.Version}, nil
}

func validateAllocatedDocumentInput(input DocumentDraftFields) (DocumentDraftFields, error) {
	if err := validateDocumentBody(input.Body); err != nil {
		return DocumentDraftFields{}, err
	}
	if err := validateDocumentTitle(input.Title); err != nil {
		return DocumentDraftFields{}, err
	}
	if err := validateDocumentCategory(input.Kind, input.Category); err != nil {
		return DocumentDraftFields{}, err
	}
	if err := validateDocumentVisibility(input.Visibility); err != nil {
		return DocumentDraftFields{}, err
	}
	if len(input.Frontmatter) == 0 {
		input.Frontmatter = json.RawMessage(`{}`)
	}
	if err := validateDocumentFrontmatter(input.Frontmatter); err != nil {
		return DocumentDraftFields{}, err
	}
	return input, nil
}

func (p *ProductPostgres) LockUpdateDocument(ctx context.Context, spec UpdateDocumentSpec) (UpdateDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return UpdateDocumentState{}, err
	}
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
		Title: view.Title, Category: row.Category, Body: row.Body,
		FrontmatterYaml: row.FrontmatterYaml, Policy: row.Policy, Visibility: view.Visibility,
		Status: view.Status, PublishedAt: row.PublishedAt, PublishedBy: row.PublishedBy,
		DeletedAt: row.DeletedAt, DeletedBy: row.DeletedBy,
		ID: mustProductUUID(id), ExpectedVersion: expected,
	}
	metadata, err := documentUpdateMetadataFor(&params, row, write)
	if err != nil {
		return DocumentView{}, err
	}
	if mutate != nil {
		mutate(&params)
	}
	revID := uuid.NewString()
	if metadata.revisionID != nil {
		revID = *metadata.revisionID
	}
	parsedRevisionID, err := productDocumentID(revID)
	if err != nil {
		return DocumentView{}, err
	}
	if metadata.mentions == nil {
		metadata.mentions = []string{}
	}
	provenance, err := json.Marshal(struct {
		NewMentionMemberIDs []string `json:"newMentionMemberIds"`
	}{metadata.mentions})
	if err != nil {
		return DocumentView{}, err
	}
	if _, err := p.queries().UpdateProductDocument(ctx, params); err != nil {
		return DocumentView{}, mapDocumentWriteError(mapStaleUpdate(err))
	}
	rev, err := p.queries().NextProductDocumentRevision(ctx, params.ID)
	if err != nil {
		return DocumentView{}, err
	}
	if _, err := p.queries().InsertProductDocumentRevision(ctx, dbgen.InsertProductDocumentRevisionParams{
		ID: parsedRevisionID, DocumentID: params.ID, Rev: rev, Reason: metadata.reason,
		Title: params.Title, Body: params.Body, FrontmatterYaml: params.FrontmatterYaml,
		RecordedBy: mustProductUUID(metadata.actorID), At: params.At, Policy: params.Policy,
		PublishedAt: params.PublishedAt, PublishedBy: params.PublishedBy,
		Visibility: pgtype.Text{String: params.Visibility, Valid: true},
		NewValue:   provenance,
	}); err != nil {
		return DocumentView{}, err
	}
	return p.loadDocumentView(ctx, id, metadata.actorID)
}

type documentUpdateMetadata struct {
	actorID    string
	revisionID *string
	mentions   []string
	reason     string
}

func documentUpdateMetadataFor(params *dbgen.UpdateProductDocumentParams, row dbgen.LockProductDocumentByIDRow, write any) (documentUpdateMetadata, error) {
	metadata := documentUpdateMetadata{reason: "updated"}
	switch w := write.(type) {
	case UpdateDocumentWrite:
		params.At, metadata.actorID = pgNow(w.At), w.ActorID
		metadata.revisionID, metadata.mentions = w.RevisionID, w.NewMentionMemberIDs
	case PublishDocumentWrite:
		if row.Status != "draft" || row.DeletedAt.Valid {
			return documentUpdateMetadata{}, apierr.New(apierr.Conflict, "only a live draft can be published")
		}
		params.At, metadata.actorID, metadata.reason, metadata.revisionID = pgNow(w.At), w.ActorID, "published", w.RevisionID
	case DeleteDocumentWrite:
		if row.DeletedAt.Valid {
			return documentUpdateMetadata{}, apierr.New(apierr.NotFound, "document not found")
		}
		params.At, metadata.actorID, metadata.reason = pgNow(w.At), w.ActorID, "deleted"
	case RestoreDocumentWrite:
		if !row.DeletedAt.Valid {
			return documentUpdateMetadata{}, apierr.New(apierr.Conflict, "document is not in trash")
		}
		params.At, metadata.actorID, metadata.reason = pgNow(w.At), w.ActorID, "restored"
	case UnpublishDocumentWrite:
		if row.Status != "published" || row.DeletedAt.Valid {
			return documentUpdateMetadata{}, apierr.New(apierr.Conflict, "only a live published document can be unpublished")
		}
		params.At, metadata.actorID, metadata.reason = pgNow(w.At), w.ActorID, "unpublished"
	case EditPublishedDocumentWrite:
		params.At, metadata.actorID = pgNow(w.At), w.ActorID
		metadata.revisionID, metadata.mentions = w.RevisionID, w.NewMentionMemberIDs
	case SetDocumentVisibilityWrite:
		params.At, metadata.actorID, metadata.reason = pgNow(w.At), w.ActorID, "audience_changed"
	}
	return metadata, nil
}

func mustProductUUID(id string) pgtype.UUID {
	parsed, err := productDocumentID(id)
	if err != nil {
		return pgtype.UUID{}
	}
	return parsed
}

func (p *ProductPostgres) StoreUpdateDocument(ctx context.Context, write UpdateDocumentWrite) (DocumentView, error) {
	return p.storeDocumentEdit(ctx, write, false)
}

func (p *ProductPostgres) storeDocumentEdit(ctx context.Context, write UpdateDocumentWrite, published bool) (DocumentView, error) {
	spec := write.ValidatedInput
	if err := validateDocumentEdit(spec.Input); err != nil {
		return DocumentView{}, err
	}
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return DocumentView{}, err
	}
	if row.DeletedAt.Valid {
		return DocumentView{}, apierr.New(apierr.NotFound, "document not found")
	}
	if (row.Status == "published") != published {
		return DocumentView{}, apierr.New(apierr.Conflict, "document publication state changed")
	}
	if spec.Input.Category.Set {
		if err := validateDocumentCategory(row.Kind, spec.Input.Category.Value); err != nil {
			return DocumentView{}, err
		}
	}
	var fm pgtype.Text
	if spec.Input.Frontmatter.Set {
		var err error
		fm, err = frontmatterYAML(*spec.Input.Frontmatter.Value)
		if err != nil {
			return DocumentView{}, err
		}
	}
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
			params.FrontmatterYaml = fm
		}
	})
}

func (p *ProductPostgres) LockPublishDocument(ctx context.Context, spec PublishDocumentSpec) (PublishDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return PublishDocumentState{}, err
	}
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	return p.storeDocumentEdit(ctx, UpdateDocumentWrite{
		ActorID: write.ActorID, At: write.At, Input: UpdateDocumentSpec{Id: write.ValidatedInput.Id, Input: write.ValidatedInput.Input},
		ValidatedInput: UpdateDocumentSpec{Id: write.ValidatedInput.Id, Input: write.ValidatedInput.Input},
		RevisionID:     write.RevisionID, NewMentionMemberIDs: write.NewMentionMemberIDs,
	}, true)
}

func (p *ProductPostgres) LockDeleteDocument(ctx context.Context, spec DeleteDocumentSpec) (DeleteDocumentState, error) {
	row, err := p.lockByID(ctx, spec.Id)
	if err != nil {
		return DeleteDocumentState{}, err
	}
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	var policy []byte
	if spec.Input.Policy.Set && spec.Input.Policy.Value != nil {
		policy, err = policyBytes(*spec.Input.Policy.Value)
		if err != nil {
			return DocumentView{}, err
		}
		if policy == nil {
			policy = []byte("[]")
		}
	}
	return p.applyDocumentUpdate(ctx, write, spec.Id, spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.Visibility = spec.Input.Visibility
		if spec.Input.Policy.Set {
			params.Policy = policy
		}
	})
}

func (p *ProductPostgres) LockAssignLieutenant(ctx context.Context, spec AssignLieutenantSpec) (AssignLieutenantState, error) {
	row, err := p.lockByID(ctx, spec.NpcDocumentId)
	if err != nil {
		return AssignLieutenantState{}, err
	}
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
	view, lieutenants, quests, err := p.commandStateFromLock(ctx, row)
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
