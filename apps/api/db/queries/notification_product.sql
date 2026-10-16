-- name: ProductNotificationInbox :many
SELECT n.public_id, n.kind, n.subject_type, n.subject_id, n.body,
       n.read_at, n.created_at, e.public_id AS event_public_id,
       e.event_key, e.kind AS event_kind, e.subject_type AS event_subject_type,
       e.subject_public_id AS event_subject_public_id, e.facts,
       e.created_at AS event_created_at, a.public_id AS event_actor_public_id
FROM notifications n
JOIN members m ON m.id = n.member_id
LEFT JOIN notification_events e ON e.id = n.event_id
LEFT JOIN members a ON a.id = e.actor_id
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
       n.read_at, n.created_at, e.public_id AS event_public_id,
       e.event_key, e.kind AS event_kind, e.subject_type AS event_subject_type,
       e.subject_public_id AS event_subject_public_id, e.facts,
       e.created_at AS event_created_at, a.public_id AS event_actor_public_id
FROM selected
JOIN notifications n ON n.public_id = selected.public_id
JOIN members m ON m.id = n.member_id
LEFT JOIN notification_events e ON e.id = n.event_id
LEFT JOIN members a ON a.id = e.actor_id
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

-- name: ProductNotificationInsertEvent :one
INSERT INTO notification_events (actor_id, created_at, event_key, facts, kind,
                                 subject_public_id, subject_type)
SELECT m.id, sqlc.arg(created_at)::timestamptz, sqlc.arg(event_key)::text,
       sqlc.arg(facts)::jsonb, sqlc.arg(kind)::text,
       sqlc.arg(subject_public_id)::uuid, sqlc.arg(subject_type)::text
FROM members m
WHERE m.public_id = sqlc.arg(actor_id)::uuid
RETURNING public_id;

-- name: ProductNotificationInsertRecipients :one
WITH inserted AS (
    INSERT INTO notifications (member_id, event_id, kind, subject_type, created_at)
    SELECT m.id, e.id, e.kind, e.subject_type, sqlc.arg(created_at)::timestamptz
    FROM notification_events e
    CROSS JOIN members m
    WHERE e.public_id = sqlc.arg(event_id)::uuid
      AND m.public_id = ANY(sqlc.arg(member_ids)::uuid[])
    ON CONFLICT (event_id, member_id) DO NOTHING
    RETURNING public_id
)
SELECT (SELECT count(*)::integer FROM inserted) AS affected_count,
       (SELECT count(DISTINCT requested)::integer
        FROM unnest(sqlc.arg(member_ids)::uuid[]) AS requested) AS requested_count,
       (SELECT count(*)::integer FROM members
        WHERE public_id = ANY(sqlc.arg(member_ids)::uuid[])) AS resolved_count,
       EXISTS(SELECT 1 FROM notification_events
              WHERE public_id = sqlc.arg(event_id)::uuid) AS event_found;

-- name: ProductNotificationSubjectProofs :many
WITH requested AS (
    SELECT notification_id, ordinal,
           (sqlc.arg(event_ids)::uuid[])[ordinal] AS event_id,
           (sqlc.arg(subject_types)::text[])[ordinal] AS subject_type,
           (sqlc.arg(subject_ids)::uuid[])[ordinal] AS subject_id
    FROM unnest(sqlc.arg(notification_ids)::uuid[])
         WITH ORDINALITY AS k(notification_id, ordinal)
)
SELECT k.ordinal, k.notification_id AS requested_notification_id,
       k.event_id AS requested_event_id, k.subject_type AS requested_subject_type,
       k.subject_id AS requested_subject_id,
       n.public_id AS notification_id, n.kind AS notification_kind,
       n.subject_type AS notification_subject_type,
       n.created_at AS notification_created_at,
       e.public_id AS event_id, e.event_key, e.kind AS event_kind,
       e.subject_type AS event_subject_type, e.subject_public_id AS event_subject_id,
       e.facts AS event_facts, e.created_at AS event_occurred_at,
       ea.public_id AS event_actor_id,
       c.public_id AS current_character_id, c.name AS current_character_name,
       c.short_code AS current_character_code, co.public_id AS character_owner_id,
       q.public_id AS current_quest_id, q.short_code AS current_quest_code,
       d.public_id AS current_document_id, d.deleted_at AS current_document_deleted_at,
       da.public_id AS document_author_id,
       rq.public_id AS current_request_id,
       v.public_id AS verification_id, v.subject_type AS verification_subject_type,
       vc.public_id AS verification_character_id, v.verdict AS verification_verdict, v.note AS verification_note,
       va.public_id AS verification_actor_id, v.created_at AS verification_occurred_at,
       r.public_id AS revision_id, rd.public_id AS revision_document_id,
       ra.public_id AS revision_actor_id, r.created_at AS revision_occurred_at,
       r.new_value AS revision_new_value, r.old_value AS revision_old_value,
       r.reason AS revision_reason, r.published_at AS revision_published_at,
       qc.public_id AS quest_change_id, qq.public_id AS quest_change_quest_id,
       qa.public_id AS quest_change_actor_id, qc.created_at AS quest_change_occurred_at,
       qc.kind AS quest_change_kind, qc.facts AS quest_change_facts,
       pc.public_id AS participation_character_id, po.public_id AS participation_owner_id,
       dec.public_id AS decision_id, dr.public_id AS decision_request_id,
       dec.decision AS request_decision, dec.note AS request_note, dea.public_id AS decision_actor_id,
       dec.recorded_at AS decision_occurred_at,
       requester.public_id AS request_requester_id, target.public_id AS request_target_dm_id
FROM requested k
LEFT JOIN members recipient ON recipient.public_id = sqlc.arg(member_id)::uuid
LEFT JOIN notifications n ON n.public_id = k.notification_id AND n.member_id = recipient.id
LEFT JOIN notification_events e ON e.id = n.event_id AND e.public_id = k.event_id
     AND e.subject_type = k.subject_type AND e.subject_public_id = k.subject_id
LEFT JOIN members ea ON ea.id = e.actor_id
LEFT JOIN characters c ON e.subject_type = 'character' AND c.public_id = e.subject_public_id
LEFT JOIN members co ON co.id = c.owner_id
LEFT JOIN quests q ON e.subject_type = 'quest' AND q.public_id = e.subject_public_id
LEFT JOIN documents d ON e.subject_type = 'document' AND d.public_id = e.subject_public_id
LEFT JOIN members da ON da.id = d.author_id
LEFT JOIN dm_requests rq ON e.subject_type = 'request' AND rq.public_id = e.subject_public_id
LEFT JOIN verifications v ON e.kind = 'CHARACTER_VERIFICATION_DECIDED'
     AND v.public_id = (e.facts -> 'characterDecision' ->> 'verificationId')::uuid
LEFT JOIN characters vc ON v.subject_type = 'character' AND vc.id = v.subject_id
LEFT JOIN members va ON va.id = v.decided_by
LEFT JOIN document_revisions r ON r.public_id = CASE
     WHEN e.kind IN ('DOCUMENT_EDITED', 'DOCUMENT_PUBLISHED')
          THEN (e.facts -> 'document' ->> 'revisionId')::uuid
     WHEN e.kind = 'DM_MENTIONED' THEN (e.facts -> 'mention' ->> 'revisionId')::uuid
     END
LEFT JOIN documents rd ON rd.id = r.document_id
LEFT JOIN members ra ON ra.id = r.created_by
LEFT JOIN quest_changes qc ON qc.public_id = CASE
     WHEN e.kind = 'QUEST_SCHEDULED' THEN (e.facts -> 'questChange' ->> 'questChangeId')::uuid
     WHEN e.kind = 'QUEST_SIGNUP_CONFIRMED' THEN (e.facts -> 'signup' ->> 'questChangeId')::uuid
     WHEN e.kind = 'QUEST_WAITLIST_PROMOTED' THEN (e.facts -> 'promotion' ->> 'questChangeId')::uuid
     END
LEFT JOIN quests qq ON qq.id = qc.quest_id
LEFT JOIN members qa ON qa.id = qc.actor_id
LEFT JOIN characters pc ON pc.public_id = CASE
     WHEN e.kind = 'QUEST_SIGNUP_CONFIRMED' THEN (e.facts -> 'signup' ->> 'characterId')::uuid
     WHEN e.kind = 'QUEST_WAITLIST_PROMOTED' THEN (e.facts -> 'promotion' ->> 'characterId')::uuid
     END
LEFT JOIN members po ON po.id = pc.owner_id
LEFT JOIN request_decisions dec ON e.kind = 'DM_REQUEST_DECIDED'
     AND dec.public_id = (e.facts -> 'request' ->> 'decisionId')::uuid
LEFT JOIN dm_requests dr ON dr.id = dec.request_id
LEFT JOIN members dea ON dea.id = dec.actor_id
LEFT JOIN members requester ON requester.id = dr.requester_id
LEFT JOIN members target ON target.id = dr.target_dm_id
ORDER BY k.ordinal;
