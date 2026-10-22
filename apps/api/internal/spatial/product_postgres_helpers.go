package spatial

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) queries() *dbgen.Queries { return dbgen.New(p.DB) }

func spatialPublicID(value string) (pgtype.UUID, error) {
	id, err := db.ParseUUID(value)
	if err != nil || db.UUIDString(id) != value {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid public id")
	}
	return id, nil
}

func optionalSpatialUUID(value *string) (pgtype.UUID, error) {
	if value == nil || *value == "" {
		return pgtype.UUID{}, nil
	}
	return spatialPublicID(*value)
}

func pgDateFromProduct(d product.Date) (pgtype.Date, error) {
	t, err := time.Parse("2006-01-02", string(d))
	if err != nil {
		return pgtype.Date{}, apierr.New(apierr.Invalid, "invalid date")
	}
	var out pgtype.Date
	_ = out.Scan(t.Format("2006-01-02"))
	return out, nil
}

func productDateFromAny(value any) (product.Date, error) {
	switch v := value.(type) {
	case time.Time:
		return product.Date(v.Format("2006-01-02")), nil
	case string:
		if _, err := time.Parse("2006-01-02", v); err != nil {
			return "", apierr.New(apierr.Invalid, "invalid date")
		}
		return product.Date(v), nil
	default:
		return "", apierr.New(apierr.Invalid, "invalid date")
	}
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func optionalTimestamptz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgTimestamptz(*t)
}

func optionalText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func uuidPtr(id pgtype.UUID) *string {
	if !id.Valid {
		return nil
	}
	s := db.UUIDString(id)
	return &s
}

func int32Ptr(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	out := v.Int32
	return &out
}

func rawJSON(b []byte) *json.RawMessage {
	if len(b) == 0 {
		return nil
	}
	raw := json.RawMessage(b)
	return &raw
}

func (p *ProductPostgres) documentSQLViewer(ctx context.Context, actor auth.Authority) (document.SQLViewer, error) {
	scope := document.ScopeFromAuthority(actor)
	if !scope.Authenticated() {
		return document.SQLScope(scope), nil
	}
	memberID, err := db.ParseUUID(scope.MemberID)
	if err != nil {
		return document.SQLScope(scope), nil
	}
	readerIDs, err := p.queries().ListDocumentReaders(ctx, memberID)
	if err != nil {
		return document.SQLViewer{}, err
	}
	scope.ReaderOf = make(map[string]struct{}, len(readerIDs))
	for _, id := range readerIDs {
		scope.ReaderOf[db.UUIDString(id)] = struct{}{}
	}
	return document.SQLScope(scope), nil
}

func mapProductMapRow(id pgtype.UUID, name, atlasCode, mapKind, family string, regionID pgtype.UUID, assetPath pgtype.Text, createdAt pgtype.Timestamptz, createdBy pgtype.UUID) MapView {
	view := MapView{
		Id:        db.UUIDString(id),
		Name:      name,
		AtlasCode: atlasCode,
		MapKind:   mapKind,
		Family:    family,
		CreatedAt: createdAt.Time,
		RegionId:  uuidPtr(regionID),
	}
	if assetPath.Valid {
		s := assetPath.String
		view.AssetPath = &s
	}
	if createdBy.Valid {
		s := db.UUIDString(createdBy)
		view.CreatedBy = &s
	}
	return view
}

func mapProductRegionRow(id pgtype.UUID, name, kind string, charterDeadline pgtype.Timestamptz, documentID pgtype.UUID, createdAt pgtype.Timestamptz) RegionView {
	view := RegionView{
		Id:         db.UUIDString(id),
		Name:       name,
		Kind:       kind,
		CreatedAt:  createdAt.Time,
		DocumentId: uuidPtr(documentID),
	}
	if charterDeadline.Valid {
		t := charterDeadline.Time
		view.CharterDeadline = &t
	}
	return view
}

func mapTimeAnchorRow(id pgtype.UUID, realUtc pgtype.Timestamptz, epochDay int32, rate float64, note pgtype.Text) TimeAnchorView {
	view := TimeAnchorView{
		Id:       db.UUIDString(id),
		RealUtc:  realUtc.Time,
		EpochDay: epochDay,
		Rate:     rate,
	}
	if note.Valid {
		s := note.String
		view.Note = &s
	}
	return view
}

func mapArchonRow(regionID, memberID pgtype.UUID, grantedAt pgtype.Timestamptz, grantedBy pgtype.UUID) ArchonAssignmentView {
	view := ArchonAssignmentView{
		RegionId:  db.UUIDString(regionID),
		MemberId:  db.UUIDString(memberID),
		GrantedAt: grantedAt.Time,
	}
	if grantedBy.Valid {
		s := db.UUIDString(grantedBy)
		view.GrantedBy = &s
	}
	return view
}

func mapPointcrawlNodeRow(id, mapID pgtype.UUID, name string, x, y float64, submapID pgtype.UUID, createdAt pgtype.Timestamptz) PointcrawlNodeView {
	view := PointcrawlNodeView{
		Id:        db.UUIDString(id),
		MapId:     db.UUIDString(mapID),
		Name:      name,
		X:         x,
		Y:         y,
		CreatedAt: createdAt.Time,
		SubmapId:  uuidPtr(submapID),
	}
	return view
}

func mapPointcrawlEdgeRow(id, mapID, nodeA, nodeB pgtype.UUID, directed bool, kind string, label pgtype.Text, documentID pgtype.UUID) PointcrawlEdgeView {
	view := PointcrawlEdgeView{
		Id:       db.UUIDString(id),
		MapId:    db.UUIDString(mapID),
		NodeA:    db.UUIDString(nodeA),
		NodeB:    db.UUIDString(nodeB),
		Directed: directed,
		Kind:     kind,
	}
	if label.Valid {
		s := label.String
		view.Label = &s
	}
	if documentID.Valid {
		s := db.UUIDString(documentID)
		view.DocumentId = &s
	}
	return view
}

type batchParentKey struct {
	ParentID string `json:"parent_id"`
	Limit    int32  `json:"limit"`
	Offset   int32  `json:"offset"`
}

func encodeBatchKeys[T any](keys []T, parent func(T) batchParentKey) ([]byte, error) {
	payload := make([]batchParentKey, len(keys))
	for i, key := range keys {
		payload[i] = parent(key)
	}
	return json.Marshal(payload)
}

func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func mapLockRegionState(row dbgen.LockProductRegionRow) (RegionView, error) {
	view := mapProductRegionRow(row.PublicID, row.Name, row.Kind, row.CharterDeadline, row.DocumentPublicID, row.CreatedAt)
	return view, nil
}

func readRegionByID(ctx context.Context, q *dbgen.Queries, regionID pgtype.UUID) (*RegionView, error) {
	row, err := q.LockProductRegion(ctx, regionID)
	if isNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if row.DeletedAt.Valid {
		return nil, nil
	}
	view, err := mapLockRegionState(row)
	if err != nil {
		return nil, err
	}
	return &view, nil
}

func readMapByPublicID(ctx context.Context, q *dbgen.Queries, mapID pgtype.UUID) (*MapView, error) {
	row, err := q.LockProductMap(ctx, mapID)
	if isNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view := mapProductMapRow(row.MapID, row.Name, row.AtlasCode, row.MapKind, row.Family, row.RegionID, row.AssetPath, row.CreatedAt, row.CreatedBy)
	return &view, nil
}
