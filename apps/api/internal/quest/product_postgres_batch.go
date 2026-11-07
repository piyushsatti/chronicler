package quest

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type batchParentKey struct {
	ParentID string `json:"parent_id"`
	Limit    int32  `json:"limit"`
	Offset   int32  `json:"offset"`
	Role     string `json:"role,omitempty"`
}

func encodeQuestBatchKeys[T any](keys []T, parent func(T) batchParentKey) ([]byte, error) {
	payload := make([]batchParentKey, len(keys))
	for i, key := range keys {
		payload[i] = parent(key)
	}
	return json.Marshal(payload)
}

func pageItems[T any](items []T, limit, offset int32) []T {
	if offset < 0 {
		offset = 0
	}
	if int(offset) >= len(items) {
		return []T{}
	}
	items = items[offset:]
	if limit > 0 && int(limit) < len(items) {
		items = items[:limit]
	}
	return items
}

const productQuestBatchArcsSQL = `
SELECT input.ordinality::integer AS input_index,
       arc.public_id, arc.name, creator.public_id AS created_by_public_id,
       arc.created_at, count(q.id)::integer AS quest_count
FROM unnest($1::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
LEFT JOIN quest_arcs arc ON arc.public_id = input.public_id
LEFT JOIN members creator ON creator.id = arc.created_by
LEFT JOIN quests q ON q.arc_id = arc.id AND q.deleted_at IS NULL
GROUP BY input.ordinality, arc.public_id, arc.name, creator.public_id, arc.created_at
ORDER BY input.ordinality`

func (p *ProductPostgres) readBatchArcs(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[QuestArcView], error) {
	out := make([]product.BatchResult[QuestArcView], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := questUUID(key.ID)
		if err != nil {
			out[i] = product.BatchResult[QuestArcView]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.DB.Query(ctx, productQuestBatchArcsSQL, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			inputIndex int32
			publicID   pgtype.UUID
			name       pgtype.Text
			createdBy  pgtype.UUID
			createdAt  pgtype.Timestamptz
			questCount pgtype.Int4
		)
		if err := rows.Scan(&inputIndex, &publicID, &name, &createdBy, &createdAt, &questCount); err != nil {
			return nil, err
		}
		position := int(inputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		slot := positions[position]
		if !publicID.Valid {
			continue
		}
		out[slot] = product.BatchResult[QuestArcView]{Value: &QuestArcView{
			Id:         db.UUIDString(publicID),
			Name:       name.String,
			CreatedBy:  db.UUIDString(createdBy),
			CreatedAt:  createdAt.Time,
			QuestCount: questCount.Int32,
		}}
	}
	return out, rows.Err()
}

const productQuestBatchArcQuestsSQL = `
WITH requested AS (
    SELECT k.ordinality::int AS key_ordinal,
           (k.value->>'parent_id')::uuid AS parent_id,
           (k.value->>'limit')::int AS row_limit,
           (k.value->>'offset')::int AS row_offset
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS k(value, ordinality)
), ranked AS (
    SELECT r.key_ordinal, r.parent_id, r.row_limit, r.row_offset,
           q.public_id, q.short_code, q.kinds, q.status,
           quest_display_status_at(q.status, q.filled_count, q.scheduled_at, q.duration_hours, $2::timestamptz) AS display_status,
           dm.public_id AS dm_public_id, arc.public_id AS arc_public_id,
           q.scheduled_at, q.duration_hours, q.slots_max, q.filled_count,
           doc.public_id AS document_public_id, q.tags, q.genres, q.avg_party_level AS apl,
           q.signup_type, creator.public_id AS created_by_public_id, q.created_at, q.updated_at,
           row_number() OVER (PARTITION BY r.key_ordinal ORDER BY q.scheduled_at, q.public_id) AS rn
    FROM requested r
    JOIN quest_arcs arc ON arc.public_id = r.parent_id
    JOIN quests q ON q.arc_id = arc.id AND q.deleted_at IS NULL
    JOIN members dm ON dm.id = q.dm_id
    JOIN members creator ON creator.id = q.created_by
    LEFT JOIN documents doc ON doc.id = q.document_id
)
SELECT key_ordinal, parent_id, true AS parent_exists,
       public_id, short_code, kinds, status, display_status, dm_public_id, arc_public_id,
       scheduled_at, duration_hours, slots_max, filled_count, document_public_id,
       tags, genres, apl, signup_type, created_by_public_id, created_at, updated_at
FROM ranked
WHERE rn > row_offset AND rn <= row_offset + row_limit
UNION ALL
SELECT r.key_ordinal, r.parent_id, (arc.id IS NOT NULL) AS parent_exists,
       NULL::uuid, NULL::text, NULL::text[], NULL::text, NULL::text, NULL::uuid, NULL::uuid,
       NULL::timestamptz, NULL::double precision, NULL::integer, NULL::integer, NULL::uuid,
       NULL::text[], NULL::text[], NULL::integer, NULL::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz
FROM requested r
LEFT JOIN quest_arcs arc ON arc.public_id = r.parent_id
WHERE NOT EXISTS (
    SELECT 1 FROM ranked x
    WHERE x.key_ordinal = r.key_ordinal
      AND x.rn > r.row_offset AND x.rn <= r.row_offset + r.row_limit
)
ORDER BY key_ordinal, scheduled_at NULLS LAST, public_id NULLS LAST`

func (p *ProductPostgres) readBatchArcQuests(ctx context.Context, _ auth.Authority, keys []ArcQuestsKey) ([]product.BatchResult[QuestList], error) {
	out := make([]product.BatchResult[QuestList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	encoded, err := encodeQuestBatchKeys(keys, func(k ArcQuestsKey) batchParentKey {
		return batchParentKey{ParentID: k.ParentID, Limit: k.Limit, Offset: k.Offset}
	})
	if err != nil {
		return nil, err
	}
	rows, err := p.DB.Query(ctx, productQuestBatchArcQuestsSQL, encoded, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lists := make([][]QuestView, len(keys))
	parentExists := make([]bool, len(keys))
	for rows.Next() {
		keyOrdinal, parentExistsFlag, view, err := scanArcQuestBatchRow(rows)
		if err != nil {
			return nil, err
		}
		idx := int(keyOrdinal) - 1
		if idx < 0 || idx >= len(keys) {
			continue
		}
		parentExists[idx] = parentExistsFlag
		if view != nil {
			lists[idx] = append(lists[idx], *view)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	views := make([]*QuestView, 0)
	for _, items := range lists {
		views = append(views, questViewPointers(items)...)
	}
	if err := p.fillQuestRegionIDs(ctx, views...); err != nil {
		return nil, err
	}
	for i := range out {
		if !parentExists[i] {
			out[i].Err = apierr.New(apierr.NotFound, "quest arc not found")
			continue
		}
		items := lists[i]
		if items == nil {
			items = []QuestView{}
		}
		out[i].Value = &QuestList{Items: items}
	}
	return out, nil
}

func scanArcQuestBatchRow(rows pgx.Rows) (int32, bool, *QuestView, error) {
	var (
		keyOrdinal, slotsMax, filledCount                                          pgtype.Int4
		parentID, publicID, dmPublicID, arcPublicID, documentPublicID, createdByID pgtype.UUID
		parentExistsFlag                                                           bool
		shortCode, status, displayStatus, signupType                               pgtype.Text
		kinds, tags, genres                                                        []string
		scheduledAt, createdAt, updatedAt                                          pgtype.Timestamptz
		durationHours                                                              pgtype.Float8
		apl                                                                        pgtype.Int4
	)
	if err := rows.Scan(
		&keyOrdinal, &parentID, &parentExistsFlag,
		&publicID, &shortCode, &kinds, &status, &displayStatus, &dmPublicID, &arcPublicID,
		&scheduledAt, &durationHours, &slotsMax, &filledCount, &documentPublicID,
		&tags, &genres, &apl, &signupType, &createdByID, &createdAt, &updatedAt,
	); err != nil {
		return 0, false, nil, err
	}
	_ = parentID
	if !publicID.Valid {
		return keyOrdinal.Int32, parentExistsFlag, nil, nil
	}
	view := QuestView{
		Id: db.UUIDString(publicID), ShortCode: shortCode.String, Kinds: kinds, Status: status.String,
		DisplayStatus: strPtr(displayStatus.String), DmId: db.UUIDString(dmPublicID), ScheduledAt: scheduledAt.Time,
		DurationHours: durationHours.Float64, SlotsMax: slotsMax.Int32, FilledCount: filledCount.Int32,
		Tags: tags, Genres: genres, CreatedBy: db.UUIDString(createdByID), CreatedAt: createdAt.Time,
		UpdatedAt: updatedAt.Time, Regions: []string{},
	}
	if arcPublicID.Valid {
		id := db.UUIDString(arcPublicID)
		view.ArcId = &id
	}
	if documentPublicID.Valid {
		id := db.UUIDString(documentPublicID)
		view.DocumentId = &id
	}
	if signupType.Valid {
		view.SignupType = &signupType.String
	}
	if apl.Valid {
		view.Apl = &apl.Int32
	}
	return keyOrdinal.Int32, parentExistsFlag, &view, nil
}

const productQuestBatchPointcrawlLinksSQL = `
WITH requested AS (
    SELECT k.ordinality::int AS key_ordinal,
           (k.value->>'parent_id')::uuid AS parent_id,
           (k.value->>'limit')::int AS row_limit,
           (k.value->>'offset')::int AS row_offset,
           NULLIF(k.value->>'role', '') AS role_filter
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS k(value, ordinality)
), ranked AS (
    SELECT r.key_ordinal, r.parent_id, r.row_limit, r.row_offset,
           q.public_id::text AS quest_id, n.public_id::text AS node_id, qpn.role,
           n.name AS node_name,
           row_number() OVER (PARTITION BY r.key_ordinal ORDER BY n.public_id, qpn.role) AS rn
    FROM requested r
    JOIN quests q ON q.public_id = r.parent_id AND q.deleted_at IS NULL
    JOIN quest_pointcrawl_nodes qpn ON qpn.quest_id = q.id
    JOIN pointcrawl_nodes n ON n.id = qpn.node_id
    WHERE r.role_filter IS NULL OR qpn.role = r.role_filter
)
SELECT key_ordinal, parent_id, true AS parent_exists, quest_id, node_id, role, node_name
FROM ranked
WHERE rn > row_offset AND rn <= row_offset + row_limit
UNION ALL
SELECT r.key_ordinal, r.parent_id, (q.id IS NOT NULL) AS parent_exists,
       NULL::text, NULL::text, NULL::text, NULL::text
FROM requested r
LEFT JOIN quests q ON q.public_id = r.parent_id AND q.deleted_at IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM ranked x
    WHERE x.key_ordinal = r.key_ordinal
      AND x.rn > r.row_offset AND x.rn <= r.row_offset + r.row_limit
)
ORDER BY key_ordinal, node_id NULLS LAST, role NULLS LAST`

func (p *ProductPostgres) readBatchPointcrawlLinks(ctx context.Context, _ auth.Authority, keys []QuestHexesKey) ([]product.BatchResult[HexList], error) {
	out := make([]product.BatchResult[HexList], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	encoded, err := encodeQuestBatchKeys(keys, func(k QuestHexesKey) batchParentKey {
		role := ""
		if k.HasRole {
			role = k.Role
		}
		return batchParentKey{ParentID: k.ParentID, Limit: k.Limit, Offset: k.Offset, Role: role}
	})
	if err != nil {
		return nil, err
	}
	rows, err := p.DB.Query(ctx, productQuestBatchPointcrawlLinksSQL, encoded)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lists := make([][]QuestHexView, len(keys))
	parentExists := make([]bool, len(keys))
	for rows.Next() {
		var (
			keyOrdinal                      int32
			parentID                        pgtype.UUID
			parentExistsFlag                bool
			questID, nodeID, role, nodeName pgtype.Text
		)
		if err := rows.Scan(&keyOrdinal, &parentID, &parentExistsFlag, &questID, &nodeID, &role, &nodeName); err != nil {
			return nil, err
		}
		idx := int(keyOrdinal) - 1
		if idx < 0 || idx >= len(keys) {
			continue
		}
		parentExists[idx] = parentExistsFlag
		if !questID.Valid || !nodeID.Valid {
			continue
		}
		lists[idx] = append(lists[idx], QuestHexView{
			QuestId: questID.String,
			HexId:   nodeID.String,
			Role:    role.String,
			Name:    nodeName.String,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if !parentExists[i] {
			out[i].Err = apierr.New(apierr.NotFound, "quest not found")
			continue
		}
		items := lists[i]
		if items == nil {
			items = []QuestHexView{}
		}
		out[i].Value = &HexList{Items: items}
	}
	return out, nil
}

const productQuestBatchDeliverySQL = `
SELECT input.ordinality::integer AS input_index,
       q.public_id AS quest_public_id,
       q.discord_desired_revision, q.discord_applied_revision,
       job.public_id AS job_public_id, job.state AS job_state,
       job.next_run_at, job.safe_error_code, job.error_message
FROM unnest($1::uuid[]) WITH ORDINALITY AS input(public_id, ordinality)
LEFT JOIN quests q ON q.public_id = input.public_id AND q.deleted_at IS NULL
LEFT JOIN LATERAL (
    SELECT b.public_id, b.state, b.next_run_at, b.safe_error_code, b.error_message
    FROM background_jobs b
    WHERE b.kind IN ('quest_discord_delivery','quest_discord')
      AND b.payload->>'public_id' = q.public_id::text
    ORDER BY b.updated_at DESC, b.public_id DESC
    LIMIT 1
) job ON TRUE
ORDER BY input.ordinality`

func deliveryOverallStatus(desired, applied int32, jobState string) string {
	if desired <= applied && desired > 0 {
		return "synced"
	}
	switch jobState {
	case "succeeded":
		return "synced"
	case "dead", "cancelled", "repair_required":
		return "error"
	case "queued", "running", "retry_wait":
		return "pending"
	default:
		if desired > applied {
			return "pending"
		}
		return "idle"
	}
}

func (p *ProductPostgres) readBatchDelivery(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[QuestDiscordDeliveryView], error) {
	out := make([]product.BatchResult[QuestDiscordDeliveryView], len(keys))
	if len(keys) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := questUUID(key.ID)
		if err != nil {
			out[i] = product.BatchResult[QuestDiscordDeliveryView]{Err: err}
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.DB.Query(ctx, productQuestBatchDeliverySQL, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		inputIndex, questPublicID, view, err := scanQuestDeliveryRow(rows)
		if err != nil {
			return nil, err
		}
		position := int(inputIndex) - 1
		if position < 0 || position >= len(positions) {
			continue
		}
		slot := positions[position]
		if !questPublicID.Valid {
			continue
		}
		out[slot] = product.BatchResult[QuestDiscordDeliveryView]{Value: view}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func scanQuestDeliveryRow(rows pgx.Rows) (int32, pgtype.UUID, *QuestDiscordDeliveryView, error) {
	var (
		inputIndex                        int32
		questPublicID, jobPublicID        pgtype.UUID
		desired, applied                  pgtype.Int4
		jobState, safeError, errorMessage pgtype.Text
		nextRetryAt                       pgtype.Timestamptz
	)
	if err := rows.Scan(&inputIndex, &questPublicID, &desired, &applied, &jobPublicID, &jobState, &nextRetryAt, &safeError, &errorMessage); err != nil {
		return 0, pgtype.UUID{}, nil, err
	}
	view := QuestDiscordDeliveryView{DesiredRevision: desired.Int32, AppliedRevision: applied.Int32,
		OverallStatus: deliveryOverallStatus(desired.Int32, applied.Int32, jobState.String)}
	if jobPublicID.Valid {
		id := db.UUIDString(jobPublicID)
		view.JobId = &id
	}
	if jobState.Valid {
		state := jobState.String
		view.MessageState = &state
	}
	if nextRetryAt.Valid {
		at := nextRetryAt.Time
		view.NextRetryAt = &at
	}
	if safeError.Valid {
		view.ErrorCode = &safeError.String
	}
	if errorMessage.Valid {
		view.ErrorMessage = &errorMessage.String
	}
	return inputIndex, questPublicID, &view, nil
}
