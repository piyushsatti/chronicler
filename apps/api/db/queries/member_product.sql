-- name: ProductMemberIdentity :one
SELECT m.public_id, m.discord_id, m.handle, m.display_name, m.avatar_url,
       m.roles, m.status, m.joined_at, m.updated_at
FROM members m
WHERE (sqlc.narg(member_id)::uuid IS NOT NULL AND m.public_id=sqlc.narg(member_id))
   OR (sqlc.narg(member_id)::uuid IS NULL AND m.handle=sqlc.narg(handle)::text);
-- name: ProductMemberDiscordIdentity :one
SELECT public_id, discord_id FROM members WHERE public_id=sqlc.arg(member_id)::uuid;
-- name: ProductMemberByDiscordID :one
SELECT public_id,discord_id,handle,display_name,avatar_url,roles,status,joined_at,updated_at
FROM members WHERE discord_id=sqlc.arg(discord_id)::text;
-- name: ProductMembersPage :many
WITH matching AS (
 SELECT m.* FROM members m
 WHERE (sqlc.narg(status)::text IS NULL OR m.status=sqlc.narg(status))
 AND (sqlc.narg(role)::text IS NULL OR sqlc.narg(role)=ANY(m.roles))
 AND (sqlc.narg(search)::text IS NULL OR strpos(lower(m.handle),lower(sqlc.narg(search)))>0
      OR strpos(lower(m.display_name),lower(sqlc.narg(search)))>0)
), page AS (
 SELECT m.* FROM matching m
 ORDER BY CASE WHEN sqlc.arg(sort)::text='JOINED_AT_ASC' THEN joined_at END ASC,
 CASE WHEN sqlc.arg(sort)::text='JOINED_AT_DESC' THEN joined_at END DESC,
 CASE WHEN sqlc.arg(sort)::text='JOINED_AT_DESC' THEN public_id END DESC,
 CASE WHEN sqlc.arg(sort)::text='HANDLE' THEN handle END ASC, public_id ASC
 LIMIT sqlc.arg(page_limit)::int OFFSET sqlc.arg(page_offset)::int
)
SELECT (SELECT count(*) FROM matching)::bigint AS total,
 p.public_id,p.discord_id,p.handle,p.display_name,p.avatar_url,p.roles,p.status,p.joined_at
FROM (SELECT 1) marker LEFT JOIN page p ON true;
-- name: ProductCommunityDirectory :many
WITH matching AS (
 SELECT m.public_id,m.handle,m.display_name,m.avatar_url,m.roles,m.status,
 p.tagline,p.table_info,p.accepting_players,p.status AS dm_profile_status,p.review_revision,
 (m.status='active' AND 'dm'=ANY(m.roles) AND p.status='approved')::boolean AS is_dm,
 ARRAY(SELECT DISTINCT a.weekday FROM member_availability a WHERE a.member_id=m.id ORDER BY a.weekday)::smallint[] AS available_days
 FROM members m LEFT JOIN dm_profiles p ON p.member_id=m.id
 WHERE (sqlc.narg(role)::text IS NULL OR sqlc.narg(role)=ANY(m.roles))
 AND (sqlc.narg(search)::text IS NULL OR strpos(lower(m.handle),lower(sqlc.narg(search)))>0 OR strpos(lower(m.display_name),lower(sqlc.narg(search)))>0)
 AND (sqlc.narg(profile_status)::text IS NULL OR p.status=sqlc.narg(profile_status))
 AND (sqlc.narg(accepting_players)::boolean IS NULL OR p.accepting_players=sqlc.narg(accepting_players))
), page AS (SELECT * FROM matching ORDER BY handle,public_id LIMIT sqlc.arg(page_limit)::int OFFSET sqlc.arg(page_offset)::int)
SELECT (SELECT count(*) FROM matching)::bigint AS total,p.*
FROM (SELECT 1) marker LEFT JOIN page p ON true;
-- name: ProductPendingDmProfiles :many
WITH matching AS (
 SELECT m.public_id,m.handle,m.display_name,m.avatar_url,m.roles,m.status,
 p.tagline,p.table_info,p.accepting_players,p.status AS dm_profile_status,p.review_revision,
 (m.status='active' AND 'dm'=ANY(m.roles) AND p.status='approved')::boolean AS is_dm,
 ARRAY(SELECT DISTINCT a.weekday FROM member_availability a WHERE a.member_id=m.id ORDER BY a.weekday)::smallint[] AS available_days,
 p.updated_at AS submitted_at
 FROM dm_profiles p JOIN members m ON m.id=p.member_id
 WHERE p.status='pending'
), page AS (SELECT * FROM matching ORDER BY submitted_at ASC NULLS LAST,public_id ASC LIMIT sqlc.arg(page_limit)::int OFFSET sqlc.arg(page_offset)::int)
SELECT (SELECT count(*) FROM matching)::bigint AS total,p.*
FROM (SELECT 1) marker LEFT JOIN page p ON true;
-- name: ProductMemberAvailability :many
SELECT a.public_id,a.weekday,a.start_minute,a.end_minute,a.note
FROM member_availability a JOIN members m ON m.id=a.member_id
WHERE m.public_id=sqlc.arg(member_id)::uuid ORDER BY a.weekday,a.start_minute,a.public_id;
-- name: ProductMemberSettings :one
SELECT m.public_id AS member_id,s.updated_at,s.timezone,
 coalesce(s.theme,'parchment')::text AS theme,coalesce(s.mode,'system')::text AS mode,
 coalesce(s.effects_enabled,true)::boolean AS effects_enabled,
 coalesce(s.colorblind_safe,false)::boolean AS colorblind_safe,
 coalesce(s.reduced_motion,false)::boolean AS reduced_motion,
 coalesce(s.density,'comfortable')::text AS density,
 coalesce(s.notify_character_verification,true)::boolean AS notify_character_verification,
 coalesce(s.notify_quest_signup,true)::boolean AS notify_quest_signup,
 coalesce(s.notify_document_activity,true)::boolean AS notify_document_activity,
 coalesce(s.notify_quest_scheduled,true)::boolean AS notify_quest_scheduled,
 coalesce(s.notify_dm_mentioned,true)::boolean AS notify_dm_mentioned,
 coalesce(s.notify_dm_request_decided,true)::boolean AS notify_dm_request_decided
FROM members m LEFT JOIN member_settings s ON s.member_id=m.id WHERE m.public_id=sqlc.arg(member_id)::uuid;
-- name: ProductMemberProfile :one
SELECT m.public_id,p.* FROM members m JOIN dm_profiles p ON p.member_id=m.id WHERE m.public_id=sqlc.arg(member_id)::uuid;
-- name: ProductRoleHistory :many
WITH matching AS (
 SELECT c.public_id,m.public_id AS member_id,c.old_roles,c.new_roles,
 actor.public_id AS changed_by,c.occurred_at,c.note FROM role_changes c
 JOIN members m ON m.id=c.member_id JOIN members actor ON actor.id=c.changed_by
 WHERE m.public_id=sqlc.arg(member_id)::uuid
), page AS (SELECT * FROM matching ORDER BY occurred_at DESC,public_id DESC LIMIT sqlc.arg(page_limit)::int OFFSET sqlc.arg(page_offset)::int)
SELECT (SELECT count(*) FROM matching)::bigint AS total,p.* FROM (SELECT 1) marker LEFT JOIN page p ON true;
-- name: ProductUnlockCatalog :many
WITH matching AS (SELECT * FROM unlockables WHERE NOT sqlc.arg(active_only)::boolean OR active),
page AS (SELECT * FROM matching ORDER BY name,public_id LIMIT sqlc.arg(page_limit)::int OFFSET sqlc.arg(page_offset)::int)
SELECT (SELECT count(*) FROM matching)::bigint AS total,p.public_id,p.name,p.description,p.kind,p.active,p.payload,p.unlock_rule
FROM (SELECT 1) marker LEFT JOIN page p ON true;
-- name: ProductMemberGrants :many
SELECT u.public_id AS unlockable_id,m.public_id AS member_id,g.source,g.granted_at,g.note,
 a.public_id AS granted_by,u.name,u.kind,u.active,u.payload,u.unlock_rule
FROM member_unlocks g JOIN members m ON m.id=g.member_id JOIN unlockables u ON u.id=g.unlockable_id
LEFT JOIN members a ON a.id=g.granted_by WHERE m.public_id=sqlc.arg(member_id)::uuid
ORDER BY g.granted_at DESC,u.public_id DESC;
-- name: ProductLockMembers :many
SELECT public_id,roles,status,updated_at FROM members
WHERE public_id=ANY(sqlc.arg(member_ids)::uuid[]) ORDER BY public_id FOR NO KEY UPDATE;
-- name: ProductLockDmProfile :one
SELECT m.public_id,p.* FROM members m JOIN dm_profiles p ON p.member_id=m.id
WHERE m.public_id=sqlc.arg(member_id)::uuid FOR NO KEY UPDATE OF m FOR UPDATE OF p;
-- name: ProductLockUnlockable :one
SELECT * FROM unlockables WHERE public_id=sqlc.arg(unlockable_id)::uuid FOR UPDATE;
-- name: ProductUpdateMemberProfile :one
UPDATE members SET display_name=sqlc.arg(display_name)::text,
 avatar_url=CASE WHEN sqlc.arg(set_avatar)::boolean THEN sqlc.narg(avatar_url)::text ELSE avatar_url END,
 updated_at=sqlc.arg(at)::timestamptz WHERE public_id=sqlc.arg(actor_id)::uuid RETURNING *;
-- name: ProductUpdateMemberRoles :one
UPDATE members SET roles=sqlc.arg(roles)::text[],updated_at=sqlc.arg(at)::timestamptz
WHERE public_id=sqlc.arg(member_id)::uuid RETURNING *;
-- name: ProductAppendRoleHistory :one
INSERT INTO role_changes(public_id,member_id,old_roles,new_roles,changed_by,occurred_at,note)
VALUES(sqlc.arg(history_id)::uuid,(SELECT id FROM members WHERE public_id=sqlc.arg(member_id)::uuid),
 sqlc.arg(old_roles)::text[],sqlc.arg(new_roles)::text[],(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),sqlc.arg(at)::timestamptz,sqlc.narg(note)::text)
RETURNING public_id,occurred_at;
-- name: ProductDeleteAvailability :execrows
DELETE FROM member_availability WHERE member_id=(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid);
-- name: ProductInsertAvailability :many
WITH slots AS (SELECT unnest(sqlc.arg(weekdays)::smallint[]) AS weekday,unnest(sqlc.arg(starts)::smallint[]) AS start_minute,unnest(sqlc.arg(ends)::smallint[]) AS end_minute,unnest(sqlc.arg(notes)::text[]) AS note,unnest(sqlc.arg(notes_valid)::boolean[]) AS note_valid)
INSERT INTO member_availability(member_id,weekday,start_minute,end_minute,note)
SELECT m.id,x.weekday,x.start_minute,x.end_minute,CASE WHEN x.note_valid THEN x.note ELSE NULL::text END FROM members m CROSS JOIN slots x
WHERE m.public_id=sqlc.arg(actor_id)::uuid RETURNING public_id,weekday,start_minute,end_minute,note;
-- name: ProductStoreDmProfile :one
INSERT INTO dm_profiles(member_id,tagline,philosophy,house_rules,table_info,accepting_players,status,review_revision,updated_at)
VALUES((SELECT id FROM members WHERE public_id=sqlc.arg(member_id)::uuid),sqlc.narg(tagline)::text,sqlc.narg(philosophy)::text,
 sqlc.narg(house_rules)::text,sqlc.narg(table_info)::jsonb,sqlc.arg(accepting_players)::boolean,sqlc.arg(status)::text,sqlc.arg(revision)::int,sqlc.arg(at)::timestamptz)
ON CONFLICT(member_id) DO UPDATE SET tagline=excluded.tagline,philosophy=excluded.philosophy,house_rules=excluded.house_rules,
 table_info=excluded.table_info,accepting_players=excluded.accepting_players,status=excluded.status,review_revision=excluded.review_revision,updated_at=excluded.updated_at
RETURNING *;
-- name: ProductGrantUnlock :one
INSERT INTO member_unlocks(member_id,unlockable_id,source,granted_by,granted_at,note)
VALUES((SELECT id FROM members WHERE public_id=sqlc.arg(member_id)::uuid),(SELECT id FROM unlockables WHERE public_id=sqlc.arg(unlockable_id)::uuid),
 'grant',(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),sqlc.arg(at)::timestamptz,sqlc.arg(note)::text)
RETURNING granted_at;
-- name: ProductSetUnlockableActive :one
UPDATE unlockables SET active=sqlc.arg(active)::boolean WHERE public_id=sqlc.arg(unlockable_id)::uuid RETURNING *;
-- name: ProductStoreSettings :one
INSERT INTO member_settings(member_id,theme,mode,effects_enabled,colorblind_safe,reduced_motion,density,notify_character_verification,notify_quest_signup,notify_document_activity,notify_quest_scheduled,notify_dm_mentioned,notify_dm_request_decided,timezone,updated_at)
VALUES((SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),
coalesce(sqlc.narg(theme)::text,'parchment'),
coalesce(sqlc.narg(mode)::text,'system'),
coalesce(sqlc.narg(effects_enabled)::boolean,true),
coalesce(sqlc.narg(colorblind_safe)::boolean,false),
coalesce(sqlc.narg(reduced_motion)::boolean,false),
coalesce(sqlc.narg(density)::text,'comfortable'),
coalesce(sqlc.narg(notify_character_verification)::boolean,true),
coalesce(sqlc.narg(notify_quest_signup)::boolean,true),
coalesce(sqlc.narg(notify_document_activity)::boolean,true),
coalesce(sqlc.narg(notify_quest_scheduled)::boolean,true),
coalesce(sqlc.narg(notify_dm_mentioned)::boolean,true),
coalesce(sqlc.narg(notify_dm_request_decided)::boolean,true),
coalesce(sqlc.narg(timezone)::text,NULL),sqlc.arg(at)::timestamptz)
ON CONFLICT(member_id) DO UPDATE SET
theme=CASE WHEN sqlc.arg(set_theme)::boolean THEN sqlc.narg(theme)::text ELSE member_settings.theme END,
mode=CASE WHEN sqlc.arg(set_mode)::boolean THEN sqlc.narg(mode)::text ELSE member_settings.mode END,
effects_enabled=CASE WHEN sqlc.arg(set_effects_enabled)::boolean THEN sqlc.narg(effects_enabled)::boolean ELSE member_settings.effects_enabled END,
colorblind_safe=CASE WHEN sqlc.arg(set_colorblind_safe)::boolean THEN sqlc.narg(colorblind_safe)::boolean ELSE member_settings.colorblind_safe END,
reduced_motion=CASE WHEN sqlc.arg(set_reduced_motion)::boolean THEN sqlc.narg(reduced_motion)::boolean ELSE member_settings.reduced_motion END,
density=CASE WHEN sqlc.arg(set_density)::boolean THEN sqlc.narg(density)::text ELSE member_settings.density END,
notify_character_verification=CASE WHEN sqlc.arg(set_notify_character_verification)::boolean THEN sqlc.narg(notify_character_verification)::boolean ELSE member_settings.notify_character_verification END,
notify_quest_signup=CASE WHEN sqlc.arg(set_notify_quest_signup)::boolean THEN sqlc.narg(notify_quest_signup)::boolean ELSE member_settings.notify_quest_signup END,
notify_document_activity=CASE WHEN sqlc.arg(set_notify_document_activity)::boolean THEN sqlc.narg(notify_document_activity)::boolean ELSE member_settings.notify_document_activity END,
notify_quest_scheduled=CASE WHEN sqlc.arg(set_notify_quest_scheduled)::boolean THEN sqlc.narg(notify_quest_scheduled)::boolean ELSE member_settings.notify_quest_scheduled END,
notify_dm_mentioned=CASE WHEN sqlc.arg(set_notify_dm_mentioned)::boolean THEN sqlc.narg(notify_dm_mentioned)::boolean ELSE member_settings.notify_dm_mentioned END,
notify_dm_request_decided=CASE WHEN sqlc.arg(set_notify_dm_request_decided)::boolean THEN sqlc.narg(notify_dm_request_decided)::boolean ELSE member_settings.notify_dm_request_decided END,
timezone=CASE WHEN sqlc.arg(set_timezone)::boolean THEN sqlc.narg(timezone)::text ELSE member_settings.timezone END,
updated_at=excluded.updated_at RETURNING *;
-- name: ProductCreateUnlockable :one
INSERT INTO unlockables(public_id,code,name,description,kind,active,payload,unlock_rule)
VALUES(sqlc.arg(unlockable_id)::uuid,'unlock_' || replace(sqlc.arg(unlockable_id)::uuid::text,'-',''),sqlc.arg(name)::text,
 sqlc.narg(description)::text,sqlc.arg(kind)::text,sqlc.arg(active)::boolean,sqlc.arg(payload)::jsonb,sqlc.narg(unlock_rule)::jsonb)
RETURNING *;
-- name: ProductUpdateUnlockable :one
UPDATE unlockables SET name=sqlc.arg(name)::text,description=sqlc.narg(description)::text,
 kind=sqlc.arg(kind)::text,active=sqlc.arg(active)::boolean,payload=sqlc.arg(payload)::jsonb,unlock_rule=sqlc.narg(unlock_rule)::jsonb
WHERE public_id=sqlc.arg(unlockable_id)::uuid RETURNING *;
-- name: ProductAppendDmVerification :one
INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,note,created_at,review_revision)
VALUES(sqlc.arg(verification_id)::uuid,'dm_profile',(SELECT id FROM members WHERE public_id=sqlc.arg(member_id)::uuid),
 sqlc.arg(verdict)::text,(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),sqlc.narg(note)::text,
 sqlc.arg(at)::timestamptz,sqlc.arg(pending_revision)::int) RETURNING public_id,created_at;
-- name: ProductAppendCharacterVerification :one
INSERT INTO verifications(public_id,subject_type,subject_id,verdict,decided_by,note,created_at,review_revision)
SELECT sqlc.arg(verification_id)::uuid,'character',c.id,sqlc.arg(verdict)::text,a.id,sqlc.narg(note)::text,
 sqlc.arg(at)::timestamptz,NULL::int
FROM characters c
JOIN members a ON a.public_id=sqlc.arg(actor_id)::uuid
WHERE c.public_id=sqlc.arg(character_id)::uuid AND c.status='pending_approval'
 AND c.verification_submitted_at=sqlc.arg(submission_token)::timestamptz
RETURNING public_id,created_at;
-- name: ProductExistingGrant :one
SELECT u.public_id AS unlockable_id,m.public_id AS member_id,g.source,g.granted_at,a.public_id AS granted_by
FROM member_unlocks g JOIN members m ON m.id=g.member_id JOIN unlockables u ON u.id=g.unlockable_id
LEFT JOIN members a ON a.id=g.granted_by
WHERE m.public_id=sqlc.arg(member_id)::uuid AND u.public_id=sqlc.arg(unlockable_id)::uuid;
-- name: ProductBatchMembers :many
SELECT k.ordinality::bigint AS position,m.public_id,m.discord_id,m.handle,m.display_name,m.avatar_url,m.roles,m.status,m.joined_at
FROM unnest(sqlc.arg(member_ids)::uuid[]) WITH ORDINALITY k(member_id,ordinality)
LEFT JOIN members m ON m.public_id=k.member_id ORDER BY k.ordinality;
-- name: ProductMemberActivity :one
SELECT m.public_id,
 coalesce((SELECT sum(e.amount) FROM discord_activity_events e WHERE e.discord_user_id=m.discord_id AND e.kind='message'),0)::float8 AS messages,
 coalesce((SELECT sum(e.amount) FROM discord_activity_events e WHERE e.discord_user_id=m.discord_id AND e.kind='reaction'),0)::float8 AS reactions,
 coalesce((SELECT sum(e.amount) FROM discord_activity_events e WHERE e.discord_user_id=m.discord_id AND e.kind='voice'),0)::float8 AS voice_minutes,
 (SELECT max(e.occurred_at) FROM discord_activity_events e WHERE e.discord_user_id=m.discord_id AND e.kind='message') AS last_message_at,
 coalesce((SELECT max(e.amount)/60.0 FROM discord_activity_events e WHERE e.discord_user_id=m.discord_id AND e.kind='voice'),0)::float8 AS longest_session_hours,
 (SELECT count(DISTINCT qp.quest_id) FROM quest_participants qp WHERE qp.member_id=m.id AND qp.status='played')::bigint AS quests_played,
 (SELECT count(*) FROM documents d WHERE d.author_id=m.id AND d.kind='summary' AND d.deleted_at IS NULL)::bigint AS summaries_authored
FROM members m WHERE m.public_id=sqlc.arg(member_id)::uuid;
-- name: ProductMemberDriverProgress :one
SELECT m.public_id,
 (extract(year FROM age(sqlc.arg(as_of)::timestamptz,m.joined_at))*12+extract(month FROM age(sqlc.arg(as_of)::timestamptz,m.joined_at)))::int AS tenure_months,
 (SELECT count(*) FROM quests q WHERE q.dm_id=m.id AND q.status IN ('played','closed'))::bigint AS dm_sessions_count,
 (SELECT count(DISTINCT p.quest_id) FROM quest_participants p JOIN quests q ON q.id=p.quest_id WHERE p.member_id=m.id AND p.status='played' AND q.status IN ('played','closed'))::bigint AS player_quests_count
FROM members m WHERE m.public_id=sqlc.arg(member_id)::uuid;
-- name: ProductBatchVoiceChannels :many
WITH requested AS (SELECT DISTINCT unnest(sqlc.arg(member_ids)::uuid[]) AS member_id), totals AS (
 SELECT m.public_id AS member_id,e.channel_id,sum(e.amount)::float8 AS minutes
 FROM requested k JOIN members m ON m.public_id=k.member_id JOIN discord_activity_events e ON e.discord_user_id=m.discord_id
 WHERE e.kind='voice' GROUP BY m.public_id,e.channel_id
), ranked AS (SELECT *,row_number() OVER(PARTITION BY member_id ORDER BY minutes DESC,channel_id ASC) AS rn FROM totals)
SELECT * FROM ranked WHERE rn>sqlc.arg(page_offset)::int AND rn<=sqlc.arg(page_offset)::int+sqlc.arg(page_limit)::int ORDER BY member_id,rn;
-- name: ProductBatchRecentSessions :many
WITH requested AS (SELECT DISTINCT unnest(sqlc.arg(member_ids)::uuid[]) AS member_id), ranked AS (
 SELECT m.public_id AS member_id,e.kind,e.channel_id,e.occurred_at,e.amount,
 row_number() OVER(PARTITION BY m.public_id ORDER BY e.occurred_at DESC,e.event_id DESC) AS rn
 FROM requested k JOIN members m ON m.public_id=k.member_id JOIN discord_activity_events e ON e.discord_user_id=m.discord_id
 WHERE e.kind='voice'
)
SELECT * FROM ranked WHERE rn>sqlc.arg(page_offset)::int AND rn<=sqlc.arg(page_offset)::int+sqlc.arg(page_limit)::int ORDER BY member_id,rn;
-- name: ProductBatchRecentWeeks :many
WITH requested AS (SELECT DISTINCT unnest(sqlc.arg(member_ids)::uuid[]) AS member_id), weeks AS (
 SELECT m.public_id AS member_id,date_trunc('week',e.occurred_at AT TIME ZONE 'UTC')::date AS period_start,
 coalesce(sum(e.amount) FILTER(WHERE e.kind='message'),0)::float8 AS messages,
 coalesce(sum(e.amount) FILTER(WHERE e.kind='reaction'),0)::float8 AS reactions,
 coalesce(sum(e.amount) FILTER(WHERE e.kind='voice'),0)::float8 AS voice_minutes
 FROM requested k JOIN members m ON m.public_id=k.member_id JOIN discord_activity_events e ON e.discord_user_id=m.discord_id
 GROUP BY m.public_id,date_trunc('week',e.occurred_at AT TIME ZONE 'UTC')::date
), ranked AS (SELECT *,row_number() OVER(PARTITION BY member_id ORDER BY period_start DESC) AS rn FROM weeks)
SELECT * FROM ranked WHERE rn>sqlc.arg(page_offset)::int AND rn<=sqlc.arg(page_offset)::int+sqlc.arg(page_limit)::int ORDER BY member_id,rn;
-- name: ProductSetMemberRolesBatch :many
WITH inputs AS (
 SELECT (j.value->>'memberId')::uuid AS member_id,
 (j.value->>'historyId')::uuid AS history_id,j.value->>'note' AS note,
 ARRAY(SELECT jsonb_array_elements_text(j.value->'roles'))::text[] AS roles
 FROM jsonb_array_elements(sqlc.arg(changes)::jsonb) j
), prior AS MATERIALIZED (
 SELECT m.id,m.public_id,m.roles AS old_roles,i.roles AS new_roles,i.history_id,i.note
 FROM inputs i JOIN members m ON m.public_id=i.member_id ORDER BY m.public_id FOR NO KEY UPDATE OF m
), changed AS (
 UPDATE members m SET roles=p.new_roles,updated_at=sqlc.arg(at)::timestamptz
 FROM prior p WHERE m.id=p.id RETURNING m.id,m.public_id,m.roles,m.updated_at
), history AS (
 INSERT INTO role_changes(public_id,member_id,old_roles,new_roles,changed_by,occurred_at,note)
 SELECT p.history_id,c.id,p.old_roles,c.roles,(SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),
 sqlc.arg(at)::timestamptz,p.note FROM changed c JOIN prior p ON p.id=c.id
 RETURNING member_id,public_id AS history_id
)
SELECT c.public_id,m.discord_id,m.handle,m.display_name,m.avatar_url,c.roles,m.status,m.joined_at,c.updated_at,h.history_id
FROM changed c JOIN members m ON m.id=c.id JOIN history h ON h.member_id=c.id ORDER BY c.public_id;
-- name: ProductCompleteUnlockCatalog :many
SELECT public_id,name,description,kind,active,payload,unlock_rule FROM unlockables ORDER BY name,public_id;
-- name: ProductMemberPrivateNotes :one
SELECT coalesce(s.payload->'private_notes'->>'body','')::text AS body,
 (s.payload->'private_notes'->>'updated_at')::timestamptz AS updated_at
FROM members m LEFT JOIN member_settings s ON s.member_id=m.id WHERE m.public_id=sqlc.arg(member_id)::uuid;
-- name: ProductStorePrivateNotes :one
INSERT INTO member_settings(member_id,payload,updated_at)
VALUES((SELECT id FROM members WHERE public_id=sqlc.arg(actor_id)::uuid),
 jsonb_build_object('private_notes',jsonb_build_object('body',sqlc.arg(body)::text,'updated_at',sqlc.arg(at)::timestamptz)),
 sqlc.arg(at)::timestamptz)
ON CONFLICT(member_id) DO UPDATE SET
payload=jsonb_set(member_settings.payload,'{private_notes}',jsonb_build_object('body',sqlc.arg(body)::text,'updated_at',sqlc.arg(at)::timestamptz))
RETURNING (payload->'private_notes'->>'body')::text AS body,(payload->'private_notes'->>'updated_at')::timestamptz AS updated_at;
