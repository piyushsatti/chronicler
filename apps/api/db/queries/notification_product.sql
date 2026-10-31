-- Inbox-only notifications (D1). No notification_events ledger.

-- name: ProductNotificationInbox :many
SELECT n.public_id, n.kind, n.subject_type,
       (CASE n.subject_type WHEN 'document' THEN d.public_id WHEN 'character' THEN c.public_id WHEN 'quest' THEN q.public_id END)::uuid AS subject_public_id,
       n.body, n.read_at, n.created_at
FROM notifications n
JOIN members m ON m.id = n.member_id
LEFT JOIN documents d ON n.subject_type = 'document' AND d.id = n.subject_id
LEFT JOIN characters c ON n.subject_type = 'character' AND c.id = n.subject_id
LEFT JOIN quests q ON n.subject_type = 'quest' AND q.id = n.subject_id
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
SELECT n.public_id, n.kind, n.subject_type,
       (CASE n.subject_type
         WHEN 'document' THEN d.public_id
         WHEN 'character' THEN c.public_id
         WHEN 'quest' THEN q.public_id
         ELSE NULL
       END)::uuid AS subject_public_id,
       (n.subject_id IS NOT NULL)::boolean AS subject_ref_present,
       n.body, n.read_at, n.created_at
FROM selected
JOIN notifications n ON n.public_id = selected.public_id
JOIN members m ON m.id = n.member_id
LEFT JOIN documents d ON n.subject_type = 'document' AND d.id = n.subject_id
LEFT JOIN characters c ON n.subject_type = 'character' AND c.id = n.subject_id
LEFT JOIN quests q ON n.subject_type = 'quest' AND q.id = n.subject_id
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
WITH inserted AS (
 INSERT INTO notifications (member_id, kind, subject_type, subject_id, body, created_at)
 SELECT m.id, sqlc.arg(kind)::text, sqlc.arg(subject_type)::text,
        CASE sqlc.arg(subject_type)::text
          WHEN 'document' THEN (SELECT id FROM documents WHERE public_id = sqlc.arg(subject_id)::uuid)
          WHEN 'character' THEN (SELECT id FROM characters WHERE public_id = sqlc.arg(subject_id)::uuid)
          WHEN 'quest' THEN (SELECT id FROM quests WHERE public_id = sqlc.arg(subject_id)::uuid)
        END,
        sqlc.arg(body)::text, sqlc.arg(created_at)::timestamptz
 FROM members m WHERE m.public_id = ANY(sqlc.arg(member_ids)::uuid[])
 RETURNING public_id, member_id
)
SELECT inserted.public_id, m.public_id AS recipient_id FROM inserted JOIN members m ON m.id = inserted.member_id;

-- name: ProductNotificationPreferences :many
SELECT public_id FROM members WHERE public_id = ANY(sqlc.arg(member_ids)::uuid[]);

-- name: ProductNotificationRowsForProof :many
SELECT n.public_id, n.kind, n.subject_type,
       (CASE n.subject_type WHEN 'document' THEN d.public_id WHEN 'character' THEN c.public_id WHEN 'quest' THEN q.public_id END)::uuid AS subject_public_id,
       n.body, n.read_at, n.created_at
FROM notifications n
JOIN members m ON m.id = n.member_id
LEFT JOIN documents d ON n.subject_type = 'document' AND d.id = n.subject_id
LEFT JOIN characters c ON n.subject_type = 'character' AND c.id = n.subject_id
LEFT JOIN quests q ON n.subject_type = 'quest' AND q.id = n.subject_id
WHERE m.public_id = sqlc.arg(member_id)::uuid AND n.public_id = ANY(sqlc.arg(notification_ids)::uuid[]);

-- name: ProductNotificationProofs :many
SELECT request.notification_id::uuid AS notification_id,
       COALESCE((SELECT jsonb_agg(proof)
         FROM jsonb_array_elements(receipt.receipt -> '_notificationProofs') proof
         WHERE proof ->> 'notificationId' = request.notification_id::text), 'null'::jsonb)::jsonb AS command_proofs,
       jsonb_build_object(
        'subjectCode', CASE n.subject_type
          WHEN 'character' THEN CASE WHEN c.deleted_at IS NULL THEN c.short_code END
          WHEN 'quest' THEN CASE WHEN q.deleted_at IS NULL THEN q.short_code END
          WHEN 'document' THEN CASE WHEN d.kind = 'quest_brief' THEN (
            SELECT CASE WHEN count(*) = 1 THEN min(brief_quest.short_code) END
            FROM quests brief_quest WHERE brief_quest.document_id = d.id AND brief_quest.deleted_at IS NULL
          ) END
        END,
        'subjectExists', CASE n.subject_type WHEN 'document' THEN d.id IS NOT NULL WHEN 'character' THEN c.id IS NOT NULL WHEN 'quest' THEN q.id IS NOT NULL ELSE false END,
        'characterId', event_character.public_id,
        'characterOwnerId', character_owner.public_id,
        'participantExists', participant.quest_id IS NOT NULL,
        'verificationId', verification.public_id,
        'verificationCharacterId', verified_character.public_id,
        'verdict', verification.verdict,
        'deciderId', decider.public_id,
        'verificationAt', verification.created_at,
        'documentAuthorId', document_author.public_id,
        'revisionId', revision.public_id,
        'revisionDocumentId', revised_document.public_id,
        'revisionActorId', reviser.public_id,
        'revisionAt', revision.created_at,
        'revisionMentionMemberIds', revision.new_value -> 'newMentionMemberIds'
       ) AS source_proof
FROM jsonb_to_recordset(sqlc.arg(requests)::jsonb) AS request(
 notification_id uuid, actor_id uuid, operation text, key text, fingerprint text,
 character_id uuid, verification_id uuid, revision_id uuid
)
JOIN notifications n ON n.public_id = request.notification_id
JOIN members recipient ON recipient.id = n.member_id AND recipient.public_id = sqlc.arg(member_id)::uuid
LEFT JOIN members origin_actor ON origin_actor.public_id = request.actor_id
LEFT JOIN idempotency_keys receipt ON receipt.actor_id = origin_actor.id
 AND receipt.endpoint = 'graphql:' || request.operation AND receipt.key = request.key
 AND receipt.fingerprint = request.fingerprint AND receipt.completed_at IS NOT NULL
LEFT JOIN documents d ON n.subject_type = 'document' AND d.id = n.subject_id
LEFT JOIN characters c ON n.subject_type = 'character' AND c.id = n.subject_id
LEFT JOIN quests q ON n.subject_type = 'quest' AND q.id = n.subject_id
LEFT JOIN characters event_character ON event_character.public_id = request.character_id
LEFT JOIN members character_owner ON character_owner.id = event_character.owner_id
LEFT JOIN quest_participants participant ON participant.quest_id = q.id AND participant.character_id = event_character.id
LEFT JOIN verifications verification ON verification.public_id = request.verification_id AND verification.subject_type = 'character'
LEFT JOIN characters verified_character ON verified_character.id = verification.subject_id
LEFT JOIN members decider ON decider.id = verification.decided_by
LEFT JOIN members document_author ON document_author.id = d.author_id
LEFT JOIN document_revisions revision ON revision.public_id = request.revision_id
LEFT JOIN documents revised_document ON revised_document.id = revision.document_id
LEFT JOIN members reviser ON reviser.id = revision.created_by;
