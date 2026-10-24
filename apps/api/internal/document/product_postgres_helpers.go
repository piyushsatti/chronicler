package document

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"gopkg.in/yaml.v3"
)

func (p *ProductPostgres) queries() *dbgen.Queries { return dbgen.New(p.DB) }

func productDocumentID(value string) (pgtype.UUID, error) {
	id, err := db.ParseUUID(value)
	if err != nil || db.UUIDString(id) != value {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid document id")
	}
	return id, nil
}

func optionalProductUUID(value *string) (pgtype.UUID, error) {
	if value == nil {
		return pgtype.UUID{}, nil
	}
	return productDocumentID(*value)
}

func optionalProductText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func productTextPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	out := value.String
	return &out
}

func productTimePointer(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	out := value.Time
	return &out
}

func productUUIDPointer(value pgtype.UUID) *string {
	if !value.Valid {
		return nil
	}
	out := db.UUIDString(value)
	return &out
}

func uuidStringsFromAny(value any) ([]string, error) {
	switch typed := value.(type) {
	case nil:
		return nil, nil
	case []pgtype.UUID:
		out := make([]string, 0, len(typed))
		for _, id := range typed {
			if id.Valid {
				out = append(out, db.UUIDString(id))
			}
		}
		return out, nil
	case []interface{}:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			switch id := item.(type) {
			case [16]uint8:
				out = append(out, db.UUIDString(pgtype.UUID{Bytes: id, Valid: true}))
			case pgtype.UUID:
				if id.Valid {
					out = append(out, db.UUIDString(id))
				}
			default:
				return nil, errors.New("unexpected uuid array element")
			}
		}
		return out, nil
	default:
		return nil, errors.New("unexpected uuid array type")
	}
}

func policyTokens(raw []byte) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var tokens []string
	if err := json.Unmarshal(raw, &tokens); err != nil {
		if !json.Valid(raw) {
			return nil, err
		}
		// The canonical Specification denies malformed policies, including legacy objects.
		return []string{}, nil
	}
	if !Specify(Document{Policy: raw}).valid {
		return []string{}, nil
	}
	return tokens, nil
}

func policyBytes(tokens []string) ([]byte, error) {
	if tokens == nil {
		return nil, nil
	}
	return json.Marshal(tokens)
}

func frontmatterJSON(raw pgtype.Text) (json.RawMessage, error) {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return json.RawMessage(`{}`), nil
	}
	var node yaml.Node
	if err := yaml.Unmarshal([]byte(raw.String), &node); err != nil {
		return nil, apierr.New(apierr.Internal, "invalid stored document frontmatter")
	}
	if len(node.Content) == 0 || node.Content[0].Tag == "!!null" {
		return json.RawMessage(`{}`), nil
	}
	decoded, err := frontmatterNodeValue(node.Content[0])
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(decoded)
	if err != nil {
		return nil, err
	}
	return encoded, nil
}

func frontmatterYAML(raw json.RawMessage) (pgtype.Text, error) {
	if len(raw) == 0 || bytesEqualJSONNull(raw) {
		return pgtype.Text{}, nil
	}
	if !json.Valid(raw) {
		return pgtype.Text{}, apierr.New(apierr.Invalid, "invalid document frontmatter")
	}
	var node yaml.Node
	if err := yaml.Unmarshal(raw, &node); err != nil {
		return pgtype.Text{}, err
	}
	out, err := yaml.Marshal(&node)
	if err != nil {
		return pgtype.Text{}, err
	}
	return pgtype.Text{String: string(out), Valid: true}, nil
}

func frontmatterNodeValue(node *yaml.Node) (any, error) {
	switch node.Kind {
	case yaml.MappingNode:
		return frontmatterMappingValue(node)
	case yaml.SequenceNode:
		return frontmatterSequenceValue(node)
	case yaml.ScalarNode:
		switch node.Tag {
		case "!!str":
			return node.Value, nil
		case "!!null":
			return nil, nil
		case "!!bool":
			return strings.EqualFold(node.Value, "true"), nil
		case "!!int", "!!float":
			if json.Valid([]byte(node.Value)) {
				return json.Number(node.Value), nil
			}
		}
	}
	return nil, apierr.New(apierr.Internal, "unsupported stored document frontmatter")
}

func frontmatterMappingValue(node *yaml.Node) (any, error) {
	value := make(map[string]any, len(node.Content)/2)
	for i := 0; i < len(node.Content); i += 2 {
		key := node.Content[i]
		if key.Tag != "!!str" {
			return nil, apierr.New(apierr.Internal, "invalid stored frontmatter key")
		}
		if _, exists := value[key.Value]; exists {
			return nil, apierr.New(apierr.Internal, "duplicate stored frontmatter key")
		}
		item, err := frontmatterNodeValue(node.Content[i+1])
		if err != nil {
			return nil, err
		}
		value[key.Value] = item
	}
	return value, nil
}

func frontmatterSequenceValue(node *yaml.Node) (any, error) {
	value := make([]any, len(node.Content))
	for i := range node.Content {
		item, err := frontmatterNodeValue(node.Content[i])
		if err != nil {
			return nil, err
		}
		value[i] = item
	}
	return value, nil
}

func bytesEqualJSONNull(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed == "" || trimmed == "null"
}

func (p *ProductPostgres) viewerScope(ctx context.Context, actor auth.Authority) (ViewerScope, error) {
	scope := ScopeFromAuthority(actor)
	if scope.Anonymous || scope.MemberID == "" {
		return scope, nil
	}
	memberID, err := productDocumentID(scope.MemberID)
	if err != nil {
		return ViewerScope{}, err
	}
	readerDocIDs, err := p.queries().ListDocumentReaders(ctx, memberID)
	if err != nil {
		return ViewerScope{}, err
	}
	scope.ReaderOf = make(map[string]struct{}, len(readerDocIDs))
	for _, id := range readerDocIDs {
		if id.Valid {
			scope.ReaderOf[db.UUIDString(id)] = struct{}{}
		}
	}
	return scope, nil
}

func viewerParams(scope ViewerScope) (pgtype.UUID, []string, string, bool, bool) {
	sql := SQLScope(scope)
	return sql.ID, sql.Roles, sql.Handle, sql.Admin, sql.LiveDM
}

func documentFromParts(
	id pgtype.UUID,
	kind, slug, title, status, visibility, body string,
	category pgtype.Text,
	policy []byte,
	frontmatter pgtype.Text,
	authorID pgtype.UUID,
	publishedAt, deletedAt pgtype.Timestamptz,
	deletedBy pgtype.UUID,
	updatedAt pgtype.Timestamptz,
	version int32,
) (DocumentView, error) {
	policyTokens, err := policyTokens(policy)
	if err != nil {
		return DocumentView{}, err
	}
	fm, err := frontmatterJSON(frontmatter)
	if err != nil {
		return DocumentView{}, err
	}
	return DocumentView{
		Id:          db.UUIDString(id),
		Kind:        kind,
		Slug:        slug,
		Title:       title,
		Category:    productTextPointer(category),
		Status:      status,
		Visibility:  visibility,
		Policy:      policyTokens,
		Frontmatter: fm,
		AuthorId:    db.UUIDString(authorID),
		PublishedAt: productTimePointer(publishedAt),
		DeletedAt:   productTimePointer(deletedAt),
		DeletedBy:   productUUIDPointer(deletedBy),
		UpdatedAt:   updatedAt.Time,
		Version:     version,
	}, nil
}

func projectDocumentView(ctx context.Context, scope ViewerScope, view DocumentView, rawBody string) (DocumentView, error) {
	policyJSON, err := json.Marshal(view.Policy)
	if err != nil {
		return DocumentView{}, err
	}
	if view.Policy == nil {
		policyJSON = nil
	}
	doc := Document{
		ID:         view.Id,
		Kind:       view.Kind,
		Slug:       view.Slug,
		Title:      view.Title,
		Status:     Status(view.Status),
		Visibility: Visibility(view.Visibility),
		AuthorID:   view.AuthorId,
		Body:       rawBody,
		Policy:     policyJSON,
	}
	projected, err := projectDocument(ctx, doc, scope)
	if err != nil {
		return DocumentView{}, err
	}
	body := projected.Body
	view.EffectiveBody = &body
	view.BodyComplete = projected.BodyComplete
	return view, nil
}

func mapReadableDocumentRow(
	readable bool,
	adminOverride any,
	rowID pgtype.UUID,
	kind, slug, title, status, visibility, body string,
	category pgtype.Text,
	policy []byte,
	frontmatter pgtype.Text,
	authorID pgtype.UUID,
	publishedAt, deletedAt pgtype.Timestamptz,
	deletedBy pgtype.UUID,
	updatedAt pgtype.Timestamptz,
	version int32,
	scope ViewerScope,
	ctx context.Context,
	surface string,
) (DocumentView, error) {
	if !readable {
		return DocumentView{}, apierr.New(apierr.Forbidden, "document read forbidden")
	}
	view, err := documentFromParts(rowID, kind, slug, title, status, visibility, body, category, policy, frontmatter, authorID, publishedAt, deletedAt, deletedBy, updatedAt, version)
	if err != nil {
		return DocumentView{}, err
	}
	if override, _ := adminOverride.(bool); override {
		AuditSQLOverride(ctx, scope, true, surface, "read")
	}
	return projectDocumentView(ctx, scope, view, body)
}

func mapGetProductDocumentRow(row dbgen.GetProductDocumentByIDRow, scope ViewerScope, ctx context.Context) (DocumentView, error) {
	return mapReadableDocumentRow(row.Readable, row.AdminOverride, row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version, scope, ctx, "document")
}

func mapGetProductDocumentSlugRow(row dbgen.GetProductDocumentBySlugRow, scope ViewerScope, ctx context.Context) (DocumentView, error) {
	return mapReadableDocumentRow(row.Readable, row.AdminOverride, row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version, scope, ctx, "document")
}

func mapListProductDocumentRow(row dbgen.ListProductDocumentsRow, scope ViewerScope, ctx context.Context) (DocumentView, error) {
	view, err := documentFromParts(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, pgtype.UUID{}, row.UpdatedAt, row.Version)
	if err != nil {
		return DocumentView{}, err
	}
	if adminOverride, _ := row.AdminOverride.(bool); adminOverride {
		AuditSQLOverride(ctx, scope, true, "documents", "list")
	}
	return projectDocumentView(ctx, scope, view, row.Body)
}

func mapLockRow(row dbgen.LockProductDocumentByIDRow) (DocumentView, error) {
	view, err := documentFromParts(row.ID, row.Kind, row.Slug, row.Title, row.Status, row.Visibility, row.Body, row.Category, row.Policy, row.FrontmatterYaml, row.AuthorID, row.PublishedAt, row.DeletedAt, row.DeletedBy, row.UpdatedAt, row.Version)
	if err != nil {
		return DocumentView{}, err
	}
	view.ReaderIDs, err = uuidStringsFromAny(row.ReaderIds)
	return view, err
}

func lieutenantState(row dbgen.LockProductDocumentByIDRow) ([]string, []string, error) {
	lieutenants, err := uuidStringsFromAny(row.LieutenantIds)
	if err != nil {
		return nil, nil, err
	}
	quests, err := uuidStringsFromAny(row.LinkedQuestIds)
	if err != nil {
		return nil, nil, err
	}
	return lieutenants, quests, nil
}

func lockDocumentBase(row dbgen.LockProductDocumentByIDRow) (DocumentView, []string, []string, error) {
	view, err := mapLockRow(row)
	if err != nil {
		return DocumentView{}, nil, nil, err
	}
	lieutenants, quests, err := lieutenantState(row)
	if err != nil {
		return DocumentView{}, nil, nil, err
	}
	return view, lieutenants, quests, nil
}

func mapRevision(row dbgen.ListProductDocumentRevisionsRow) (DocumentRevisionView, error) {
	fm, err := frontmatterJSON(row.FrontmatterYaml)
	if err != nil {
		return DocumentRevisionView{}, err
	}
	return DocumentRevisionView{
		Id:          db.UUIDString(row.ID),
		DocumentId:  db.UUIDString(row.DocumentID),
		Rev:         row.Rev,
		Reason:      row.Reason,
		Title:       row.Title,
		Body:        row.Body,
		Frontmatter: fm,
		PublishedAt: productTimePointer(row.PublishedAt),
		PublishedBy: productUUIDPointer(row.PublishedBy),
		RecordedBy:  productUUIDPointer(row.RecordedBy),
		RecordedAt:  row.RecordedAt.Time,
		Visibility:  productTextPointer(row.Visibility),
	}, nil
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// SlugBase normalizes a title into the shared slug prefix (Python SlugBase parity).
func SlugBase(title string) string {
	lowered := cases.Lower(language.Und).String(strings.TrimSpace(title))
	slug := slugNonAlnum.ReplaceAllString(lowered, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "untitled"
	}
	return slug
}

func pgNow(at time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: at.UTC(), Valid: true}
}

func mapNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apierr.New(apierr.NotFound, "document not found")
	}
	return err
}

func mapStaleUpdate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apierr.New(apierr.Conflict, "document revision mismatch")
	}
	return err
}

func mapDocumentWriteError(err error) error {
	if violation, ok := errors.AsType[*pgconn.PgError](err); ok && violation.Code == "23505" {
		if violation.ConstraintName == "uq_documents_dm_table_per_member" {
			return apierr.New(apierr.Conflict, "DUPLICATE_DM_TABLE")
		}
		if violation.ConstraintName == "documents_slug_key" {
			return apierr.New(apierr.Conflict, "document slug already allocated")
		}
	}
	return err
}
