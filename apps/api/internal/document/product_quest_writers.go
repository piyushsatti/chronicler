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
		fmJSON, err := frontmatterJSON(row.FrontmatterYaml)
		if err != nil {
			return WriteResult{}, err
		}
		var fm map[string]json.RawMessage
		if err := json.Unmarshal(fmJSON, &fm); err != nil {
			return WriteResult{}, err
		}
		delete(fm, "additional_info")
		if spec.AdditionalInfo.Value != nil {
			value, err := json.Marshal(*spec.AdditionalInfo.Value)
			if err != nil {
				return WriteResult{}, err
			}
			fm["additional_info"] = value
		}
		encoded, err := json.Marshal(fm)
		if err != nil {
			return WriteResult{}, err
		}
		raw := json.RawMessage(encoded)
		input.Frontmatter = product.Optional[json.RawMessage]{Set: true, Value: &raw}
	}
	update := UpdateDocumentSpec{Id: spec.DocumentID, Input: input}
	revisionID := uuid.NewString()
	mentions := []string{}
	if row.Status == "published" && spec.Body.Set && spec.Body.Value != nil {
		mentions, err = newDocumentMentions(ctx, p, row.Body, *spec.Body.Value, actor.Claims().MemberID)
		if err != nil {
			return WriteResult{}, err
		}
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

func (p *ProductPostgres) WriteSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error) {
	return p.StoreSummary(ctx, actor, spec)
}

func (p *ProductPostgres) StoreSummary(ctx context.Context, actor auth.Authority, spec SummaryWrite) (WriteResult, error) {
	if err := validateDocumentBody(spec.Body); err != nil {
		return WriteResult{}, err
	}
	if len(spec.QuestIDs) == 0 {
		return WriteResult{}, apierr.New(apierr.Invalid, "summary quests required")
	}
	if spec.DocumentID != nil && (spec.ExpectedRevision == nil || *spec.ExpectedRevision < 1) {
		return WriteResult{}, apierr.New(apierr.Invalid, "summary version required")
	}
	if err := validateDocumentTitle(spec.Title); err != nil {
		return WriteResult{}, err
	}
	if err := validateDocumentVisibility(spec.Visibility); err != nil {
		return WriteResult{}, err
	}
	if len(spec.Frontmatter) == 0 {
		spec.Frontmatter = json.RawMessage(`{}`)
	}
	if err := validateDocumentFrontmatter(spec.Frontmatter); err != nil {
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
	if characterID.Valid {
		character, err := p.queries().GetCharacter(ctx, characterID)
		if err != nil {
			return WriteResult{}, mapNotFound(err)
		}
		if db.UUIDString(character.OwnerID) != actor.Claims().MemberID && !actor.Claims().Has(auth.Admin) && !actor.IsPlatformOwner() {
			return WriteResult{}, apierr.New(apierr.Forbidden, "summary character owner required")
		}
	}
	questIDs := make([]pgtype.UUID, 0, len(spec.QuestIDs))
	requested := map[string]bool{}
	for _, id := range spec.QuestIDs {
		parsed, err := productDocumentID(id)
		if err != nil {
			return WriteResult{}, err
		}
		if !requested[id] {
			questIDs = append(questIDs, parsed)
			requested[id] = true
		}
	}
	locked, err := p.queries().LockProductSummaryQuests(ctx, dbgen.LockProductSummaryQuestsParams{QuestIds: questIDs, DocumentID: docID})
	if err != nil {
		return WriteResult{}, err
	}
	for _, id := range locked {
		delete(requested, db.UUIDString(id))
	}
	if len(requested) != 0 {
		return WriteResult{}, apierr.New(apierr.NotFound, "summary quest not found")
	}
	ctx = auth.WithAuthority(ctx, actor)
	var result DocumentView
	var events []notification.Event
	if spec.DocumentID == nil {
		id, revID := uuid.NewString(), uuid.NewString()
		input := CreateDocumentSpec{Input: DocumentDraftFields{
			Kind: "summary", Title: spec.Title, Body: spec.Body, Visibility: spec.Visibility, Frontmatter: spec.Frontmatter,
		}}
		result, err = p.storeAllocatedDocument(ctx, CreateDocumentWrite{
			ActorID: actor.Claims().MemberID, At: spec.At, Input: input, ValidatedInput: input,
			Locked: CreateDocumentState{SubjectID: id}, RevisionID: &revID,
		}, "summary-"+strings.ReplaceAll(id, "-", ""), actor.Claims().MemberID)
	} else {
		row, lockErr := p.lockByID(ctx, *spec.DocumentID)
		if lockErr != nil {
			return WriteResult{}, lockErr
		}
		view, err := mapLockRow(row)
		if err != nil {
			return WriteResult{}, err
		}
		if err := admitDocumentDisclosure(view, actor); err != nil {
			return WriteResult{}, err
		}
		if row.Kind != "summary" || row.DeletedAt.Valid {
			return WriteResult{}, apierr.New(apierr.Invalid, "summary document required")
		}
		if db.UUIDString(row.AuthorID) != actor.Claims().MemberID && !actor.Claims().Has(auth.Admin) && !actor.IsPlatformOwner() {
			return WriteResult{}, apierr.New(apierr.Forbidden, "summary author required")
		}
		if err := completeBodyForWrite(view, row.Body, actor); err != nil {
			return WriteResult{}, err
		}
		if *spec.ExpectedRevision != row.Version {
			return WriteResult{}, apierr.New(apierr.Conflict, "document revision mismatch")
		}
		fm, err := frontmatterYAML(spec.Frontmatter)
		if err != nil {
			return WriteResult{}, err
		}
		revisionID := uuid.NewString()
		mentions := []string{}
		if row.Status == "published" {
			mentions, err = newDocumentMentions(ctx, p, row.Body, spec.Body, actor.Claims().MemberID)
			if err != nil {
				return WriteResult{}, err
			}
			events = documentRevisionEvents(notification.DocumentEdited, *spec.DocumentID, revisionID, actor.Claims().MemberID, spec.At, mentions)
		}
		result, err = p.applyDocumentUpdate(ctx, UpdateDocumentWrite{ActorID: actor.Claims().MemberID, At: spec.At, RevisionID: &revisionID, NewMentionMemberIDs: mentions}, *spec.DocumentID, *spec.ExpectedRevision, func(params *dbgen.UpdateProductDocumentParams) {
			params.Title, params.Body, params.Visibility = spec.Title, spec.Body, spec.Visibility
			params.FrontmatterYaml = fm
		})
	}
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

var _ BriefWriter = (*ProductPostgres)(nil)
var _ SummaryWriter = (*ProductPostgres)(nil)
