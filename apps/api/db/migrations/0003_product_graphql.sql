-- +goose Up
LOCK TABLE unlockables,member_unlocks IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
DECLARE bad record;
BEGIN
 SELECT m.public_id AS owner, array_agg(d.public_id) AS documents INTO bad
 FROM documents d LEFT JOIN members m ON m.id=d.author_id
 WHERE d.kind='community' AND d.category='dm_table' AND d.deleted_at IS NULL
 GROUP BY m.public_id HAVING count(*)>1 OR m.public_id IS NULL LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'DM table author preflight owner %, documents %',bad.owner,bad.documents; END IF;
 IF EXISTS(SELECT 1 FROM idempotency_keys WHERE endpoint LIKE 'graphql:%') THEN
 RAISE EXCEPTION 'Reserved graphql receipt namespace already occupied'; END IF;
 IF EXISTS(SELECT 1 FROM dm_profiles WHERE review_revision<0 OR status NOT IN ('draft','pending','approved','rejected')) THEN
 RAISE EXCEPTION 'Invalid DM profile baseline'; END IF;
 IF (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='document_links') <> ARRAY['source_id','target_id','relation'] THEN
 RAISE EXCEPTION 'Unexpected document_links shape'; END IF;
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='document_links'::regclass AND conname='document_links_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (source_id, target_id, relation)') OR
 NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='document_links'::regclass AND contype='f' AND pg_get_constraintdef(oid)='FOREIGN KEY (source_id) REFERENCES documents(id) ON DELETE CASCADE') OR
 NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='document_links'::regclass AND contype='f' AND pg_get_constraintdef(oid)='FOREIGN KEY (target_id) REFERENCES documents(id) ON DELETE CASCADE') OR
 (SELECT count(*) FROM pg_constraint WHERE conrelid='document_links'::regclass AND contype='f' AND confrelid='documents'::regclass AND confdeltype='c')<>2 OR
 NOT EXISTS(SELECT FROM pg_indexes WHERE schemaname=current_schema() AND indexname='document_links_target_id_idx' AND indexdef LIKE '%(target_id)') THEN
 RAISE EXCEPTION 'Unexpected document_links constraints'; END IF;
 IF EXISTS(SELECT FROM document_links l LEFT JOIN documents s ON s.id=l.source_id LEFT JOIN documents t ON t.id=l.target_id WHERE s.id IS NULL OR t.id IS NULL) THEN RAISE EXCEPTION 'Unresolved Document edge'; END IF;
 WITH expected(table_name,column_name,type_name,not_null,identity_kind,default_value) AS (VALUES
 ('unlockables','id','bigint',true,'d',NULL),
 ('unlockables','public_id','uuid',true,'','gen_random_uuid()'),
 ('unlockables','code','text',true,'',NULL),
 ('unlockables','cosmetic_type','text',true,'',NULL),
 ('unlockables','active','boolean',true,'','true'),
 ('unlockables','payload','jsonb',true,'',$default$'{}'::jsonb$default$),
 ('member_unlocks','member_id','bigint',true,'',NULL),
 ('member_unlocks','unlockable_id','bigint',true,'',NULL),
 ('member_unlocks','source','text',true,'',NULL),
 ('member_unlocks','granted_by','bigint',false,'',NULL),
 ('member_unlocks','granted_at','timestamptz',true,'','now()')
 ), actual AS (
 SELECT c.relname::text AS table_name,a.attname::text AS column_name,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid) AS default_value
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname=current_schema() AND c.relname IN ('unlockables','member_unlocks') AND a.attnum>0 AND NOT a.attisdropped
 ) SELECT coalesce(e.table_name,a.table_name) AS table_name,coalesce(e.column_name,a.column_name) AS column_name INTO bad
 FROM expected e FULL JOIN actual a USING(table_name,column_name)
 WHERE a.atttypid IS DISTINCT FROM to_regtype(e.type_name)::oid OR a.atttypmod IS DISTINCT FROM -1 OR a.attnotnull IS DISTINCT FROM e.not_null OR a.attidentity IS DISTINCT FROM e.identity_kind OR a.attgenerated IS DISTINCT FROM '' OR a.default_value IS DISTINCT FROM e.default_value LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Unexpected unlock catalog/grant column %.%',bad.table_name,bad.column_name; END IF;
 WITH expected(table_name,constraint_name,definition) AS (VALUES
 ('unlockables','unlockables_pkey','PRIMARY KEY (id)'),
 ('unlockables','unlockables_public_id_key','UNIQUE (public_id)'),
 ('unlockables','unlockables_code_key','UNIQUE (code)'),
 ('unlockables','unlockables_cosmetic_type_check',$check$CHECK ((cosmetic_type = ANY (ARRAY['theme'::text, 'palette'::text, 'font'::text, 'flair'::text, 'title'::text, 'badge'::text, 'frame'::text, 'nameplate'::text, 'token'::text])))$check$),
 ('member_unlocks','member_unlocks_pkey','PRIMARY KEY (member_id, unlockable_id)'),
 ('member_unlocks','member_unlocks_member_id_fkey','FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE'),
 ('member_unlocks','member_unlocks_unlockable_id_fkey','FOREIGN KEY (unlockable_id) REFERENCES unlockables(id)'),
 ('member_unlocks','member_unlocks_granted_by_fkey','FOREIGN KEY (granted_by) REFERENCES members(id)'),
 ('member_unlocks','member_unlocks_source_check',$check$CHECK ((source = ANY (ARRAY['milestone'::text, 'event'::text, 'cohort'::text, 'grant'::text, 'purchase'::text])))$check$)
 ), actual AS (
 SELECT c.relname::text AS table_name,k.conname::text AS constraint_name,pg_get_constraintdef(k.oid) AS definition,k.convalidated,k.condeferrable,k.condeferred
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=current_schema() AND c.relname IN ('unlockables','member_unlocks')
 ) SELECT coalesce(e.table_name,a.table_name) AS table_name,coalesce(e.constraint_name,a.constraint_name) AS constraint_name INTO bad
 FROM expected e FULL JOIN actual a USING(table_name,constraint_name)
 WHERE a.definition IS DISTINCT FROM e.definition OR a.convalidated IS DISTINCT FROM true OR a.condeferrable IS DISTINCT FROM false OR a.condeferred IS DISTINCT FROM false LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Unexpected unlock catalog/grant constraint %.%',bad.table_name,bad.constraint_name; END IF;
 IF EXISTS(SELECT FROM pg_constraint k WHERE k.contype='f' AND k.confrelid IN ('unlockables'::regclass,'member_unlocks'::regclass)
 AND NOT (k.conrelid='member_unlocks'::regclass AND k.confrelid='unlockables'::regclass AND k.conname='member_unlocks_unlockable_id_fkey'
 AND pg_get_constraintdef(k.oid)='FOREIGN KEY (unlockable_id) REFERENCES unlockables(id)' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred))
 THEN RAISE EXCEPTION 'Unexpected unlock purge incoming reference'; END IF;
 IF EXISTS(SELECT FROM pg_trigger WHERE tgrelid IN ('unlockables'::regclass,'member_unlocks'::regclass) AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Unexpected unlock purge user trigger'; END IF;
 IF EXISTS(SELECT FROM pg_rewrite WHERE ev_class IN ('unlockables'::regclass,'member_unlocks'::regclass))
 THEN RAISE EXCEPTION 'Unexpected unlock purge rewrite rule'; END IF;
 SELECT u.public_id INTO bad FROM unlockables u WHERE u.cosmetic_type IS NULL OR u.cosmetic_type NOT IN ('theme','palette','font','flair','title','badge','frame','nameplate','token') OR jsonb_typeof(u.payload) IS DISTINCT FROM 'object' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Invalid cosmetic catalog %',bad.public_id; END IF;
 SELECT g.member_id,g.unlockable_id INTO bad FROM member_unlocks g
 LEFT JOIN unlockables u ON u.id=g.unlockable_id LEFT JOIN members m ON m.id=g.member_id LEFT JOIN members actor ON actor.id=g.granted_by
 WHERE u.id IS NULL OR m.id IS NULL OR (g.granted_by IS NOT NULL AND actor.id IS NULL) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Unresolved legacy grant member % catalog %',bad.member_id,bad.unlockable_id; END IF;
 WITH RECURSIVE nodes(public_id,cosmetic_type,path,value) AS (
 SELECT public_id,cosmetic_type,'$'::text,payload FROM unlockables
 UNION ALL
 SELECT n.public_id,n.cosmetic_type,n.path||'.'||x.key,x.value FROM nodes n
 CROSS JOIN LATERAL (
 SELECT key,value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END)
 UNION ALL SELECT ordinality::text,value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]' END) WITH ORDINALITY
 ) x
 ), ambiguous AS (
 SELECT n.public_id,n.path||'.'||e.key AS path FROM nodes n CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}' END) e
 WHERE e.key IN ('kind','unlockKind','unlock_kind','cosmeticType','cosmetic_type','type') AND (jsonb_typeof(e.value)<>'string' OR e.value #>> '{}' <> n.cosmetic_type)
 ) SELECT * INTO bad FROM ambiguous LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Ambiguous catalog % path %',bad.public_id,bad.path; END IF;
END $$;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE FUNCTION pg_temp.import_setting(payload jsonb, physical text, wire text, fallback jsonb, allowed text[]) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb; normalized jsonb[] := '{}';
BEGIN
 FOREACH v IN ARRAY ARRAY[payload->physical,CASE WHEN wire<>physical THEN payload->wire END] LOOP
 IF v IS NULL OR v='null'::jsonb THEN CONTINUE; END IF;
 IF allowed IS NULL THEN
 IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'invalid Boolean'; END IF;
 ELSE
 IF jsonb_typeof(v)<>'string' OR NOT ((v#>>'{}')=ANY(allowed) OR (v#>>'{}')=ANY(ARRAY(SELECT upper(x) FROM unnest(allowed) x))) THEN RAISE EXCEPTION 'invalid enum'; END IF;
 v=to_jsonb(lower(v#>>'{}'));
 END IF;
 normalized=array_append(normalized,v);
 END LOOP;
 IF cardinality(normalized)=2 AND normalized[1]<>normalized[2] THEN RAISE EXCEPTION 'conflicting aliases'; END IF;
 RETURN coalesce(normalized[1],fallback);
END $$;
-- +goose StatementEnd
-- +goose StatementBegin
DO $$
DECLARE r record; k record;
BEGIN
 FOR r IN SELECT m.public_id,s.* FROM member_settings s JOIN members m ON m.id=s.member_id LOOP
 IF r.theme_mode IS NOT NULL AND r.theme_mode NOT IN ('light','dark','system') THEN RAISE EXCEPTION 'Settings member % key mode invalid',r.public_id; END IF;
 FOR k IN SELECT * FROM (VALUES
('theme','theme','"parchment"'::jsonb,ARRAY['parchment','midnight','ember','dracula','vegan']),
('density','density','"comfortable"'::jsonb,ARRAY['comfortable','compact']),
('effects_enabled','effectsEnabled','true'::jsonb,NULL::text[]),
('colorblind_safe','colorblindSafe','false'::jsonb,NULL::text[]),
('reduced_motion','reducedMotion','false'::jsonb,NULL::text[]),
('notify_character_verification','notifyCharacterVerification','true'::jsonb,NULL::text[]),
('notify_quest_signup','notifyQuestSignup','true'::jsonb,NULL::text[]),
('notify_document_activity','notifyDocumentActivity','true'::jsonb,NULL::text[]),
('notify_quest_scheduled','notifyQuestScheduled','true'::jsonb,NULL::text[]),
('notify_dm_mentioned','notifyDmMentioned','true'::jsonb,NULL::text[]),
('notify_dm_request_decided','notifyDmRequestDecided','true'::jsonb,NULL::text[])
) AS keys(physical,wire,fallback,allowed) LOOP
 BEGIN PERFORM pg_temp.import_setting(r.payload,k.physical,k.wire,k.fallback,k.allowed);
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Settings member % key % invalid or conflicting',r.public_id,k.physical; END;
 END LOOP; END LOOP;
END $$;
-- +goose StatementEnd
-- Purged cosmetic catalog/grants cannot be reconstructed by Down. Retain the complete export before running Up.
DELETE FROM member_unlocks;
DELETE FROM unlockables;
ALTER TABLE unlockables DROP CONSTRAINT unlockables_cosmetic_type_check;
ALTER TABLE unlockables DROP COLUMN cosmetic_type;
CREATE TABLE character_catalog_picks (
    catalog_id BIGINT REFERENCES creation_catalog(id) NOT NULL,
    character_id BIGINT REFERENCES characters(id) NOT NULL
);
CREATE TABLE assignment_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    assignment_kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    member_id BIGINT REFERENCES members(id) NOT NULL,
    new_value JSONB NULL,
    npc_document_id BIGINT REFERENCES documents(id) NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    region_id BIGINT REFERENCES regions(id) NULL
);
CREATE TABLE quest_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    facts JSONB NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    quest_id BIGINT REFERENCES quests(id) NOT NULL
);
CREATE TABLE region_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    new_value JSONB NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    region_id BIGINT REFERENCES regions(id) NOT NULL
);
CREATE TABLE pointcrawl_nodes (
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    map_id BIGINT REFERENCES maps(id) NOT NULL,
    name TEXT NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    submap_id BIGINT REFERENCES maps(id) NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL
);
CREATE TABLE pointcrawl_edges (
    directed BOOLEAN NOT NULL,
    document_id BIGINT REFERENCES documents(id) NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    label TEXT NULL,
    map_id BIGINT REFERENCES maps(id) NOT NULL,
    node_a BIGINT REFERENCES pointcrawl_nodes(id) NOT NULL,
    node_b BIGINT REFERENCES pointcrawl_nodes(id) NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE pointcrawl_entry_links (
    created_at TIMESTAMPTZ NOT NULL,
    created_by BIGINT REFERENCES members(id) NOT NULL,
    document_id BIGINT REFERENCES documents(id) NOT NULL,
    map_id BIGINT REFERENCES maps(id) NOT NULL,
    node_id BIGINT REFERENCES pointcrawl_nodes(id) NOT NULL,
    relation TEXT NOT NULL
);
CREATE TABLE pointcrawl_node_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    new_value JSONB NULL,
    node_id BIGINT REFERENCES pointcrawl_nodes(id) NOT NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE time_anchor_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    anchor_id BIGINT REFERENCES time_anchors(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    new_value JSONB NOT NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE notification_events (
    actor_id BIGINT REFERENCES members(id) NULL,
    created_at TIMESTAMPTZ NOT NULL,
    event_key TEXT NOT NULL,
    facts JSONB NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    subject_public_id UUID NOT NULL,
    subject_type TEXT NOT NULL
);
CREATE TABLE notification_channel_deliveries (
    channel TEXT NOT NULL,
    delivered_at TIMESTAMPTZ NULL,
    event_id BIGINT REFERENCES notification_events(id) NOT NULL,
    job_id BIGINT REFERENCES background_jobs(id) NULL,
    last_error TEXT NULL,
    member_id BIGINT REFERENCES members(id) NOT NULL,
    state TEXT NOT NULL
);
CREATE TABLE character_ddb_attempts (
    character_id BIGINT REFERENCES characters(id) NOT NULL,
    finished_at TIMESTAMPTZ NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    payload_hash TEXT NULL,
    provenance JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    safe_error TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    succeeded BOOLEAN NULL,
    url TEXT NOT NULL
);
CREATE TABLE job_redrives (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    job_id BIGINT REFERENCES background_jobs(id) NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    reason TEXT NOT NULL
);
CREATE TABLE operational_observations (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    key TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    state TEXT NOT NULL
);
CREATE TABLE quest_reward_entitlements (
    awarded_at TIMESTAMPTZ NOT NULL,
    awarded_by BIGINT REFERENCES members(id) NOT NULL,
    character_id BIGINT REFERENCES characters(id) NOT NULL,
    claimed_at TIMESTAMPTZ NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    note TEXT NULL,
    pcxp INTEGER NOT NULL CHECK (pcxp>0),
    progression_entry_id BIGINT REFERENCES character_progression_ledger(id) NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    quest_id BIGINT REFERENCES quests(id) NOT NULL
);
CREATE TABLE request_decisions (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    decision TEXT NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    note TEXT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL,
    request_id BIGINT REFERENCES dm_requests(id) NOT NULL
);
CREATE TABLE quest_reward_decisions (
    closure_change_id BIGINT REFERENCES quest_changes(id) NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL,
    decided_by BIGINT REFERENCES members(id) NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    quest_id BIGINT REFERENCES quests(id) NOT NULL
);
CREATE TABLE auth_override_audit (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    operation TEXT NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL,
    rule_code TEXT NOT NULL,
    subject_public_id UUID NOT NULL,
    subject_type TEXT NOT NULL
);
CREATE TABLE character_changes (
    affected_public_id UUID NOT NULL,
    affected_type TEXT NOT NULL,
    character_id BIGINT REFERENCES characters(id) NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    new_value JSONB NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL,
    recorded_by BIGINT REFERENCES members(id) NOT NULL
);
CREATE TABLE site_setting_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    new_value JSONB NOT NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL
);
CREATE TABLE calendar_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    calendar_id SMALLINT REFERENCES game_calendar(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    new_value JSONB NOT NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE arc_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    arc_id BIGINT REFERENCES quest_arcs(id) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    new_value JSONB NOT NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE TABLE map_changes (
    actor_id BIGINT REFERENCES members(id) NOT NULL,
    affected_public_id UUID NOT NULL,
    affected_type TEXT NOT NULL,
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    map_id BIGINT REFERENCES maps(id) NOT NULL,
    new_value JSONB NULL,
    old_value JSONB NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE dm_profile_review_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    member_id BIGINT REFERENCES members(id) NOT NULL,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NULL,
    recorded_by BIGINT REFERENCES members(id) NULL,
    revision INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    verification_id BIGINT REFERENCES verifications(id) NULL
);
ALTER TABLE member_availability ADD COLUMN note TEXT NULL;
ALTER TABLE member_settings ADD COLUMN colorblind_safe BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE member_settings ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE member_settings ADD COLUMN effects_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN mode TEXT NOT NULL DEFAULT 'system';
ALTER TABLE member_settings ADD COLUMN notify_character_verification BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN notify_dm_mentioned BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN notify_dm_request_decided BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN notify_document_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN notify_quest_scheduled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN notify_quest_signup BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE member_settings ADD COLUMN reduced_motion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE member_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'parchment';
ALTER TABLE characters ADD COLUMN background_text TEXT NULL;
ALTER TABLE characters ADD COLUMN ddb_url TEXT NULL;
ALTER TABLE characters ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE characters ADD COLUMN deleted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE characters ADD COLUMN description TEXT NULL;
ALTER TABLE downtime_projects ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE creation_catalog ADD COLUMN description TEXT NULL;
ALTER TABLE creation_catalog ADD COLUMN introduced_by_region_id BIGINT REFERENCES regions(id) NULL;
ALTER TABLE creation_catalog ADD COLUMN retired BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE character_logs ADD COLUMN created_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE character_progression_ledger ADD COLUMN kind TEXT NOT NULL DEFAULT 'pcxp';
ALTER TABLE character_progression_ledger ADD COLUMN metadata JSONB NULL;
ALTER TABLE character_progression_ledger ADD COLUMN note TEXT NULL;
ALTER TABLE character_progression_ledger ADD COLUMN quest_id BIGINT REFERENCES quests(id) NULL;
ALTER TABLE character_progression_ledger ADD COLUMN recorded_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE documents ADD COLUMN deleted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE documents ADD COLUMN published_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_revisions ADD COLUMN new_value JSONB NULL;
ALTER TABLE document_revisions ADD COLUMN old_value JSONB NULL;
ALTER TABLE document_revisions ADD COLUMN policy JSONB NULL;
ALTER TABLE document_revisions ADD COLUMN published_at TIMESTAMPTZ NULL;
ALTER TABLE document_revisions ADD COLUMN published_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE document_revisions ADD COLUMN rev INTEGER;
ALTER TABLE document_revisions ADD COLUMN visibility TEXT NULL;
ALTER TABLE lieutenant_assignments ADD COLUMN granted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE archon_assignments ADD COLUMN granted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE quests ADD COLUMN closed_at TIMESTAMPTZ NULL;
ALTER TABLE quests ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE quests ADD COLUMN deleted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE regions ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE regions ADD COLUMN deleted_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE maps ADD COLUMN created_by BIGINT REFERENCES members(id) NULL;
ALTER TABLE maps ADD COLUMN family TEXT NOT NULL DEFAULT 'campaign';
ALTER TABLE hexes ADD COLUMN created_at TIMESTAMPTZ NULL;
ALTER TABLE hexes ADD COLUMN submap_id BIGINT REFERENCES maps(id) NULL;
ALTER TABLE notifications ADD COLUMN event_id BIGINT REFERENCES notification_events(id) NULL;
ALTER TABLE character_ddb_mirrors ADD COLUMN payload_hash TEXT NULL;
ALTER TABLE character_ddb_mirrors ADD COLUMN provenance JSONB NULL;
ALTER TABLE character_ddb_mirrors ADD COLUMN url TEXT NULL;
ALTER TABLE verifications ADD COLUMN review_revision INTEGER NULL;
ALTER TABLE verifications ADD COLUMN evidence_attempt_id BIGINT NULL REFERENCES character_ddb_attempts(id);
ALTER TABLE idempotency_keys ADD COLUMN completed_at TIMESTAMPTZ NULL;
ALTER TABLE idempotency_keys ADD COLUMN fingerprint TEXT NULL;
ALTER TABLE idempotency_keys ADD COLUMN receipt JSONB NULL;
ALTER TABLE background_jobs ADD COLUMN redrive_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE background_jobs ADD COLUMN safe_error_code TEXT NULL;
ALTER TABLE unlockables ADD COLUMN description TEXT NULL;
ALTER TABLE unlockables ADD COLUMN kind TEXT NOT NULL CHECK (kind IN ('achievement','dm_tier'));
ALTER TABLE unlockables ADD COLUMN name TEXT NOT NULL;
ALTER TABLE unlockables ADD COLUMN unlock_rule JSONB NULL;
ALTER TABLE member_unlocks ADD COLUMN note TEXT NULL;
ALTER TABLE game_calendar ADD COLUMN updated_at TIMESTAMPTZ NULL;
UPDATE member_settings SET theme=(pg_temp.import_setting(payload,'theme','theme','"parchment"'::jsonb,ARRAY['parchment','midnight','ember','dracula','vegan'])#>>'{}')::text;
UPDATE member_settings SET density=(pg_temp.import_setting(payload,'density','density','"comfortable"'::jsonb,ARRAY['comfortable','compact'])#>>'{}')::text;
UPDATE member_settings SET effects_enabled=(pg_temp.import_setting(payload,'effects_enabled','effectsEnabled','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET colorblind_safe=(pg_temp.import_setting(payload,'colorblind_safe','colorblindSafe','false'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET reduced_motion=(pg_temp.import_setting(payload,'reduced_motion','reducedMotion','false'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_character_verification=(pg_temp.import_setting(payload,'notify_character_verification','notifyCharacterVerification','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_quest_signup=(pg_temp.import_setting(payload,'notify_quest_signup','notifyQuestSignup','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_document_activity=(pg_temp.import_setting(payload,'notify_document_activity','notifyDocumentActivity','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_quest_scheduled=(pg_temp.import_setting(payload,'notify_quest_scheduled','notifyQuestScheduled','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_dm_mentioned=(pg_temp.import_setting(payload,'notify_dm_mentioned','notifyDmMentioned','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET notify_dm_request_decided=(pg_temp.import_setting(payload,'notify_dm_request_decided','notifyDmRequestDecided','true'::jsonb,NULL::text[])#>>'{}')::boolean;
UPDATE member_settings SET mode=coalesce(theme_mode,'system');
DROP FUNCTION pg_temp.import_setting(jsonb,text,text,jsonb,text[]);
ALTER TABLE member_settings DROP COLUMN theme_mode;
ALTER TABLE member_settings ADD CONSTRAINT member_settings_theme_check CHECK(theme IN ('parchment','midnight','ember','dracula','vegan'));
ALTER TABLE member_settings ADD CONSTRAINT member_settings_mode_check CHECK(mode IN ('light','dark','system'));
ALTER TABLE member_settings ADD CONSTRAINT member_settings_density_check CHECK(density IN ('comfortable','compact'));
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY document_id ORDER BY created_at,public_id) AS rev FROM document_revisions)
UPDATE document_revisions r SET rev=ranked.rev FROM ranked WHERE r.id=ranked.id;
ALTER TABLE document_revisions ALTER COLUMN rev SET NOT NULL;
ALTER TABLE document_revisions ADD CONSTRAINT document_revisions_document_rev_key UNIQUE(document_id,rev);
CREATE UNIQUE INDEX uq_documents_dm_table_per_member ON documents(author_id) WHERE kind='community' AND category='dm_table' AND deleted_at IS NULL;
ALTER TABLE character_catalog_picks ADD PRIMARY KEY(character_id,catalog_id);
ALTER TABLE assignment_changes ADD CHECK((assignment_kind='archon' AND region_id IS NOT NULL AND npc_document_id IS NULL) OR (assignment_kind='lieutenant' AND region_id IS NULL AND npc_document_id IS NOT NULL));
ALTER TABLE pointcrawl_nodes ADD UNIQUE(map_id,id);
ALTER TABLE pointcrawl_edges ADD FOREIGN KEY(map_id,node_a) REFERENCES pointcrawl_nodes(map_id,id);
ALTER TABLE pointcrawl_edges ADD FOREIGN KEY(map_id,node_b) REFERENCES pointcrawl_nodes(map_id,id);
ALTER TABLE pointcrawl_edges ADD CHECK(node_a<>node_b);
ALTER TABLE maps ADD CHECK(family ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');
ALTER TABLE pointcrawl_entry_links ADD PRIMARY KEY(node_id,document_id,relation);
ALTER TABLE pointcrawl_entry_links ADD FOREIGN KEY(map_id,node_id) REFERENCES pointcrawl_nodes(map_id,id);
ALTER TABLE pointcrawl_entry_links ADD CHECK(relation IN ('location','subject'));
CREATE UNIQUE INDEX pointcrawl_entry_links_location_idx ON pointcrawl_entry_links(node_id) WHERE relation='location';
ALTER TABLE notification_events ADD UNIQUE(event_key);
ALTER TABLE notifications ADD UNIQUE(event_id,member_id);
ALTER TABLE notification_channel_deliveries ADD PRIMARY KEY(event_id,member_id,channel);
ALTER TABLE notification_channel_deliveries ADD CHECK(channel='in_app');
ALTER TABLE notification_channel_deliveries ADD CHECK(state IN ('undelivered','delivered','failed'));
ALTER TABLE operational_observations ADD UNIQUE(key);
ALTER TABLE operational_observations ADD CHECK(jsonb_typeof(payload)='object');
ALTER TABLE quest_reward_entitlements ADD UNIQUE(quest_id,character_id);
ALTER TABLE quest_reward_entitlements ADD CHECK((claimed_at IS NULL)=(progression_entry_id IS NULL));
ALTER TABLE quest_reward_decisions ADD PRIMARY KEY(quest_id);
ALTER TABLE quest_reward_decisions ADD UNIQUE(closure_change_id);
ALTER TABLE auth_override_audit ADD CHECK(rule_code IN ('ROLE','OWNERSHIP','ASSIGNMENT','AUDIENCE'));
ALTER TABLE character_changes ADD CHECK(affected_type IN ('character','downtime_project','character_log'));
ALTER TABLE map_changes ADD CHECK(affected_type IN ('map','hex_edge','pointcrawl_edge'));
ALTER TABLE unlockables ADD CHECK(unlock_rule IS NULL OR unlock_rule='{"type":"admin_grant"}'::jsonb);
ALTER TABLE dm_profile_review_events ADD UNIQUE(member_id,revision);
ALTER TABLE dm_profile_review_events ADD CHECK(kind IN ('BASELINE','CREATE','EDIT','SUBMIT','DECIDE'));
ALTER TABLE dm_profile_review_events ADD CHECK(kind='BASELINE' OR (recorded_by IS NOT NULL AND recorded_at IS NOT NULL));
ALTER TABLE dm_profile_review_events ADD CHECK((kind='DECIDE')=(verification_id IS NOT NULL));
INSERT INTO dm_profile_review_events(member_id,revision,kind,snapshot)
SELECT member_id,review_revision,'BASELINE',jsonb_build_object('tagline',tagline,'philosophy',philosophy,'houseRules',house_rules,'tableInfo',table_info,'acceptingPlayers',accepting_players,'status',status) FROM dm_profiles;
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
ALTER TABLE idempotency_keys ADD PRIMARY KEY(endpoint,actor_id,key);
-- +goose StatementBegin
CREATE FUNCTION check_product_receipt_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT FROM idempotency_keys WHERE endpoint=NEW.endpoint AND actor_id=NEW.actor_id AND key=NEW.key AND endpoint LIKE 'graphql:%' AND (fingerprint IS NULL OR fingerprint !~ '^[0-9a-f]{64}$' OR receipt IS NULL OR receipt='null'::jsonb OR completed_at IS NULL)) THEN
 RAISE EXCEPTION 'Incomplete product receipt' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
-- +goose StatementEnd
CREATE CONSTRAINT TRIGGER idempotency_product_receipt_check AFTER INSERT OR UPDATE ON idempotency_keys DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_product_receipt_complete();
ALTER TABLE document_links DROP CONSTRAINT document_links_pkey;
DROP INDEX document_links_target_id_idx;
ALTER TABLE document_links RENAME COLUMN target_id TO document_target_id;
ALTER TABLE document_links ALTER COLUMN document_target_id DROP NOT NULL;
ALTER TABLE document_links ADD COLUMN quest_target_id BIGINT REFERENCES quests(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD COLUMN character_target_id BIGINT REFERENCES characters(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD COLUMN region_target_id BIGINT REFERENCES regions(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD CONSTRAINT document_links_exactly_one_target CHECK(num_nonnulls(document_target_id,quest_target_id,character_target_id,region_target_id)=1);
ALTER TABLE document_links ADD COLUMN target_type TEXT GENERATED ALWAYS AS (CASE WHEN document_target_id IS NOT NULL THEN 'document' WHEN quest_target_id IS NOT NULL THEN 'quest' WHEN character_target_id IS NOT NULL THEN 'character' ELSE 'region' END) STORED;
ALTER TABLE document_links ADD COLUMN target_id BIGINT GENERATED ALWAYS AS (coalesce(document_target_id,quest_target_id,character_target_id,region_target_id)) STORED;
ALTER TABLE document_links ADD PRIMARY KEY(source_id,target_type,target_id,relation);
CREATE INDEX document_links_target_id_idx ON document_links(target_type,target_id,relation,source_id);
-- +goose StatementBegin
CREATE FUNCTION quest_display_status_at(status text,filled_count integer,scheduled_at timestamptz,duration_hours double precision,as_of timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT CASE WHEN status IN ('open','full') AND as_of>=scheduled_at AND as_of<scheduled_at+duration_hours*interval '1 hour' THEN 'live' WHEN status='open' AND filled_count>0 THEN 'filling' WHEN status='full' AND scheduled_at>as_of THEN 'scheduled' ELSE status END;
$$;
-- +goose StatementEnd
CREATE OR REPLACE VIEW quest_display_status AS SELECT q.id,quest_display_status_at(q.status,q.filled_count,q.scheduled_at,q.duration_hours,now()) AS display_status FROM quests q;

-- +goose Down
-- Down cannot recover purged cosmetics or pre-migration typed representations. Restore retained exports explicitly.
LOCK TABLE document_links,idempotency_keys,unlockables,member_unlocks IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT FROM document_links WHERE quest_target_id IS NOT NULL OR character_target_id IS NOT NULL OR region_target_id IS NOT NULL) THEN RAISE EXCEPTION 'Down would discard typed Document links'; END IF;
 IF EXISTS(SELECT FROM idempotency_keys GROUP BY endpoint,key HAVING count(*)>1) OR EXISTS(SELECT FROM idempotency_keys WHERE endpoint LIKE 'graphql:%') THEN RAISE EXCEPTION 'Down requires explicit receipt export/restoration'; END IF;
 IF EXISTS(SELECT FROM unlockables) OR EXISTS(SELECT FROM member_unlocks) THEN RAISE EXCEPTION 'Down requires explicit catalog export/restoration'; END IF;
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='document_links'::regclass AND conname='document_links_pkey') OR NOT EXISTS(SELECT FROM pg_indexes WHERE schemaname=current_schema() AND indexname='document_links_target_id_idx') THEN RAISE EXCEPTION 'Unexpected Document link down shape'; END IF;
END $$;
-- +goose StatementEnd
DROP INDEX uq_documents_dm_table_per_member;
DROP VIEW quest_display_status;
DROP FUNCTION quest_display_status_at(text,integer,timestamptz,double precision,timestamptz);
CREATE VIEW quest_display_status AS SELECT q.id,CASE WHEN q.status IN ('open','full') AND now()>=q.scheduled_at AND now()<q.scheduled_at+q.duration_hours*interval '1 hour' THEN 'live' WHEN q.status='open' AND q.filled_count>0 THEN 'filling' WHEN q.status='full' AND q.scheduled_at>now() THEN 'scheduled' ELSE q.status END::text AS display_status FROM quests q;
ALTER TABLE document_links DROP CONSTRAINT document_links_pkey;
DROP INDEX document_links_target_id_idx;
ALTER TABLE document_links DROP COLUMN target_id,DROP COLUMN target_type;
ALTER TABLE document_links DROP CONSTRAINT document_links_exactly_one_target;
ALTER TABLE document_links DROP COLUMN quest_target_id,DROP COLUMN character_target_id,DROP COLUMN region_target_id;
ALTER TABLE document_links ALTER COLUMN document_target_id SET NOT NULL;
ALTER TABLE document_links RENAME COLUMN document_target_id TO target_id;
ALTER TABLE document_links ADD PRIMARY KEY(source_id,target_id,relation);
CREATE INDEX document_links_target_id_idx ON document_links(target_id);
DROP TRIGGER idempotency_product_receipt_check ON idempotency_keys;
DROP FUNCTION check_product_receipt_complete();
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_pkey;
ALTER TABLE idempotency_keys ADD PRIMARY KEY(endpoint,key);
ALTER TABLE member_settings ADD COLUMN theme_mode TEXT;
UPDATE member_settings SET theme_mode=mode;
ALTER TABLE game_calendar DROP COLUMN updated_at;
ALTER TABLE member_unlocks DROP COLUMN note;
ALTER TABLE unlockables DROP COLUMN description;
ALTER TABLE unlockables DROP COLUMN kind;
ALTER TABLE unlockables DROP COLUMN name;
ALTER TABLE unlockables DROP COLUMN unlock_rule;
ALTER TABLE background_jobs DROP COLUMN redrive_count;
ALTER TABLE background_jobs DROP COLUMN safe_error_code;
ALTER TABLE idempotency_keys DROP COLUMN completed_at;
ALTER TABLE idempotency_keys DROP COLUMN fingerprint;
ALTER TABLE idempotency_keys DROP COLUMN receipt;
ALTER TABLE verifications DROP COLUMN review_revision;
ALTER TABLE verifications DROP COLUMN evidence_attempt_id;
ALTER TABLE character_ddb_mirrors DROP COLUMN payload_hash;
ALTER TABLE character_ddb_mirrors DROP COLUMN provenance;
ALTER TABLE character_ddb_mirrors DROP COLUMN url;
ALTER TABLE notifications DROP COLUMN event_id;
ALTER TABLE hexes DROP COLUMN created_at;
ALTER TABLE hexes DROP COLUMN submap_id;
ALTER TABLE maps DROP COLUMN created_by;
ALTER TABLE maps DROP COLUMN family;
ALTER TABLE regions DROP COLUMN deleted_at;
ALTER TABLE regions DROP COLUMN deleted_by;
ALTER TABLE quests DROP COLUMN closed_at;
ALTER TABLE quests DROP COLUMN deleted_at;
ALTER TABLE quests DROP COLUMN deleted_by;
ALTER TABLE archon_assignments DROP COLUMN granted_by;
ALTER TABLE lieutenant_assignments DROP COLUMN granted_by;
ALTER TABLE document_revisions DROP COLUMN new_value;
ALTER TABLE document_revisions DROP COLUMN old_value;
ALTER TABLE document_revisions DROP COLUMN policy;
ALTER TABLE document_revisions DROP COLUMN published_at;
ALTER TABLE document_revisions DROP COLUMN published_by;
ALTER TABLE document_revisions DROP COLUMN rev;
ALTER TABLE document_revisions DROP COLUMN visibility;
ALTER TABLE documents DROP COLUMN deleted_by;
ALTER TABLE documents DROP COLUMN published_by;
ALTER TABLE documents DROP COLUMN version;
ALTER TABLE character_progression_ledger DROP COLUMN kind;
ALTER TABLE character_progression_ledger DROP COLUMN metadata;
ALTER TABLE character_progression_ledger DROP COLUMN note;
ALTER TABLE character_progression_ledger DROP COLUMN quest_id;
ALTER TABLE character_progression_ledger DROP COLUMN recorded_by;
ALTER TABLE character_logs DROP COLUMN created_by;
ALTER TABLE creation_catalog DROP COLUMN description;
ALTER TABLE creation_catalog DROP COLUMN introduced_by_region_id;
ALTER TABLE creation_catalog DROP COLUMN retired;
ALTER TABLE downtime_projects DROP COLUMN updated_at;
ALTER TABLE characters DROP COLUMN background_text;
ALTER TABLE characters DROP COLUMN ddb_url;
ALTER TABLE characters DROP COLUMN deleted_at;
ALTER TABLE characters DROP COLUMN deleted_by;
ALTER TABLE characters DROP COLUMN description;
ALTER TABLE member_settings DROP COLUMN colorblind_safe;
ALTER TABLE member_settings DROP COLUMN density;
ALTER TABLE member_settings DROP COLUMN effects_enabled;
ALTER TABLE member_settings DROP COLUMN mode;
ALTER TABLE member_settings DROP COLUMN notify_character_verification;
ALTER TABLE member_settings DROP COLUMN notify_dm_mentioned;
ALTER TABLE member_settings DROP COLUMN notify_dm_request_decided;
ALTER TABLE member_settings DROP COLUMN notify_document_activity;
ALTER TABLE member_settings DROP COLUMN notify_quest_scheduled;
ALTER TABLE member_settings DROP COLUMN notify_quest_signup;
ALTER TABLE member_settings DROP COLUMN reduced_motion;
ALTER TABLE member_settings DROP COLUMN theme;
ALTER TABLE member_availability DROP COLUMN note;
DROP TABLE dm_profile_review_events;
DROP TABLE map_changes;
DROP TABLE arc_changes;
DROP TABLE calendar_changes;
DROP TABLE site_setting_changes;
DROP TABLE character_changes;
DROP TABLE auth_override_audit;
DROP TABLE quest_reward_decisions;
DROP TABLE request_decisions;
DROP TABLE quest_reward_entitlements;
DROP TABLE operational_observations;
DROP TABLE job_redrives;
DROP TABLE character_ddb_attempts;
DROP TABLE notification_channel_deliveries;
DROP TABLE notification_events;
DROP TABLE time_anchor_changes;
DROP TABLE pointcrawl_node_changes;
DROP TABLE pointcrawl_entry_links;
DROP TABLE pointcrawl_edges;
DROP TABLE pointcrawl_nodes;
DROP TABLE region_changes;
DROP TABLE quest_changes;
DROP TABLE assignment_changes;
DROP TABLE character_catalog_picks;
ALTER TABLE unlockables ADD COLUMN cosmetic_type TEXT NOT NULL;
ALTER TABLE unlockables ADD CONSTRAINT unlockables_cosmetic_type_check CHECK(cosmetic_type IN ('theme','palette','font','flair','title','badge','frame','nameplate','token'));
