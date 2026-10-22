# Document allocation and typed relationships

**Status:** accepted design. Published schema/config and comment scaffolds do not implement these contracts. Runtime enforcement remains pending the owning implementation tasks and their tests.

The frontend persistence path now binds Document-owned brief and summary writers to the Quest command's transaction. The current squashed `0001` schema already contains the typed links and append ordinal described in the historical migration specification below. No additional link migration is required for that schema.

Document reads expose `canEditMetadata` from the current canonical command policy and `canEditBody` from that same admission combined with explicit body-projection completeness. Author and administrator source grants remain unchanged. A delegated editor who sees redacted blocks can edit separately admitted metadata, but cannot replace the whole body. Save admission checks the fresh caller and locked current source before replay; omitted bodies preserve their exact bytes and null bodies are invalid. Literal redaction prose is not evidence of an incomplete projection. Location admission facts include current pointcrawl placement Regions as well as explicit typed Region subjects, collected in one set read per page or batch. Mutation bodies and revision bodies retain the caller's projection.

Frontend persistence scenarios are covered by `product_frontend_integration_test.go`; these receipts do not establish the other notification or migration-history obligations in this contract.

Patterns: aggregate commands, specification, polymorphic association with an exclusive arc, unit of work. Document owns one author FK, one slug allocator, one link table and immutable document_revisions. These are implementation specifications, not executed migrations.

Quest summary append order is a persisted property of the existing `document_links` polymorphic association. Migration 0004 adds `summary_append_order` as a monotonic identity and indexes Quest summary edges by Quest and that value. Current schema version is 4; P04 migration-history comparisons deliberately stop at version 3. Appending locks every affected Quest row in ascending public UUID order in the same write unit of work before inserting, following [participation-locking.md](/apps/api/docs/design/graphql-product/participation-locking.md). Retained Quest links keep their ordinal during summary edits and republishing; removing and later re-adding a Quest link creates a later ordinal. The recap tail orders by this field, never by Document creation, update, or publication time. Existing summary-to-Quest edges have no faithful historical append order, so 0004 refuses to migrate while any exist and leaves all rows untouched. Down refuses while such links exist because removing the ordinal would discard accepted meaning.

## Author identity and D5

The sole author reference is documents.author_id BIGINT REFERENCES members(id), as in 0001. created_by belongs to document_revisions and must not become a second Document author. The D5 preflight groups live kind community/category dm_table rows by author_id, reports member public UUID and every duplicate Document public UUID and fails without modifying data. NULL author on an existing live DM-table is a preflight error requiring explicit remediation, not attribution to an arbitrary Member. The index is:

```sql
CREATE UNIQUE INDEX uq_documents_dm_table_per_member
ON documents(author_id)
WHERE kind = 'community' AND category = 'dm_table' AND deleted_at IS NULL;
```

DOC04 precheck and batch lookup resolve Member public UUID to this author_id; delete releases the slot, restore/category changes recheck it. Concurrent creates map only this named index violation to CONFLICT/DUPLICATE_DM_TABLE. Missing author admission cannot bypass the index's NULL semantics. P04 tests preflight duplicates/NULL author, no data loss and index races; DOC04/DOC06 own persistence and admission; S03/S04 mount the same cases.

## Slug allocation and creation authority

D22 removes slug from DocumentDraftInput and its domain DTO. DOC06's pure SlugBase(title) ports the recovered Python title.strip().lower(), then replaces maximal runs outside ASCII a-z0-9 with '-', strips edge '-' and falls back to untitled. Use existing golang.org/x/text/cases.Lower(language.Und), guarded by the recovered Python differential vectors. Lower must reproduce Python Unicode lowercase before ASCII filtering: İ yields i plus combining dot, not Go's simple i mapping when followed by another letter; the vector İX becomes i-x. No arbitrary new slug length grammar is introduced. DOC06 computes the shared SlugBase once and calls DOC04 FindAvailableSlug(ctx,base) across ALL kinds and ALL rows, including tombstones, in one set-based SQL task under the existing 3s deadline. There is no per-collision SQL loop. The exact SQL below generates at most the number of matching occupied rows plus one candidates; by pigeonhole it returns the first free base/base-2/base-3 identity without an arbitrary suffix cap. documents.slug index handles each equality; no second counter/table is added. documents.slug retains its global UNIQUE constraint. A concurrent same-title INSERT race returns expected CONFLICT and rolls back the losing draft/history/receipt; it does not silently retry allocation after partial writes. Title edits retain the stored slug.

The canonical resource URL pattern reserves `/codex/new` for creation. For a new `codex_entry` whose shared `SlugBase(title)` is `new`, the writer uses `new-entry` as the stem before the same global `FindAvailableSlug` allocation. This reserved resource path exception preserves the pure shared normalizer, wiki-link normalization, all other kinds, and existing stored slugs; uniqueness still includes every kind and tombstones.

New ordinary drafts have version1 and CREATE_DRAFT history with actual author/actor/time. Active Member may create codex_entry, summary and community under their shape invariants; rule requires current verifier/admin (configured-owner declared bypass audited); direct quest_brief is INVALID regardless role. Ordinary codex_entry requires category Artifact, Event, Lore, NPC or Faction at creation. Missing/null/unknown category is INVALID. Locations remains the separate current held-archon create flow, initially unlinked, with Document-owned assigned-region policy after linking. community/dm_table keeps D5; generic summary/community may have null category. Existing imported categories stay literal readable data, not permission to create arbitrary new categories or Lore/Bridge edits. DOC06 validates any supplied nonnull ordinary Codex category against the closed five or admitted Locations path on edits too.

Rule creation admission is unchanged. Every later Rule management action requires current Verifier AND authorship, unless existing admin/configured-owner bypass applies. Update, publish, unpublish, editPublished, audience, delete and restore all check current authority before completed replay. A former Verifier author and non-author Verifier are FORBIDDEN after established disclosure admission.

Every generic Document write rejects observable quest_brief with INVALID, including create, update, publish, unpublish, editPublished, audience, delete and restore. Admin/configured-owner authority does not bypass this structural rule. Quest commands exclusively own those lifecycle writes through the same transaction-bound Document writer. Preserve authentication, identity and audience disclosure order and refuse before receipt replay or writes. No second brief lifecycle or transaction owner is introduced. Held-DM preview admission remains unchanged.

Quest CreateBrief receives explicit QuestID in BriefCreate from the already allocated Quest identity. It derives quest- plus that UUID's lowercase hex; DMID is the chosen admitted DM and actual actor remains revision provenance. Summary creation allocates its Document UUID first and derives summary- plus that UUID hex. Both use Document's one StoreAllocatedDocument path/constraint mapping with a trusted identity-derived slug value; they never accept a client slug or allocate by title. The ordinary SlugBase/AllocateSlug path and these trusted owning-flow strategies converge on one Document insert and global uniqueness boundary. UpdateBrief/summary edit preserve existing identity/slug. DOC06 calls the declared DocumentWriteRepository.StoreSummary in the same transaction. W01 injects all repository and foreign writers from that transaction; no nested runner.

## Exclusive-arc link migration

P04 preflight asserts the 0001 document_links columns/source/target FKs and document_links_pkey/document_links_target_id_idx names. It verifies every current edge resolves to Documents, and records exact source/target public UUID/relation triples. A mismatch stops migration. In one migration transaction:

```sql
ALTER TABLE document_links DROP CONSTRAINT document_links_pkey;
DROP INDEX document_links_target_id_idx;
ALTER TABLE document_links RENAME COLUMN target_id TO document_target_id;
ALTER TABLE document_links ALTER COLUMN document_target_id DROP NOT NULL;
ALTER TABLE document_links ADD COLUMN quest_target_id BIGINT REFERENCES quests(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD COLUMN character_target_id BIGINT REFERENCES characters(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD COLUMN region_target_id BIGINT REFERENCES regions(id) ON DELETE RESTRICT;
ALTER TABLE document_links ADD CONSTRAINT document_links_exactly_one_target
CHECK (num_nonnulls(document_target_id,quest_target_id,character_target_id,region_target_id) = 1);
ALTER TABLE document_links ADD COLUMN target_type TEXT GENERATED ALWAYS AS
(CASE WHEN document_target_id IS NOT NULL THEN 'document'
      WHEN quest_target_id IS NOT NULL THEN 'quest'
      WHEN character_target_id IS NOT NULL THEN 'character'
      ELSE 'region' END) STORED;
ALTER TABLE document_links ADD COLUMN target_id BIGINT GENERATED ALWAYS AS
(COALESCE(document_target_id,quest_target_id,character_target_id,region_target_id)) STORED;
ALTER TABLE document_links ADD CONSTRAINT document_links_pkey
PRIMARY KEY(source_id,target_type,target_id,relation);
CREATE INDEX document_links_target_id_idx ON document_links(target_type,target_id,relation,source_id);
```

The renamed Document-target FK retains its real Document reference and ON DELETE CASCADE. source_id retains its Document cascade. New subject FKs restrict hard deletion; tombstones preserve every edge. Each physical INSERT supplies source_id, relation and exactly ONE named target FK, never generated target_type/target_id. S03 resolves each public UUID through the column's explicit domain, not a generic bigint mapper. Equal internal IDs in four target tables remain four distinct typed edges. Unsupported target types INVALID; malformed public IDs scalar INVALID; absent/wrong-domain identity NOT_FOUND. Existing literal relations remain unchanged; no historical edge is reclassified. Ordinary authored links remain Document-to-Document.

DOC03 changes every existing Document-only backlink/query join to constrain target_type='document' and join document_target_id; generated target_id alone is insufficient. Both source Document and Document target audience predicates apply. DOC04 maps public target UUID from the joined domain selected by the real FK. DOC04 supplies one typed set read including audience projection; forbidden Document targets are omitted according to the declared nullable/list contract and protected Quest relations use owning Quest/Document policy. DOC06 validates current target identity/admission before writing; summary stores quest and optional Character subjects in this same table/UOW. Region subjects remain supported reads without inventing an automatic frontmatter producer. Missing foreign targets or insert failure roll back Document/version/revision/links/notification/receipt together.

Down holds the migration table lock through preflight and rewrite. Down preflight fails if any quest/character/region-target edge exists. It does not erase authored edges. Otherwise drop the new PK and target-leading index first, then generated target_id and target_type, the exactly-one check and three new subject FK columns; restore document_target_id NOT NULL, rename it to target_id, restore PK(source_id,target_id,relation) and original target index. Ordinary Document-only up/down roundtrip retains identical edges and FK behavior. The real constraint names are schema-inspected before down rather than guessing names after rename.

P04 acceptance executes every DDL/constraint on PostgreSQL16; equal internalID four-type graph, zero/two target rejection, missing FK, duplicate exact typed edge, hard-delete restrictions, tombstone retention, typed fixture inserts and lossless old-edge roundtrip/down refusal. DOC03/04 acceptance verifies backlink isolation and actual public UUID correspondence; DOC06/S04 verify typed summary writes and final-insert rollback. No implementation or deployment ran during this contract repair.

The same pure SlugBase is called by any wiki-link title normalization; consumer code must not recopy its ASCII/Unicode rules. DOC04 FindAvailableSlug uses one SQL statement/borrowed command connection:

```sql
WITH population AS (
 SELECT count(*) AS occupied FROM documents
 WHERE slug = $1 OR slug LIKE $1 || '-%'
), candidates AS (
 SELECT n, CASE WHEN n=1 THEN $1 ELSE $1 || '-' || n::text END AS candidate
 FROM population CROSS JOIN LATERAL generate_series(1::bigint,occupied+1) AS n
)
SELECT candidate FROM candidates c
WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.slug=c.candidate)
ORDER BY n LIMIT 1;
```

Base is the already normalized nonempty ASCII slug, not client text; it has no LIKE wildcard. Existing large/noncanonical suffixes may increase occupied count but never overflow a cast from authored slug text. Global uniqueness handles concurrent insert; no lock or live-only filter changes accepted semantics. P04/DOC04 test 0/1/multiple occupied bases, hole before a later suffix, tombstoned occupied candidates and statement budget exactly1.

DocumentDraft.frontmatter and DocumentEdit.frontmatter JSON objects persist through documents.frontmatter_yaml and matching immutable revision frontmatter_yaml, never a nonexistent documents.frontmatter column. DOC06's canonical JSON-to-YAML conversion preserves json.Number lexical numbers through typed yaml nodes, including 9007199254740993; no float64 intermediary. DOC04's projection returns the corresponding typed JSON object. Empty object is {}, absent historical YAML maps to empty object as already declared, unsupported/malformed required stored YAML fails visibly. S04 compares SQL YAML decoded through the same owning codec plus exact numeric JSON readback, not literal YAML whitespace equality.

Current Document provenance: P04 adds nullable Member FKs documents.deleted_by and documents.published_by. Legacy values remainNULL. Publish records actual publishingactor; unpublish clears current publisher/time; delete records actual deletingactor but retains publication; restore clears deletion and preserves literal prior publication. author_id isnever used as a provenance substitute. Immutable revisions store the actual prior/new facts, not reconstructed legacy actors.

DOC06 stores exact resolved newMentionMemberIds as internal provenance in the immutable revision new_value snapshot, in the same transaction as the Document change and mention event. Canonical public revision/history newValue projection omits this internal key and retains existing protected-block privacy. Notification proof compares this source snapshot to the event set and never reconstructs original mention recipients from current handles. No new schema column or public DTO field is added.
