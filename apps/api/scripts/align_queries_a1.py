#!/usr/bin/env python3
"""One-shot: drop sqlc queries that reference tables removed in 0001_init.sql (A1)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUERIES = ROOT / "db" / "queries"


def split_queries(text: str) -> list[tuple[str, str]]:
    parts = re.split(r"(?m)^(?=-- name: )", text)
    out: list[tuple[str, str]] = []
    for part in parts:
        part = part.strip("\n")
        if not part:
            continue
        m = re.match(r"-- name: (\S+)", part)
        if not m:
            continue
        out.append((m.group(1), part + "\n"))
    return out


def write_queries(path: Path, blocks: list[str]) -> None:
    path.write_text("".join(blocks), encoding="utf-8")


def drop_names(path: Path, drop: set[str]) -> None:
    blocks = [
        b for n, b in split_queries(path.read_text(encoding="utf-8")) if n not in drop
    ]
    write_queries(path, blocks)


def keep_only(path: Path, keep: set[str]) -> None:
    blocks = [
        b for n, b in split_queries(path.read_text(encoding="utf-8")) if n in keep
    ]
    write_queries(path, blocks)


def patch_file(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f"missing patch anchor in {path}: {old[:60]!r}")
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    obs = QUERIES / "observations.sql"
    if obs.exists():
        obs.unlink()

    drop_names(
        QUERIES / "members.sql",
        {"ListMemberRoleHistory"},
    )

    drop_names(
        QUERIES / "member_product.sql",
        {
            "ProductRoleHistory",
            "ProductRequestsPage",
            "ProductIsFollowing",
            "ProductLockRequest",
            "ProductCurrentDmReview",
            "ProductCurrentRequestDecision",
            "ProductAppendRoleHistory",
            "ProductAppendDmReview",
            "ProductCreateRequest",
            "ProductDecideRequest",
            "ProductAppendRequestDecision",
            "ProductFollowPerson",
            "ProductUnfollowPerson",
        },
    )

    patch_file(
        QUERIES / "member_product.sql",
        [
            (
                """-- name: ProductAppendCharacterVerification :one
INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,note,created_at,review_revision,evidence_attempt_id)
SELECT sqlc.arg(verification_id)::uuid,'character',c.id,sqlc.arg(verdict)::text,a.id,sqlc.narg(note)::text,
 sqlc.arg(at)::timestamptz,NULL::int,e.id
FROM characters c
JOIN members a ON a.public_id=sqlc.arg(actor_id)::uuid
LEFT JOIN character_ddb_attempts e ON e.public_id=sqlc.narg(evidence_attempt_id)::uuid AND e.character_id=c.id
WHERE c.public_id=sqlc.arg(character_id)::uuid AND c.status='pending_approval'
 AND c.verification_submitted_at=sqlc.arg(submission_token)::timestamptz
 AND (sqlc.narg(evidence_attempt_id)::uuid IS NULL OR e.id IS NOT NULL)
RETURNING public_id,created_at;""",
                """-- name: ProductAppendCharacterVerification :one
INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,note,created_at,review_revision)
SELECT sqlc.arg(verification_id)::uuid,'character',c.id,sqlc.arg(verdict)::text,a.id,sqlc.narg(note)::text,
 sqlc.arg(at)::timestamptz,NULL::int
FROM characters c
JOIN members a ON a.public_id=sqlc.arg(actor_id)::uuid
WHERE c.public_id=sqlc.arg(character_id)::uuid AND c.status='pending_approval'
 AND c.verification_submitted_at=sqlc.arg(submission_token)::timestamptz
RETURNING public_id,created_at;""",
            ),
        ],
    )

    drop_names(
        QUERIES / "character_product.sql",
        {
            "CharacterProductListQuestRewards",
            "CharacterProductCountQuestRewards",
            "CharacterProductLockRewardClaims",
            "CharacterProductMarkRewardClaims",
        },
    )
    patch_file(
        QUERIES / "character_product.sql",
        [
            (
                "LEFT JOIN character_ddb_attempts evidence ON evidence.id = verification.evidence_attempt_id\n",
                "",
            ),
            (
                "       evidence.public_id AS evidence_attempt_id\n",
                "       NULL::uuid AS evidence_attempt_id\n",
            ),
        ],
    )

    drop_names(
        QUERIES / "quest_product.sql",
        {
            "ProductQuestReadHexes",
            "ProductQuestReplaceHexes",
            "ProductQuestInsertHexes",
            "ProductQuestInsertHistory",
            "ProductQuestReadHistory",
            "ProductQuestUpsertRewardDecision",
            "ProductQuestReadRewardDecisionCoverage",
            "ProductQuestInsertEntitlements",
            "ProductQuestReadEntitlements",
            "ProductQuestBatchReadEntitlements",
        },
    )
    quest_append = """
-- name: ProductQuestReadPointcrawlLinks :many
SELECT n.public_id::text AS node_id, q.public_id::text AS quest_id, qpn.role
FROM quest_pointcrawl_nodes qpn
JOIN quests q ON q.id = qpn.quest_id
JOIN pointcrawl_nodes n ON n.id = qpn.node_id
WHERE q.public_id = @quest_id::uuid
ORDER BY n.public_id, qpn.role;

-- name: ProductQuestReplacePointcrawlLinks :exec
DELETE FROM quest_pointcrawl_nodes WHERE quest_id = @quest_id::bigint;

-- name: ProductQuestInsertPointcrawlLinks :many
INSERT INTO quest_pointcrawl_nodes(quest_id, node_id, role)
SELECT @quest_id::bigint, n.id, input.role
FROM unnest(@node_ids::bigint[], @roles::text[]) AS input(node_id, role)
JOIN pointcrawl_nodes n ON n.id = input.node_id
RETURNING quest_id, node_id, role;

"""
    quest_path = QUERIES / "quest_product.sql"
    quest_path.write_text(
        quest_path.read_text(encoding="utf-8") + quest_append, encoding="utf-8"
    )

    patch_file(
        QUERIES / "site_product.sql",
        [
            (
                "        (SELECT count(*)::integer FROM hexes) AS total_hexes,\n",
                "        (SELECT count(*)::integer FROM pointcrawl_nodes) AS total_pointcrawl_nodes,\n",
            ),
            (
                "       totals.total_hexes, totals.total_regions, totals.total_quests,\n",
                "       totals.total_pointcrawl_nodes, totals.total_regions, totals.total_quests,\n",
            ),
        ],
    )
    drop_names(QUERIES / "site_product.sql", {"SiteAppendSettingChange"})

    spatial_keep = {
        "GetMapByAtlasCode",
        "ListMaps",
        "ListRegions",
        "GetGameCalendar",
        "GetGameDayForRealDate",
        "CountOpenQuestsInRegion",
        "UpsertGameTimeMapDay",
    }
    keep_only(QUERIES / "spatial.sql", spatial_keep)
    patch_file(
        QUERIES / "spatial.sql",
        [
            (
                "SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id, m.cols, m.rows\n",
                "SELECT m.public_id AS id, m.name, m.atlas_code, m.map_kind AS family, r.public_id AS region_id\n",
            ),
        ],
    )

    notif = """-- Inbox-only notifications (D1). No notification_events ledger.

-- name: ProductNotificationInbox :many
SELECT n.public_id, n.kind, n.subject_type, n.subject_id, n.body,
       n.read_at, n.created_at
FROM notifications n
JOIN members m ON m.id = n.member_id
WHERE m.public_id = sqlc.arg(member_id)::uuid
  AND (NOT sqlc.arg(unread_only)::boolean OR n.read_at IS NULL)
  AND (sqlc.narg(before_created_at)::timestamptz IS NULL
       OR (n.created_at, n.public_id) <
          (sqlc.narg(before_created_at)::timestamptz, sqlc.narg(before_notification_id)::uuid))
ORDER BY n.created_at DESC, n.public_id DESC
LIMIT sqlc.arg(page_size)::integer;

-- name: ProductNotificationUnreadCount :one
SELECT count(*)::bigint
FROM notifications n
JOIN members m ON m.id = n.member_id
WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL;

-- name: ProductNotificationLockOldestUnread :many
WITH selected AS MATERIALIZED (
    SELECT n.public_id
    FROM notifications n
    JOIN members m ON m.id = n.member_id
    WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL
    ORDER BY n.created_at ASC, n.public_id ASC
    LIMIT LEAST(sqlc.arg(row_limit)::integer, 100)
)
SELECT n.public_id, n.kind, n.subject_type, n.subject_id, n.body,
       n.read_at, n.created_at
FROM selected
JOIN notifications n ON n.public_id = selected.public_id
JOIN members m ON m.id = n.member_id
WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.read_at IS NULL
ORDER BY n.public_id
FOR UPDATE OF n;

-- name: ProductNotificationMarkRead :one
WITH locked AS MATERIALIZED (
    SELECT n.id
    FROM notifications n
    JOIN members m ON m.id = n.member_id
    WHERE m.public_id = sqlc.arg(member_id)::uuid
      AND n.public_id = ANY(sqlc.arg(notification_ids)::uuid[])
      AND n.read_at IS NULL
    ORDER BY n.public_id
    FOR UPDATE OF n
), changed AS (
    UPDATE notifications n
    SET read_at = sqlc.arg(read_at)::timestamptz
    FROM locked
    WHERE n.id = locked.id AND n.read_at IS NULL
    RETURNING n.public_id
)
SELECT count(*)::integer AS affected_count FROM changed;

-- name: ProductNotificationInsertInbox :many
INSERT INTO notifications (member_id, kind, subject_type, subject_id, body, created_at)
SELECT m.id, sqlc.arg(kind)::text, sqlc.narg(subject_type)::text, sqlc.narg(subject_id)::bigint,
       sqlc.arg(body)::text, sqlc.arg(created_at)::timestamptz
FROM members m
WHERE m.public_id = ANY(sqlc.arg(member_ids)::uuid[])
RETURNING public_id;
"""
    (QUERIES / "notification_product.sql").write_text(notif, encoding="utf-8")

    spatial_product_keep = {
        "GetProductMap",
        "ListProductMaps",
        "ListProductPointcrawlNodesForMaps",
        "ListProductPointcrawlEdgesForMaps",
        "ListProductPointcrawlLinksForNodes",
        "GetProductRegionCounts",
        "ReadProductRegionActivity",
        "ListProductRegions",
        "ListProductArchonAssignments",
        "CountProductArchonAssignments",
        "ReadProductCalendar",
        "ReadProductGameDate",
        "ReadProductGameDates",
        "ListProductRealDates",
        "CountProductRealDates",
        "ListProductCalendarCells",
        "ListProductTimeAnchors",
        "CountProductTimeAnchors",
        "ReadProductTimeAnchorAtOrBefore",
        "ListProductTimeAnchorCollisions",
        "LockProductMapByAtlasCode",
        "LockProductMap",
        "LockProductRegion",
        "LockProductPointcrawlNode",
        "LockProductPointcrawlEdge",
        "LockProductCalendar",
        "LockProductTimeAggregate",
        "LockProductTimeAnchor",
        "LockProductArchonAssignment",
        "CreateProductMap",
        "UpsertProductPointcrawlNode",
        "SetProductPointcrawlEdge",
        "LinkProductPointcrawlEntry",
        "UnlinkProductPointcrawlEntry",
        "AssignProductArchon",
        "RevokeProductArchon",
        "CreateProductRegion",
        "UpdateProductRegion",
        "RestoreProductRegion",
        "TransitionProductRegion",
        "CreateProductTimeAnchor",
        "UpdateProductTimeAnchor",
        "UpdateProductCalendar",
        "ReplaceProductGameTimeMapRange",
        "LockProductContainmentGraph",
        "ReadProductContainmentEdges",
    }
    keep_only(QUERIES / "spatial_product.sql", spatial_product_keep)

    for old, new in [
        (", m.cols, m.rows", ""),
        ("m.cols, m.rows,", ""),
        ("i.cols,i.rows,", ""),
        ("'cols',i.cols,'rows',i.rows,", ""),
        (
            """       (SELECT count(*)::int FROM maps m JOIN hexes h ON h.map_id=m.id
        WHERE m.region_id=r.id) AS hex_count,""",
            """       (SELECT count(*)::int FROM maps m JOIN pointcrawl_nodes pn ON pn.map_id=m.id
        WHERE m.region_id=r.id) AS pointcrawl_node_count,""",
        ),
        (
            """INSERT INTO maps(name,atlas_code,map_kind,family,region_id,cols,rows,asset_path,created_by)
  VALUES (sqlc.arg(name),sqlc.arg(atlas_code),sqlc.arg(map_kind),sqlc.arg(family),
          (SELECT r.id FROM regions r WHERE r.public_id=sqlc.narg(region_id)::uuid),
          sqlc.narg(cols),sqlc.narg(rows),sqlc.narg(asset_path),
          (SELECT actor.id FROM members actor WHERE actor.public_id=sqlc.arg(actor_id)::uuid))
  RETURNING *
), history AS (
  INSERT INTO map_changes(public_id,map_id,affected_type,affected_public_id,old_value,new_value,actor_id,recorded_at)
  SELECT sqlc.arg(history_id),i.id,'map',i.public_id,NULL,
         jsonb_build_object('id',i.public_id,'createdAt',i.created_at,
           'name',i.name,'atlasCode',i.atlas_code,'mapKind',i.map_kind,
           'family',i.family,'regionId',r.public_id,'cols',i.cols,'rows',i.rows,
           'assetPath',i.asset_path,'createdBy',actor.public_id),
         actor.id,sqlc.arg(recorded_at)
  FROM inserted i LEFT JOIN regions r ON r.id=i.region_id
  JOIN members actor ON actor.id=i.created_by
)""",
            """INSERT INTO maps(name,atlas_code,map_kind,family,region_id,asset_path,created_by)
  VALUES (sqlc.arg(name),sqlc.arg(atlas_code),sqlc.arg(map_kind),sqlc.arg(family),
          (SELECT r.id FROM regions r WHERE r.public_id=sqlc.narg(region_id)::uuid),
          sqlc.narg(asset_path),
          (SELECT actor.id FROM members actor WHERE actor.public_id=sqlc.arg(actor_id)::uuid))
  RETURNING *
)""",
        ),
    ]:
        patch_file(QUERIES / "spatial_product.sql", [(old, new)])

    # Strip history CTEs that referenced dropped *_changes tables in remaining commands.
    sp = QUERIES / "spatial_product.sql"
    text = sp.read_text(encoding="utf-8")
    text = re.sub(
        r", history AS \(\s*INSERT INTO pointcrawl_node_changes[\s\S]*?\)\s*",
        " ",
        text,
    )
    text = re.sub(
        r", history AS \(\s*INSERT INTO map_changes[\s\S]*?\)\s*",
        " ",
        text,
    )
    text = re.sub(
        r", history AS \(\s*INSERT INTO assignment_changes[\s\S]*?\)\s*",
        " ",
        text,
    )
    text = re.sub(
        r", history AS \(\s*INSERT INTO region_changes[\s\S]*?\)\s*",
        " ",
        text,
    )
    text = re.sub(
        r"\nINSERT INTO assignment_changes[\s\S]*?sqlc\.arg\(actor_id\)::uuid;\n",
        "\n",
        text,
        count=1,
    )
    text = text.replace(
        "FROM hexes h JOIN maps parent ON parent.id=h.map_id\nJOIN maps child ON child.id=h.submap_id WHERE h.submap_id IS NOT NULL\nUNION\n",
        "",
    )
    sp.write_text(text, encoding="utf-8")

    print("align_queries_a1: ok")


if __name__ == "__main__":
    main()
