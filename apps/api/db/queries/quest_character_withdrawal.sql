-- name: ProductQuestCharacterWithdrawalPlan :many
WITH scope AS (
    SELECT q.id
    FROM quests q
    JOIN quest_participants own ON own.quest_id = q.id
    JOIN characters target ON target.id = own.character_id
    WHERE target.public_id = @character_id::uuid
      AND q.deleted_at IS NULL AND q.status IN ('open', 'full')
      AND own.status IN ('signed_up', 'waitlisted')
      AND (cardinality(@quest_ids::uuid[]) = 0 OR q.public_id = ANY(@quest_ids::uuid[]))
)
SELECT q.public_id AS quest_id, c.public_id AS character_id, m.public_id AS member_id,
       p.status, q.scheduled_at, p.created_at, p.updated_at
FROM scope
JOIN quests q ON q.id = scope.id
JOIN quest_participants p ON p.quest_id = q.id
JOIN characters c ON c.id = p.character_id
JOIN members m ON m.id = p.member_id
WHERE c.deleted_at IS NULL
ORDER BY q.public_id, p.created_at, c.public_id;

-- name: ProductQuestWithdrawalAdmissions :many
SELECT c.public_id, owner.public_id AS owner_id, c.status, owner.status AS owner_status, c.updated_at
FROM characters c JOIN members owner ON owner.id = c.owner_id
WHERE c.public_id = ANY(@character_ids::uuid[]) AND c.deleted_at IS NULL
ORDER BY c.public_id;
