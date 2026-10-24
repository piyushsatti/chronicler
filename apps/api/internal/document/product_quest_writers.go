package document

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) CreateBrief(ctx context.Context, actor auth.Authority, spec BriefCreate) (WriteResult, error) {
	if _, err := productDocumentID(spec.QuestID); err != nil {
		return WriteResult{}, err
	}
	if _, err := productDocumentID(spec.DMID); err != nil {
		return WriteResult{}, err
	}
	fm := map[string]any{}
	if spec.AdditionalInfo != nil {
		fm["additional_info"] = *spec.AdditionalInfo
	}
	frontmatter, err := json.Marshal(fm)
	if err != nil {
		return WriteResult{}, err
	}
	id, revID := uuid.NewString(), uuid.NewString()
	input := CreateDocumentSpec{Input: DocumentDraftFields{
		Kind: "quest_brief", Title: spec.Title, Body: spec.Body, Visibility: "public", Frontmatter: frontmatter,
	}}
	ctx = auth.WithAuthority(ctx, actor)
	created, err := p.insertAllocatedDocument(ctx, CreateDocumentWrite{
		ActorID: actor.Claims().MemberID, At: spec.At, Input: input, ValidatedInput: input,
		Locked: CreateDocumentState{SubjectID: id}, RevisionID: &revID,
	}, "quest-"+strings.ReplaceAll(spec.QuestID, "-", ""), spec.DMID)
	if err != nil {
		return WriteResult{}, err
	}
	publish := PublishDocumentSpec{Id: created.ID, ExpectedRevision: created.Version}
	publishRevisionID := uuid.NewString()
	view, err := p.StorePublishDocument(ctx, PublishDocumentWrite{
		ActorID: actor.Claims().MemberID, At: spec.At, Input: publish, ValidatedInput: publish,
		RevisionID: &publishRevisionID,
	})
	if err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Document: view, Events: documentRevisionEvents(notification.DocumentPublished, id, publishRevisionID, actor.Claims().MemberID, spec.At, nil)}, nil
}

func (p *ProductPostgres) EditBrief(ctx context.Context, actor auth.Authority, spec BriefEdit) (WriteResult, error) {
	row, err := p.lockByID(ctx, spec.DocumentID)
	if err != nil {
		return WriteResult{}, err
	}
	view, err := mapLockRow(row)
	if err != nil {
		return WriteResult{}, err
	}
	if err := admitDocumentDisclosure(view, actor); err != nil {
		return WriteResult{}, err
	}
	if row.Kind != "quest_brief" || row.DeletedAt.Valid {
		return WriteResult{}, apierr.New(apierr.Invalid, "quest brief required")
	}
	if spec.ExpectedVersion != 0 && spec.ExpectedVersion != int64(row.Version) {
		return WriteResult{}, apierr.New(apierr.Conflict, "document revision mismatch")
	}
	if spec.Body.Set {
		if err := completeBodyForWrite(view, row.Body, actor); err != nil {
			return WriteResult{}, err
		}
	}
	input := DocumentEditFields{ExpectedRevision: row.Version, Title: spec.Title, Body: spec.Body}
	if spec.AdditionalInfo.Set {
		frontmatter, err := briefAdditionalInfoFrontmatter(row.FrontmatterYaml, spec.AdditionalInfo.Value)
		if err != nil {
			return WriteResult{}, err
		}
		input.Frontmatter = frontmatter
	}
	update := UpdateDocumentSpec{Id: spec.DocumentID, Input: input}
	revisionID := uuid.NewString()
	mentions, err := briefMentionRecipients(ctx, p, actor, row, spec.Body)
	if err != nil {
		return WriteResult{}, err
	}
	updated, err := p.storeDocumentEdit(auth.WithAuthority(ctx, actor), UpdateDocumentWrite{
		ActorID: actor.Claims().MemberID, At: spec.At, Input: update, ValidatedInput: update,
		RevisionID: &revisionID, NewMentionMemberIDs: mentions,
	}, row.Status == "published")
	if err != nil {
		return WriteResult{}, err
	}
	result := WriteResult{Document: updated}
	if row.Status == "published" {
		result.Events = documentRevisionEvents(notification.DocumentEdited, updated.Id, revisionID, actor.Claims().MemberID, spec.At, mentions)
	}
	return result, nil
}

func briefAdditionalInfoFrontmatter(raw pgtype.Text, value *string) (product.Optional[json.RawMessage], error) {
	fmJSON, err := frontmatterJSON(raw)
	if err != nil {
		return product.Optional[json.RawMessage]{}, err
	}
	var fm map[string]json.RawMessage
	if err := json.Unmarshal(fmJSON, &fm); err != nil {
		return product.Optional[json.RawMessage]{}, err
	}
	delete(fm, "additional_info")
	if value != nil {
		encoded, err := json.Marshal(*value)
		if err != nil {
			return product.Optional[json.RawMessage]{}, err
		}
		fm["additional_info"] = encoded
	}
	encoded, err := json.Marshal(fm)
	if err != nil {
		return product.Optional[json.RawMessage]{}, err
	}
	frontmatter := json.RawMessage(encoded)
	return product.Optional[json.RawMessage]{Set: true, Value: &frontmatter}, nil
}

func briefMentionRecipients(ctx context.Context, reader MentionMemberReader, actor auth.Authority, row dbgen.LockProductDocumentByIDRow, body product.Optional[string]) ([]string, error) {
	if row.Status != "published" || !body.Set || body.Value == nil {
		return []string{}, nil
	}
	return newDocumentMentions(ctx, reader, row.Body, *body.Value, actor.Claims().MemberID)
}

func (p *ProductPostgres) WriteSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error) {
	return p.StoreSummary(ctx, actor, spec)
}

func (p *ProductPostgres) StoreSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error) {
	if err := validateSummaryFields(&spec); err != nil {
		return WriteResult{}, err
	}
	docID, err := optionalProductUUID(spec.DocumentID)
	if err != nil {
		return WriteResult{}, err
	}
	characterID, err := optionalProductUUID(spec.CharacterID)
	if err != nil {
		return WriteResult{}, err
	}
	if err := p.validateSummaryCharacter(ctx, actor, characterID); err != nil {
		return WriteResult{}, err
	}
	questIDs, err := p.lockSummaryQuests(ctx, spec.QuestIDs, docID)
	if err != nil {
		return WriteResult{}, err
	}
	ctx = auth.WithAuthority(ctx, actor)
	result, events, err := p.storeSummaryContent(ctx, actor, spec)
	if err != nil {
		return WriteResult{}, err
	}
	if err := p.queries().ReplaceProductSummaryLinks(ctx, dbgen.ReplaceProductSummaryLinksParams{
		DocumentID: mustProductUUID(result.Id), QuestIds: questIDs, CharacterID: characterID,
	}); err != nil {
		return WriteResult{}, err
	}
	return WriteResult{Document: result, Events: events}, nil
}

func (p *ProductPostgres) storeSummaryContent(ctx context.Context, actor auth.Authority, spec SummaryWrite) (DocumentView, []notification.Event, error) {
	if spec.DocumentID == nil {
		return p.createSummaryDocument(ctx, actor, spec)
	}
	return p.updateSummaryDocument(ctx, actor, spec)
}

func (p *ProductPostgres) createSummaryDocument(ctx context.Context, actor auth.Authority, spec SummaryWrite) (DocumentView, []notification.Event, error) {
	id, revID := uuid.NewString(), uuid.NewString()
	input := CreateDocumentSpec{Input: DocumentDraftFields{
		Kind: "summary", Title: spec.Title, Body: spec.Body, Visibility: spec.Visibility, Frontmatter: spec.Frontmatter,
	}}
	view, err := p.storeAllocatedDocument(ctx, CreateDocumentWrite{
		ActorID: actor.Claims().MemberID, At: spec.At, Input: input, ValidatedInput: input,
		Locked: CreateDocumentState{SubjectID: id}, RevisionID: &revID,
	}, "summary-"+strings.ReplaceAll(id, "-", ""), actor.Claims().MemberID)
	return view, nil, err
}

func (p *ProductPostgres) updateSummaryDocument(ctx context.Context, actor auth.Authority, spec SummaryWrite) (DocumentView, []notification.Event, error) {
	row, err := p.lockByID(ctx, *spec.DocumentID)
	if err != nil {
		return DocumentView{}, nil, err
	}
	if err := admitSummaryUpdate(row, actor, *spec.ExpectedRevision); err != nil {
		return DocumentView{}, nil, err
	}
	fm, err := frontmatterYAML(spec.Frontmatter)
	if err != nil {
		return DocumentView{}, nil, err
	}
	revisionID := uuid.NewString()
	mentions, events, err := summaryUpdateNotices(ctx, p, actor, spec, row, revisionID)
	if err != nil {
		return DocumentView{}, nil, err
	}
	updated, err := p.applyDocumentUpdate(ctx, UpdateDocumentWrite{ActorID: actor.Claims().MemberID, At: spec.At, RevisionID: &revisionID, NewMentionMemberIDs: mentions}, *spec.DocumentID, *spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
		params.Title, params.Body, params.Visibility = spec.Title, spec.Body, spec.Visibility
		params.FrontmatterYaml = fm
	})
	if err != nil {
		return DocumentView{}, nil, err
	}
	return updated, events, nil
}

func admitSummaryUpdate(row dbgen.LockProductDocumentByIDRow, actor auth.Authority, expected int32) error {
	view, err := mapLockRow(row)
	if err != nil {
		return err
	}
	if err := admitDocumentDisclosure(view, actor); err != nil {
		return err
	}
	if row.Kind != "summary" || row.DeletedAt.Valid {
		return apierr.New(apierr.Invalid, "summary document required")
	}
	if db.UUIDString(row.AuthorID) != actor.Claims().MemberID && !actor.Claims().Has(auth.Admin) && !actor.IsPlatformOwner() {
		return apierr.New(apierr.Forbidden, "summary author required")
	}
	if err := completeBodyForWrite(view, row.Body, actor); err != nil {
		return err
	}
	if expected != row.Version {
		return apierr.New(apierr.Conflict, "document revision mismatch")
	}
	return nil
}

func summaryUpdateNotices(ctx context.Context, writer MentionMemberReader, actor auth.Authority, spec SummaryWrite, row dbgen.LockProductDocumentByIDRow, revisionID string) ([]string, []notification.Event, error) {
	mentions := []string{}
	if row.Status != "published" {
		return mentions, nil, nil
	}
	mentions, err := newDocumentMentions(ctx, writer, row.Body, spec.Body, actor.Claims().MemberID)
	if err != nil {
		return nil, nil, err
	}
	events := documentRevisionEvents(notification.DocumentEdited, *spec.DocumentID, revisionID, actor.Claims().MemberID, spec.At, mentions)
	return mentions, events, nil
}

func validateSummaryFields(spec *SummaryWrite) error {
	if err := validateDocumentBody(spec.Body); err != nil {
		return err
	}
	if len(spec.QuestIDs) == 0 {
		return apierr.New(apierr.Invalid, "summary quests required")
	}
	if spec.DocumentID != nil && (spec.ExpectedRevision == nil || *spec.ExpectedRevision < 1) {
		return apierr.New(apierr.Invalid, "summary version required")
	}
	if err := validateDocumentTitle(spec.Title); err != nil {
		return err
	}
	if err := validateDocumentVisibility(spec.Visibility); err != nil {
		return err
	}
	if len(spec.Frontmatter) == 0 {
		spec.Frontmatter = json.RawMessage(`{}`)
	}
	return validateDocumentFrontmatter(spec.Frontmatter)
}

func (p *ProductPostgres) validateSummaryCharacter(ctx context.Context, actor auth.Authority, characterID pgtype.UUID) error {
	if !characterID.Valid {
		return nil
	}
	character, err := p.queries().GetCharacter(ctx, characterID)
	if err != nil {
		return mapNotFound(err)
	}
	if db.UUIDString(character.OwnerID) != actor.Claims().MemberID && !actor.Claims().Has(auth.Admin) && !actor.IsPlatformOwner() {
		return apierr.New(apierr.Forbidden, "summary character owner required")
	}
	return nil
}

func (p *ProductPostgres) lockSummaryQuests(ctx context.Context, ids []string, documentID pgtype.UUID) ([]pgtype.UUID, error) {
	questIDs := make([]pgtype.UUID, 0, len(ids))
	requested := map[string]bool{}
	for _, id := range ids {
		parsed, err := productDocumentID(id)
		if err != nil {
			return nil, err
		}
		if !requested[id] {
			questIDs = append(questIDs, parsed)
			requested[id] = true
		}
	}
	locked, err := p.queries().LockProductSummaryQuests(ctx, dbgen.LockProductSummaryQuestsParams{QuestIds: questIDs, DocumentID: documentID})
	if err != nil {
		return nil, err
	}
	for _, id := range locked {
		delete(requested, db.UUIDString(id))
	}
	if len(requested) != 0 {
		return nil, apierr.New(apierr.NotFound, "summary quest not found")
	}
	return questIDs, nil
}

var _ BriefWriter = (*ProductPostgres)(nil)
var _ SummaryWriter = (*ProductPostgres)(nil)
