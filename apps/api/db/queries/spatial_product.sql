-- name: GetProductMap :one
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind, m.family,
       r.public_id AS region_id, m.asset_path, m.created_at,
       author.public_id AS created_by
FROM maps m
LEFT JOIN regions r ON r.id = m.region_id
LEFT JOIN members author ON author.id = m.created_by
WHERE m.atlas_code = sqlc.arg(atlas_code);
-- name: ListProductMaps :many
SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind, m.family,
       r.public_id AS region_id, m.asset_path, m.created_at,
       author.public_id AS created_by
FROM maps m
LEFT JOIN regions r ON r.id = m.region_id
LEFT JOIN members author ON author.id = m.created_by
WHERE (sqlc.narg(family)::text IS NULL OR m.family = sqlc.narg(family))
  AND (sqlc.narg(map_kind)::text IS NULL OR m.map_kind = sqlc.narg(map_kind))
ORDER BY m.name, m.public_id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);
-- name: ListProductPointcrawlNodesForMaps :many
WITH ranked AS (
SELECT k.ordinality::int AS key_ordinal,(k.value->>'parent_id')::uuid AS parent_id,m.public_id AS map_id,n.public_id AS id,n.name,n.x,n.y,
       n.created_at,submap.public_id AS submap_id,(k.value->>'offset')::int AS row_offset,
       (k.value->>'limit')::int AS row_limit,
       row_number() OVER (PARTITION BY k.ordinality ORDER BY n.public_id) AS rn
FROM jsonb_array_elements(sqlc.arg(keys)::jsonb) WITH ORDINALITY k(value,ordinality)
JOIN maps m ON m.public_id=(k.value->>'parent_id')::uuid
JOIN pointcrawl_nodes n ON n.map_id=m.id LEFT JOIN maps submap ON submap.id=n.submap_id
WHERE NOT EXISTS (SELECT 1 FROM pointcrawl_entry_links loc
                  WHERE loc.node_id=n.id AND loc.relation='location')
   OR EXISTS (
     SELECT 1 FROM pointcrawl_entry_links loc JOIN documents d ON d.id=loc.document_id
     LEFT JOIN members author ON author.id=d.author_id
     WHERE loc.node_id=n.id AND loc.relation='location' AND d.deleted_at IS NULL
       AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
         sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
         sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])
   )
)
SELECT key_ordinal,parent_id,map_id,true AS parent_exists,id,name,x,y,created_at,submap_id
FROM ranked WHERE rn>row_offset AND rn<=row_offset+row_limit
UNION ALL
SELECT k.ordinality::int,(k.value->>'parent_id')::uuid,m.public_id,(m.id IS NOT NULL),
       NULL::uuid,NULL::text,NULL::double precision,NULL::double precision,NULL::timestamptz,NULL::uuid
FROM jsonb_array_elements(sqlc.arg(keys)::jsonb) WITH ORDINALITY k(value,ordinality)
LEFT JOIN maps m ON m.public_id=(k.value->>'parent_id')::uuid
WHERE NOT EXISTS (SELECT 1 FROM ranked r WHERE r.key_ordinal=k.ordinality AND r.rn>(k.value->>'offset')::int AND r.rn<=((k.value->>'offset')::int+(k.value->>'limit')::int))
ORDER BY key_ordinal,id;
-- name: ListProductPointcrawlEdgesForMaps :many
WITH requested AS (
 SELECT value,ordinality FROM jsonb_array_elements(sqlc.arg(keys)::jsonb) WITH ORDINALITY AS e(value,ordinality)
), visible_nodes AS (
 SELECT k.ordinality,n.id,n.map_id
 FROM requested k JOIN maps m ON m.public_id=(k.value->>'parent_id')::uuid
 JOIN pointcrawl_nodes n ON n.map_id=m.id
 WHERE NOT EXISTS (SELECT 1 FROM pointcrawl_entry_links loc
                   WHERE loc.node_id=n.id AND loc.relation='location')
    OR EXISTS (
      SELECT 1 FROM pointcrawl_entry_links loc JOIN documents d ON d.id=loc.document_id
      LEFT JOIN members author ON author.id=d.author_id
      WHERE loc.node_id=n.id AND loc.relation='location' AND d.deleted_at IS NULL
        AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
          sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
          sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])
    )
), ranked AS (
SELECT k.ordinality::int AS key_ordinal,(k.value->>'parent_id')::uuid AS parent_id,m.public_id AS map_id,e.public_id AS id,
       a.public_id AS node_a,b.public_id AS node_b,e.directed,e.kind,e.label,
       CASE WHEN d.id IS NULL THEN NULL WHEN d.deleted_at IS NULL AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
         sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
         sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])
         THEN d.public_id END AS document_id,
       (k.value->>'offset')::int AS row_offset,(k.value->>'limit')::int AS row_limit,
       row_number() OVER (PARTITION BY k.ordinality ORDER BY e.public_id) AS rn
FROM requested k
JOIN maps m ON m.public_id=(k.value->>'parent_id')::uuid
JOIN pointcrawl_edges e ON e.map_id=m.id
JOIN visible_nodes va ON va.ordinality=k.ordinality AND va.id=e.node_a
JOIN visible_nodes vb ON vb.ordinality=k.ordinality AND vb.id=e.node_b
JOIN pointcrawl_nodes a ON a.id=va.id JOIN pointcrawl_nodes b ON b.id=vb.id
LEFT JOIN documents d ON d.id=e.document_id LEFT JOIN members author ON author.id=d.author_id
)
SELECT key_ordinal,parent_id,map_id,true AS parent_exists,id,node_a,node_b,directed,kind,label,document_id
FROM ranked WHERE rn>row_offset AND rn<=row_offset+row_limit
UNION ALL
SELECT k.ordinality::int,(k.value->>'parent_id')::uuid,m.public_id,(m.id IS NOT NULL),
       NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,NULL::text,NULL::text,NULL::uuid
FROM requested k LEFT JOIN maps m ON m.public_id=(k.value->>'parent_id')::uuid
WHERE NOT EXISTS (SELECT 1 FROM ranked r WHERE r.key_ordinal=k.ordinality AND r.rn> (k.value->>'offset')::int AND r.rn<=((k.value->>'offset')::int+(k.value->>'limit')::int))
ORDER BY key_ordinal,id;
-- name: ListProductPointcrawlLinksForNodes :many
WITH ranked AS (
 SELECT k.ordinality::int AS key_ordinal,(k.value->>'parent_id')::uuid AS parent_id,m.public_id AS map_id,n.public_id AS node_id,d.public_id AS document_id,
        l.relation,l.created_at,creator.public_id AS created_by,
        (k.value->>'offset')::int AS row_offset,(k.value->>'limit')::int AS row_limit,
        row_number() OVER (PARTITION BY k.ordinality ORDER BY l.relation,d.public_id) AS rn
 FROM jsonb_array_elements(sqlc.arg(keys)::jsonb) WITH ORDINALITY k(value,ordinality)
 JOIN pointcrawl_nodes n ON n.public_id=(k.value->>'parent_id')::uuid
 JOIN maps m ON m.id=n.map_id
 JOIN pointcrawl_entry_links l ON l.node_id=n.id
 JOIN documents d ON d.id=l.document_id
 JOIN members creator ON creator.id=l.created_by
 LEFT JOIN members author ON author.id=d.author_id
 WHERE l.map_id=m.id AND d.deleted_at IS NULL AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
   sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
   sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])
   AND (NOT EXISTS (SELECT 1 FROM pointcrawl_entry_links loc
                    WHERE loc.node_id=n.id AND loc.relation='location')
     OR EXISTS (SELECT 1 FROM pointcrawl_entry_links loc JOIN documents ld ON ld.id=loc.document_id
                LEFT JOIN members la ON la.id=ld.author_id
                WHERE loc.node_id=n.id AND loc.relation='location' AND ld.deleted_at IS NULL
                  AND document_readable(ld.public_id,la.public_id,ld.status,ld.visibility,ld.policy,
                    sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
                    sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])))
)
SELECT key_ordinal,parent_id,map_id,true AS parent_exists,node_id,document_id,relation,created_at,created_by FROM ranked
WHERE rn>row_offset AND rn<=row_offset+row_limit
UNION ALL
SELECT k.ordinality::int,(k.value->>'parent_id')::uuid,m.public_id,(n.id IS NOT NULL AND (
  NOT EXISTS (SELECT 1 FROM pointcrawl_entry_links loc WHERE loc.node_id=n.id AND loc.relation='location')
  OR EXISTS (SELECT 1 FROM pointcrawl_entry_links loc JOIN documents d ON d.id=loc.document_id
             LEFT JOIN members author ON author.id=d.author_id
             WHERE loc.node_id=n.id AND loc.relation='location' AND d.deleted_at IS NULL
               AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
                 sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
                 sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])))),
       n.public_id,NULL::uuid,NULL::text,NULL::timestamptz,NULL::uuid
FROM jsonb_array_elements(sqlc.arg(keys)::jsonb) WITH ORDINALITY k(value,ordinality)
LEFT JOIN pointcrawl_nodes n ON n.public_id=(k.value->>'parent_id')::uuid
LEFT JOIN maps m ON m.id=n.map_id
WHERE NOT EXISTS (SELECT 1 FROM ranked r WHERE r.key_ordinal=k.ordinality AND r.rn>(k.value->>'offset')::int AND r.rn<=((k.value->>'offset')::int+(k.value->>'limit')::int))
ORDER BY key_ordinal,relation,document_id;
-- name: GetProductRegionCounts :one
SELECT r.public_id AS region_id,
       (SELECT count(*)::int FROM maps m JOIN pointcrawl_nodes pn ON pn.map_id=m.id
        WHERE m.region_id=r.id) AS pointcrawl_node_count,
       (SELECT count(*)::int FROM quest_regions qr JOIN quests q ON q.id=qr.quest_id
        WHERE qr.region_id=r.id AND q.deleted_at IS NULL) AS quest_count
FROM regions r WHERE r.public_id=sqlc.arg(region_id) AND r.deleted_at IS NULL;
-- name: ReadProductRegionActivity :many
WITH target AS (
 SELECT r.id,r.public_id,r.name
 FROM maps m JOIN regions r ON r.id=m.region_id
 WHERE m.atlas_code=sqlc.arg(atlas_code) AND r.deleted_at IS NULL
), visible_quests AS (
 SELECT q.public_id,q.short_code,q.scheduled_at,q.slots_max,q.filled_count,
        quest_display_status_at(q.status,q.filled_count,q.scheduled_at,q.duration_hours,
          sqlc.arg(as_of)::timestamptz) AS display_status
 FROM target t JOIN quest_regions qr ON qr.region_id=t.id
 JOIN quests q ON q.id=qr.quest_id
 WHERE q.deleted_at IS NULL
), counts AS (
 SELECT count(*) FILTER (WHERE display_status='filling')::int AS filling_count,
        count(*) FILTER (WHERE display_status='scheduled')::int AS scheduled_count,
        count(*) FILTER (WHERE display_status='live')::int AS live_count
 FROM visible_quests
)
SELECT t.public_id AS region_id,t.name AS region_name,c.filling_count,c.scheduled_count,c.live_count,
       v.public_id AS quest_id,v.short_code,v.scheduled_at,v.slots_max,v.filled_count,v.display_status
FROM target t CROSS JOIN counts c LEFT JOIN visible_quests v ON true
ORDER BY t.public_id,v.public_id;
-- name: ListProductRegions :many
SELECT r.public_id AS id, r.name, r.kind, r.charter_deadline, r.created_at,
       CASE WHEN d.id IS NULL THEN NULL WHEN d.deleted_at IS NULL AND document_readable(d.public_id,author.public_id,d.status,d.visibility,d.policy,
         sqlc.narg(viewer_id)::uuid,sqlc.arg(viewer_roles)::text[],sqlc.arg(viewer_handle)::text,
         sqlc.arg(viewer_admin)::boolean,sqlc.arg(viewer_live_dm)::boolean,sqlc.arg(reader_ids)::uuid[])
         THEN d.public_id END AS document_id
FROM regions r LEFT JOIN documents d ON d.id=r.document_id
LEFT JOIN members author ON author.id=d.author_id
WHERE r.deleted_at IS NULL
  AND (sqlc.narg(kind)::text IS NULL OR r.kind=sqlc.narg(kind))
ORDER BY r.name, r.public_id LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);
-- name: ListProductArchonAssignments :many
SELECT r.public_id AS region_id, m.public_id AS member_id, a.created_at AS granted_at,
       grantor.public_id AS granted_by
FROM archon_assignments a JOIN regions r ON r.id=a.region_id
JOIN members m ON m.id=a.member_id
LEFT JOIN members grantor ON grantor.id=a.granted_by
WHERE (sqlc.narg(region_id)::uuid IS NULL OR r.public_id=sqlc.narg(region_id))
  AND (sqlc.narg(member_id)::uuid IS NULL OR m.public_id=sqlc.narg(member_id))
ORDER BY r.public_id,m.public_id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);
-- name: CountProductArchonAssignments :one
SELECT count(*)::int FROM archon_assignments a
JOIN regions r ON r.id=a.region_id JOIN members m ON m.id=a.member_id
WHERE (sqlc.narg(region_id)::uuid IS NULL OR r.public_id=sqlc.narg(region_id))
  AND (sqlc.narg(member_id)::uuid IS NULL OR m.public_id=sqlc.narg(member_id));
-- name: ReadProductCalendar :one
SELECT calendar.definition,calendar.updated_at,
       mapping.game_day AS current_game_day
FROM (SELECT 1) singleton
LEFT JOIN game_calendar calendar ON calendar.id=1
LEFT JOIN game_time_map mapping ON mapping.real_date=sqlc.arg(today)::date;
-- name: ReadProductGameDate :one
SELECT mapping.game_day,calendar.definition
FROM (SELECT sqlc.arg(real_date)::date AS real_date) requested
LEFT JOIN game_time_map mapping ON mapping.real_date=requested.real_date
LEFT JOIN game_calendar calendar ON calendar.id=1;
-- name: ReadProductGameDates :many
SELECT k.ordinality, k.real_date, d.game_day, calendar.definition
FROM unnest(sqlc.arg(real_dates)::date[]) WITH ORDINALITY AS k(real_date, ordinality)
LEFT JOIN game_time_map d ON d.real_date=k.real_date
LEFT JOIN game_calendar calendar ON calendar.id=1
ORDER BY k.ordinality;
-- name: ListProductRealDates :many
SELECT real_date FROM game_time_map WHERE game_day=sqlc.arg(game_day)
ORDER BY real_date LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);
-- name: CountProductRealDates :one
SELECT count(*)::int FROM game_time_map WHERE game_day=sqlc.arg(game_day);
-- name: ListProductCalendarCells :many
SELECT requested.real_date,mapping.game_day
FROM generate_series(sqlc.arg(real_from)::date,sqlc.arg(real_to)::date-1,interval '1 day') requested(real_date)
LEFT JOIN game_time_map mapping ON mapping.real_date=requested.real_date::date
ORDER BY requested.real_date;
-- name: ListProductTimeAnchors :many
SELECT public_id AS id, real_utc, epoch_day, rate, note
FROM time_anchors ORDER BY real_utc, public_id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);
-- name: CountProductTimeAnchors :one
SELECT count(*)::int FROM time_anchors;
-- name: ReadProductTimeAnchorAtOrBefore :one
SELECT public_id AS id,real_utc,epoch_day,rate,note
FROM time_anchors WHERE real_utc<=sqlc.arg(real_utc)
ORDER BY real_utc DESC,public_id DESC LIMIT 1;
-- name: ListProductTimeAnchorCollisions :many
SELECT public_id AS id,real_utc FROM time_anchors
WHERE real_utc=sqlc.arg(real_utc)
  AND (sqlc.narg(exclude_anchor_id)::uuid IS NULL OR public_id<>sqlc.narg(exclude_anchor_id));
-- name: LockProductMapByAtlasCode :one
SELECT m.id, m.public_id, m.name, m.atlas_code, m.map_kind, m.family,
       m.region_id, m.asset_path, m.created_at, m.created_by
FROM maps m WHERE m.atlas_code=sqlc.arg(atlas_code) FOR UPDATE;
-- name: LockProductMap :one
SELECT m.id,m.public_id AS map_id,m.name,m.atlas_code,m.map_kind,m.family,
       r.public_id AS region_id,m.asset_path,m.created_at,
       creator.public_id AS created_by
FROM maps m LEFT JOIN regions r ON r.id=m.region_id
LEFT JOIN members creator ON creator.id=m.created_by
WHERE m.public_id=sqlc.arg(map_id) FOR UPDATE OF m;
-- name: LockProductRegion :one
SELECT r.id, r.public_id, r.name, r.kind, r.charter_deadline, r.document_id,
       r.deleted_at, r.created_at
FROM regions r WHERE r.public_id=sqlc.arg(region_id) FOR UPDATE;
-- name: LockProductPointcrawlNode :one
SELECT n.id, n.public_id, n.map_id, n.name, n.x, n.y, n.submap_id, n.created_at,
       m.public_id AS map_public_id
FROM pointcrawl_nodes n JOIN maps m ON m.id=n.map_id
WHERE n.public_id=sqlc.arg(node_id) FOR UPDATE OF n;
-- name: LockProductPointcrawlEdge :one
SELECT e.id,e.public_id AS edge_id,m.public_id AS map_id,a.public_id AS node_a,
       b.public_id AS node_b,e.directed,e.kind,e.label,d.public_id AS document_id
FROM pointcrawl_edges e JOIN maps m ON m.id=e.map_id JOIN pointcrawl_nodes a ON a.id=e.node_a
JOIN pointcrawl_nodes b ON b.id=e.node_b LEFT JOIN documents d ON d.id=e.document_id
WHERE e.public_id=sqlc.arg(edge_id) FOR UPDATE OF e;
-- name: LockProductCalendar :one
SELECT id, definition, updated_at FROM game_calendar WHERE id=1 FOR UPDATE;
-- name: LockProductTimeAggregate :exec
SELECT pg_advisory_xact_lock(hashtextextended('chronicler:time-aggregate',0));
-- name: LockProductTimeAnchor :one
SELECT id, public_id, real_utc, epoch_day, rate, note
FROM time_anchors WHERE public_id=sqlc.arg(anchor_id) FOR UPDATE;
-- name: LockProductArchonAssignment :one
SELECT a.member_id, m.public_id AS member_public_id, a.region_id,
       r.public_id AS region_public_id, a.created_at, a.granted_by
FROM archon_assignments a JOIN members m ON m.id=a.member_id
JOIN regions r ON r.id=a.region_id
WHERE m.public_id=sqlc.arg(member_id) AND r.public_id=sqlc.arg(region_id)
FOR UPDATE OF a;
-- name: CreateProductMap :one
WITH inserted AS (
  INSERT INTO maps(name,atlas_code,map_kind,family,region_id,asset_path,created_by)
  VALUES (sqlc.arg(name),sqlc.arg(atlas_code),sqlc.arg(map_kind),sqlc.arg(family),
          (SELECT r.id FROM regions r WHERE r.public_id=sqlc.narg(region_id)::uuid),
          sqlc.narg(asset_path),
          (SELECT actor.id FROM members actor WHERE actor.public_id=sqlc.arg(actor_id)::uuid))
  RETURNING *
)
SELECT i.public_id AS id,i.name,i.atlas_code,i.map_kind,i.family,
       r.public_id AS region_id,i.asset_path,i.created_at,
       a.public_id AS created_by
FROM inserted i LEFT JOIN regions r ON r.id=i.region_id
LEFT JOIN members a ON a.id=i.created_by;
-- name: UpsertProductPointcrawlNode :one
WITH input AS (
 SELECT COALESCE(sqlc.narg(node_id)::uuid,gen_random_uuid()) AS node_public_id,m.id AS map_internal_id,
        m.public_id AS map_public_id,sqlc.arg(name)::text AS name,sqlc.arg(x)::float8 AS x,
        sqlc.arg(y)::float8 AS y,(SELECT s.id FROM maps s WHERE s.public_id=sqlc.narg(submap_id)::uuid) AS submap_id
 FROM maps m WHERE m.public_id=sqlc.arg(map_id)::uuid
   AND (sqlc.narg(node_id)::uuid IS NULL OR EXISTS(
     SELECT 1 FROM pointcrawl_nodes existing WHERE existing.public_id=sqlc.narg(node_id)::uuid
       AND existing.map_id=m.id))
), prior AS (
 SELECT n.* FROM pointcrawl_nodes n JOIN input i ON i.node_public_id=n.public_id FOR UPDATE OF n
), changed AS (
 INSERT INTO pointcrawl_nodes(public_id,map_id,name,x,y,submap_id,created_at)
 SELECT i.node_public_id,i.map_internal_id,i.name,i.x,i.y,i.submap_id,sqlc.arg(recorded_at)
 FROM input i
 ON CONFLICT(public_id) DO UPDATE SET name=EXCLUDED.name,x=EXCLUDED.x,y=EXCLUDED.y,
   submap_id=EXCLUDED.submap_id
 WHERE pointcrawl_nodes.map_id=EXCLUDED.map_id AND
   (pointcrawl_nodes.name IS DISTINCT FROM EXCLUDED.name OR pointcrawl_nodes.x IS DISTINCT FROM EXCLUDED.x
    OR pointcrawl_nodes.y IS DISTINCT FROM EXCLUDED.y OR pointcrawl_nodes.submap_id IS DISTINCT FROM EXCLUDED.submap_id)
 RETURNING *
), result_rows AS (
 SELECT * FROM changed UNION ALL SELECT p.* FROM prior p WHERE NOT EXISTS(SELECT 1 FROM changed)
)
SELECT r.public_id AS id,m.public_id AS map_id,r.name,r.x,r.y,submap.public_id AS submap_id,r.created_at
FROM result_rows r JOIN maps m ON m.id=r.map_id LEFT JOIN maps submap ON submap.id=r.submap_id;
-- name: SetProductPointcrawlEdge :one
WITH input AS (
 SELECT COALESCE(sqlc.narg(edge_id)::uuid,gen_random_uuid()) AS edge_public_id,m.id AS map_internal_id,
        m.public_id AS map_public_id,a.id AS a_internal_id,b.id AS b_internal_id,
        a.public_id AS a_public_id,b.public_id AS b_public_id,sqlc.arg(directed)::bool AS directed,
        sqlc.arg(kind)::text AS kind,sqlc.narg(label)::text AS label,
        (SELECT d.id FROM documents d WHERE d.public_id=sqlc.narg(document_id)::uuid) AS document_internal_id
 FROM maps m JOIN pointcrawl_nodes a ON a.map_id=m.id AND a.public_id=sqlc.arg(node_a)
 JOIN pointcrawl_nodes b ON b.map_id=m.id AND b.public_id=sqlc.arg(node_b)::uuid
 WHERE m.public_id=sqlc.arg(map_id)::uuid AND a.id<>b.id
   AND (sqlc.narg(edge_id)::uuid IS NULL OR EXISTS(
     SELECT 1 FROM pointcrawl_edges existing WHERE existing.public_id=sqlc.narg(edge_id)::uuid AND existing.map_id=m.id))
), prior AS (
 SELECT e.* FROM pointcrawl_edges e JOIN input i ON i.edge_public_id=e.public_id FOR UPDATE OF e
), saved AS (
 INSERT INTO pointcrawl_edges(public_id,map_id,node_a,node_b,directed,kind,label,document_id)
 SELECT i.edge_public_id,i.map_internal_id,
        CASE WHEN i.directed OR i.a_public_id<i.b_public_id THEN i.a_internal_id ELSE i.b_internal_id END,
        CASE WHEN i.directed OR i.a_public_id<i.b_public_id THEN i.b_internal_id ELSE i.a_internal_id END,
        i.directed,i.kind,i.label,i.document_internal_id FROM input i
 ON CONFLICT(public_id) DO UPDATE SET map_id=EXCLUDED.map_id,node_a=EXCLUDED.node_a,node_b=EXCLUDED.node_b,
   directed=EXCLUDED.directed,kind=EXCLUDED.kind,label=EXCLUDED.label,document_id=EXCLUDED.document_id
 WHERE pointcrawl_edges.map_id=EXCLUDED.map_id AND
   (pointcrawl_edges.node_a IS DISTINCT FROM EXCLUDED.node_a OR pointcrawl_edges.node_b IS DISTINCT FROM EXCLUDED.node_b
    OR pointcrawl_edges.directed IS DISTINCT FROM EXCLUDED.directed OR pointcrawl_edges.kind IS DISTINCT FROM EXCLUDED.kind
    OR pointcrawl_edges.label IS DISTINCT FROM EXCLUDED.label OR pointcrawl_edges.document_id IS DISTINCT FROM EXCLUDED.document_id)
 RETURNING *
), result_rows AS (
 SELECT * FROM saved UNION ALL SELECT p.* FROM prior p WHERE NOT EXISTS(SELECT 1 FROM saved)
)
SELECT s.public_id AS id,m.public_id AS map_id,a.public_id AS node_a,b.public_id AS node_b,
       s.directed,s.kind,s.label,d.public_id AS document_id
FROM result_rows s JOIN maps m ON m.id=s.map_id
JOIN pointcrawl_nodes a ON a.id=s.node_a JOIN pointcrawl_nodes b ON b.id=s.node_b
LEFT JOIN documents d ON d.id=s.document_id;
-- name: LinkProductPointcrawlEntry :one
WITH inserted AS (
 INSERT INTO pointcrawl_entry_links(map_id,node_id,document_id,relation,created_at,created_by)
 SELECT m.id,n.id,d.id,sqlc.arg(relation),sqlc.arg(recorded_at),actor.id
 FROM maps m JOIN pointcrawl_nodes n ON n.map_id=m.id
 JOIN documents d ON d.public_id=sqlc.arg(document_id)::uuid
 JOIN members actor ON actor.public_id=sqlc.arg(actor_id)::uuid
 WHERE m.public_id=sqlc.arg(map_id)::uuid AND n.public_id=sqlc.arg(node_id)::uuid
 RETURNING *
)
SELECT m.public_id AS map_id,n.public_id AS node_id,d.public_id AS document_id,
       i.relation,i.created_at,creator.public_id AS created_by
FROM inserted i JOIN maps m ON m.id=i.map_id JOIN pointcrawl_nodes n ON n.id=i.node_id
JOIN documents d ON d.id=i.document_id JOIN members creator ON creator.id=i.created_by;
-- name: UnlinkProductPointcrawlEntry :one
WITH removed AS (
 DELETE FROM pointcrawl_entry_links l USING maps m,pointcrawl_nodes n,documents d
 WHERE l.map_id=m.id AND l.node_id=n.id AND l.document_id=d.id
  AND m.public_id=sqlc.arg(map_id)::uuid AND n.public_id=sqlc.arg(node_id)::uuid
  AND d.public_id=sqlc.arg(document_id)::uuid AND l.relation=sqlc.arg(relation)
 RETURNING l.*
)
SELECT count(*)::int FROM removed;
-- name: AssignProductArchon :one
WITH inserted AS (
 INSERT INTO archon_assignments(member_id,region_id,granted_by,created_at)
 SELECT m.id,r.id,a.id,sqlc.arg(recorded_at) FROM members m CROSS JOIN regions r
 JOIN members a ON a.public_id=sqlc.arg(actor_id)::uuid
 WHERE m.public_id=sqlc.arg(member_id)::uuid AND r.public_id=sqlc.arg(region_id)::uuid
 ON CONFLICT(member_id,region_id) DO NOTHING
 RETURNING member_id,region_id,granted_by,created_at
)
SELECT r.public_id AS region_id,m.public_id AS member_id,i.created_at AS granted_at,
       grantor.public_id AS granted_by
FROM inserted i JOIN members m ON m.id=i.member_id
JOIN regions r ON r.id=i.region_id LEFT JOIN members grantor ON grantor.id=i.granted_by
UNION ALL
SELECT r.public_id AS region_id,m.public_id AS member_id,a.created_at AS granted_at,
       grantor.public_id AS granted_by
FROM archon_assignments a JOIN members m ON m.id=a.member_id
JOIN regions r ON r.id=a.region_id LEFT JOIN members grantor ON grantor.id=a.granted_by
WHERE m.public_id=sqlc.arg(member_id)::uuid AND r.public_id=sqlc.arg(region_id)::uuid
  AND NOT EXISTS (SELECT 1 FROM inserted);
-- name: RevokeProductArchon :execrows
DELETE FROM archon_assignments a USING members m,regions r
WHERE a.member_id=m.id AND a.region_id=r.id AND m.public_id=sqlc.arg(member_id)
  AND r.public_id=sqlc.arg(region_id);

-- name: CreateProductRegion :one
WITH inserted AS (
 INSERT INTO regions(name,kind,charter_deadline,document_id)
 SELECT sqlc.arg(name),sqlc.arg(kind),sqlc.narg(charter_deadline),
        (SELECT d.id FROM documents d WHERE d.public_id=sqlc.narg(document_id)::uuid)
 RETURNING *
)
SELECT i.public_id AS id,i.name,i.kind,i.charter_deadline,d.public_id AS document_id,i.created_at
FROM inserted i LEFT JOIN documents d ON d.id=i.document_id;
-- name: UpdateProductRegion :one
WITH prior_row AS (
 SELECT r.* FROM regions r WHERE r.public_id=sqlc.arg(region_id) AND r.deleted_at IS NULL AND r.kind=sqlc.arg(kind) FOR UPDATE
), desired AS (
 SELECT prior_row.*,sqlc.arg(name)::text AS next_name,sqlc.narg(charter_deadline)::timestamptz AS next_deadline,
        (SELECT d.id FROM documents d WHERE d.public_id=sqlc.narg(document_id)::uuid) AS next_document_id
 FROM prior_row
), changed AS (
 UPDATE regions r SET name=d.next_name,charter_deadline=d.next_deadline,document_id=d.next_document_id
 FROM desired d WHERE r.id=d.id AND
   (r.name IS DISTINCT FROM d.next_name OR r.charter_deadline IS DISTINCT FROM d.next_deadline
    OR r.document_id IS DISTINCT FROM d.next_document_id)
 RETURNING r.*
), result_rows AS (
 SELECT * FROM changed UNION ALL SELECT * FROM prior_row
 WHERE NOT EXISTS(SELECT 1 FROM changed)
)
SELECT r.public_id AS id,r.name,r.kind,r.charter_deadline,d.public_id AS document_id,r.created_at
FROM result_rows r LEFT JOIN documents d ON d.id=r.document_id;
-- name: RestoreProductRegion :one
WITH prior AS (
 SELECT * FROM regions WHERE regions.public_id=sqlc.arg(region_id) FOR UPDATE
), changed AS (
 UPDATE regions r SET deleted_at=NULL,deleted_by=NULL
 FROM prior p WHERE r.id=p.id AND p.deleted_at IS NOT NULL RETURNING r.*
), result_rows AS (
 SELECT * FROM changed UNION ALL SELECT * FROM prior WHERE NOT EXISTS(SELECT 1 FROM changed)
)
SELECT r.public_id AS id,r.name,r.kind,r.charter_deadline,d.public_id AS document_id,r.created_at
FROM result_rows r LEFT JOIN documents d ON d.id=r.document_id;
-- name: TransitionProductRegion :one
WITH prior_row AS (
 SELECT * FROM regions WHERE regions.public_id=sqlc.arg(region_id) AND deleted_at IS NULL FOR UPDATE
), changed AS (
 UPDATE regions r SET kind=sqlc.arg(kind)
 FROM prior_row p WHERE r.id=p.id AND r.kind IS DISTINCT FROM sqlc.arg(kind)
 RETURNING r.*
)
SELECT r.public_id AS id,r.name,r.kind,r.charter_deadline,d.public_id AS document_id,r.created_at
FROM (SELECT * FROM changed UNION ALL SELECT * FROM prior_row
      WHERE NOT EXISTS(SELECT 1 FROM changed)) r
LEFT JOIN documents d ON d.id=r.document_id;
-- name: CreateProductTimeAnchor :one
INSERT INTO time_anchors(public_id,real_utc,epoch_day,rate,note)
VALUES(sqlc.arg(anchor_id),sqlc.arg(real_utc),sqlc.arg(epoch_day),sqlc.arg(rate),sqlc.narg(note))
RETURNING public_id AS id,real_utc,epoch_day,rate,note;
-- name: UpdateProductTimeAnchor :one
UPDATE time_anchors SET real_utc=sqlc.arg(real_utc),epoch_day=sqlc.arg(epoch_day),
 rate=sqlc.arg(rate),note=sqlc.narg(note)
WHERE public_id=sqlc.arg(anchor_id)
RETURNING public_id AS id,real_utc,epoch_day,rate,note;
-- name: UpdateProductCalendar :one
WITH prior AS (
 SELECT id,definition,updated_at FROM game_calendar WHERE id=1 FOR UPDATE
), changed AS (
 INSERT INTO game_calendar(id,definition,updated_at)
 VALUES(1,sqlc.arg(definition)::jsonb,sqlc.arg(recorded_at))
 ON CONFLICT(id) DO UPDATE SET definition=EXCLUDED.definition,updated_at=EXCLUDED.updated_at
 WHERE game_calendar.definition IS DISTINCT FROM EXCLUDED.definition
 RETURNING id,definition,updated_at
), result_rows AS (
 SELECT * FROM changed
 UNION ALL SELECT * FROM prior WHERE NOT EXISTS(SELECT 1 FROM changed)
)
SELECT id,definition,updated_at FROM result_rows;
-- name: ReplaceProductGameTimeMapRange :one
WITH requested AS (
 SELECT (entry->>'real_date')::date AS real_date,(entry->>'game_day')::integer AS game_day
 FROM jsonb_array_elements(sqlc.arg(rows)::jsonb) AS input(entry)
), changed AS (
 INSERT INTO game_time_map(real_date,game_day)
 SELECT real_date,game_day FROM requested
 WHERE real_date>=sqlc.arg(today)::date AND real_date<sqlc.arg(to_date)::date
 ON CONFLICT(real_date) DO UPDATE SET game_day=EXCLUDED.game_day
 WHERE game_time_map.game_day IS DISTINCT FROM EXCLUDED.game_day
 RETURNING real_date
)
SELECT count(*)::int AS changed_rows FROM changed;
-- name: LockProductContainmentGraph :exec
SELECT pg_advisory_xact_lock(hashtextextended('chronicler:map-containment',0));
-- name: ReadProductContainmentEdges :many
SELECT DISTINCT parent.public_id AS parent_map_id,child.public_id AS child_map_id
FROM pointcrawl_nodes n JOIN maps parent ON parent.id=n.map_id
JOIN maps child ON child.id=n.submap_id WHERE n.submap_id IS NOT NULL
ORDER BY parent_map_id,child_map_id;
-- name: SoftDeleteProductRegion :execrows
UPDATE regions r SET deleted_at=sqlc.arg(recorded_at),
  deleted_by=(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid)
WHERE r.public_id=sqlc.arg(region_id)::uuid AND r.deleted_at IS NULL;
