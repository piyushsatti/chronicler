# Authored content and operational data boundaries

**Verdict.** The current source contains four strong candidates for consolidating authored prose into Document. They are DM profile prose, backstory lore, proposed character descriptions and backgrounds, and narrative character logs. Quest, Chronicle, spatial, and time storage mostly already separate authored content from operational data. Their unfinished composition and misleading API projections are separate implementation problems.

This is a source architecture review dated 2026-10-16. It records the owner's direction and identifies decisions before implementation. It does not approve a migration, establish deployed state, or complete backend acceptance criteria.

## Governing boundary

The governing patterns are **domain aggregates**, **composition by reference**, and **CQRS read projections**. Document owns authored content and its content lifecycle. Domain records own operational state and behavior. A page or editor can combine them by reference without becoming another authority for either.

Both kinds of record are stored in the database. The distinction concerns who owns a value, validates changes, and records history. Update frequency is a useful clue, but meaning decides the boundary. A calendar definition remains operational configuration even when rarely edited. A Chronicle remains authored content even when frequently edited.

The owner endorsed this direction on 2026-10-16. Applied to a DM profile, authored tagline, philosophy, house rules, and table description belong to Document. Identity, accepting-player state, approval state, and review tracking remain on the profile. Exact Document identities, audiences, and review coupling still need decisions.

Not every string is an authored document. Names, short labels, request notes, error messages, rendered notifications, ledger reasons, and immutable snapshots can remain with their domain operation. Documents also legitimately own structured content metadata, including publication state, visibility, author references, and revision identity.

## Evidence boundaries

This review inspected checked-in migrations, queries, handlers, adapters, and relevant design contracts. It distinguishes these evidence levels:

- **Actual source path.** Wiring and implementations exist in source. This is not a live-request result.
- **Schema or contract only.** A migration or proposed API field exists, but its new implementation is not established as mounted.
- **Fixture only.** Seed examples illustrate values. They do not establish production data or behavior.
- **Design direction.** A recommendation or accepted contract still requires implementation and verification.

New `product_*` files include implementation scaffolds. Their filenames and API schema declarations do not establish working operations. Migration presence does not establish that a running database applied it.

## Strong candidates for Document ownership

### DM profile prose

The [initial migration](/apps/api/db/migrations/0001_init.sql) puts `tagline`, `philosophy`, `house_rules`, and free-form `table_info` on `dm_profiles`. [Member product SQL](/apps/api/db/queries/member_product.sql) reads and writes those fields. They are a separate prose contract from the DM-table Document consumed by the [DM table adapter](/apps/web/src/features/profile/adapters/dmTableAdapter.ts).

There is no `dm_profiles.document_id`. However, the [product migration](/apps/api/db/migrations/0003_product_graphql.sql) defines `uq_documents_dm_table_per_member`, which permits at most one live `community` Document with category `dm_table` per author. That is a schema association through authorship. Its application to a running database is unverified. The current mounted profile read does not compose that Document, and the separate DM-table page resolves a Document by slug.

Consolidating this prose moves toward one content authority. Keep member identity, availability, approval state, and review tracking in Member. The `table_info` seed keys `night`, `seats`, `style`, and `safety` are fixture examples, not an enforced runtime contract. Style and safety prose fit authored content. Any actual scheduling or capacity control needs an explicit operational owner.

**A Document-backed review contract must define which content revision is assessed and how later edits affect approval.** Binding each review to an exact Document revision is the recommended way to preserve reviewed-content identity. The owner has not yet decided that coupling or the approval behavior after an edit. Existing `dm_profile_review_events.snapshot` values are historical evidence under the [DM review contract](/apps/api/docs/design/graphql-product/dm-profile-review-contract.md). Preserve them as historical facts rather than rewriting them to current content.

### Backstory lore

The [initial migration](/apps/api/db/migrations/0001_init.sql) stores `backstories.lore` beside reference identity, cohort, source region, and retirement state. [Character SDL](/packages/contracts/graphql/character.graphql) exposes that lore directly. Seed examples contain authored narrative, but a complete mounted backstory read and edit implementation was not established.

The lore is a strong Document candidate. Backstory identity, eligibility, and character selection remain structured reference data. Whether the lore gets its own Document or references an existing Codex entry needs an owner decision. Moving the prose does not remove `characters.backstory_id`.

### Proposed character description and background

The [product migration](/apps/api/db/migrations/0003_product_graphql.sql) adds `characters.description` and `background_text`. These are proposed prose owners separate from Document. The web has a description editor, but the mounted Go Character routes and current mapper do not establish a complete persistence and readback flow for these fields.

Consolidate authored description and background through a Document reference before implementing another independent prose lifecycle. Keep Character identity, owner, status, selection relationships, submission tracking, DDB integration, and progression structured. Decide whether personal background and reusable backstory lore are separate Documents, and decide their audiences. Personal authorship does not itself exclude prose from Document.

### Narrative character logs

The [initial migration](/apps/api/db/migrations/0001_init.sql) stores `character_logs.body`. [ListCharacterLogs](/apps/api/db/queries/characters.sql), [Character PostgreSQL reads](/apps/api/internal/character/postgres.go), and the mounted [Character read API](/apps/api/internal/character/http.go) return that body through a separate source path. A seed example is a narrative session journal.

If logs are authored journals, their prose belongs in Document. Their character subject, optional quest association, author, and chronology remain structured relationships. If logs instead represent immutable operational evidence, their content can remain with that evidence. The owner must settle that meaning first. The separate read path proves a separate policy mechanism, not a reproduced authorization leak.

## Conditional candidates

| Field or payload | Evidence and current limitation | Decision before moving content |
| --- | --- | --- |
| `downtime_projects.goal` and `notes` | Schema and SDL mix prose with target, progress, and status. A mounted new downtime implementation was not established. | Authored plan or journal belongs to Document. A short operational annotation can remain with the project. Keep progress and status structured. |
| `creation_catalog.description` and seed `payload.blurb` | Description is added by the product migration. The arbitrary payload keys are fixture examples. | Brief selection help can remain on an option. Substantive rules or world lore should reference Document. Keep identity and eligibility structured. |
| `unlockables.description` | Product migration adds description alongside operational unlock classification and rules. | Distinguish a short option label from an authored page. Do not move unlock rules or configuration into prose. |
| `site_settings` banner text | The seed `home_banner` payload combines `enabled` and `text`. An active banner render and write path was not established. | Decide whether this is short UI configuration or authored content with publication and revisions. If Document-backed, keep the switch and reference in settings. |
| Contextual notes on requests, availability, rewards, and time anchors | Text columns exist beside operational facts. Field type alone does not establish a document feature. | Keep concise reasons with the operation. Link a Document only for separately authored content. |

These candidates come from the [initial migration](/apps/api/db/migrations/0001_init.sql), [product migration](/apps/api/db/migrations/0003_product_graphql.sql), [QA seed](/apps/api/db/seed/qa.jsonl), and their inspected consumers. Fixture keys do not authorize new product features.

## Operational data that belongs outside authored bodies

The inspected source did not establish a current operational control whose authority incorrectly lives in a Document body or frontmatter. This is a bounded negative source finding. Stored historical Documents and imported data were not inspected.

The following boundaries already fit the owner's direction:

- Quest timing, capacity, cancellation, roster state, reward decisions, and spatial associations stay in Quest records. The quest brief stays in Document. Participation is a current relationship and status record, not just an append-only event.
- Chronicles stay in Document. Their quest, character, and region subjects belong in structured links. A Chronicle mentioning attendees is historical narrative, not automatically a competing roster authority.
- Coordinates, topology, discovery state, stewardship, and map asset references stay in spatial records. Location prose can be referenced Documents.
- `game_calendar.definition` is validated domain configuration. `time_anchors` and `game_time_map` represent calibration and materialized lookups. JSON syntax and infrequent changes do not make them authored prose.
- Character XP belongs to the ledger. External DDB payloads are integration projections. Selection and assignment relationships remain relational.
- Notifications, background jobs, retry receipts, agent questions, and Discord observations are operational records. Human-readable messages and request history do not automatically become campaign Documents.
- Audit snapshots, review snapshots, ledgers, and change histories retain historical facts. Repeating prior values in immutable evidence is not a second editable authority.

Document revisions remain content history. Document visibility markers annotate content-local access, and backend code enforces that policy. The [Document query service](/apps/api/internal/document/query.go) projects the body for the viewer before returning it. The UI does not receive every raw Document unchanged.

Frontmatter can legitimately describe content, including provenance, aliases, blurb, tags, and tone. If a value controls scheduling, capacity, permissions, delivery, or a workflow, that behavior needs an explicit typed owner. The review found no mounted Quest or spatial command extracting such controls from frontmatter.

## Separate implementation problems

These findings affect composition and truthful projections. They do not justify moving operational records into Document bodies.

| Problem | Actual source evidence | Architectural implication |
| --- | --- | --- |
| Document metadata is lost | `toDocumentType` in [GraphQL mappers](/apps/api/internal/graph/mappers.go) assigns category from kind, empty frontmatter, and request-time `UpdatedAt`. | Preserve the authoritative content projection instead of creating compensating copies in consumers. |
| Quest metadata is fabricated or omitted | `toQuestV2` in the same mapper hardcodes kind, empty tags and genres, and current timestamps. | API shape does not establish faithful data. Complete the owning projection. |
| Quest detail omits the brief body | `DETAIL_QUERY` in the [Quest adapter](/apps/web/src/features/quest/adapters/questAdapter.ts) requests brief ID, slug, and title. The [editor loader](/apps/web/src/features/editor/adapters/editorLoad.ts) separately requests `effectiveBody`. | Distinguish the operational Quest record, brief Document, and composed Quest post. Missing display is not duplicated storage. Frontend migration remains outside backend scope. |
| Quest create payloads disagree | The [editor mutation](/apps/web/src/features/editor/adapters/editorMutations.ts) sends authored content. The mounted [Quest HTTP API](/apps/api/internal/quest/http.go) expects an existing Document reference and different metadata. | Complete one transactional composition command rather than claim atomic post creation already works. |
| Map category interpretations conflict | [Spatial SQL](/apps/api/db/queries/spatial.sql) filters `location/%`, while the [map adapter](/apps/web/src/features/map/adapters/mapAdapter.ts) expects `Feature`. The actual map-place path preserves category directly and does not use `toDocumentType`. | Reconcile taxonomy. Geometry-to-Document composition is still appropriate. |
| Typed links outpace legacy reads | The product migration adds typed link targets. [Document SQL](/apps/api/db/queries/documents.sql) still joins generated `target_id` directly to Documents without a target-type restriction. | Match reads to typed relationships. If that migration is applied, numeric target collisions can misattribute links. No live collision or leak was reproduced. |

Content descriptors need the single Document-owned interpretation already proposed by the [Document storage contract](/apps/api/docs/design/graphql-product/document-storage-contract.md). The DM adapter expects `frontmatter.blurb` and tags. The agent reads citation provenance from frontmatter. The current mapper discards those values and returns false update timestamps. The agent's snapshot consistency check compares Document IDs rather than those timestamps, so this review does not claim the timestamp defect breaks that check. Complete the accepted codec and projection contract rather than create another metadata owner.

## Coverage and storage scope

The source inventory contains 69 `CREATE TABLE` declarations across the reviewed migration Up sections. Three review slices account for every table, including relevant later alterations. The local coverage check reports no missing table. This measures inspection coverage, not working features or runtime acceptance.

| Group | Tables inspected |
| --- | --- |
| People, profiles, requests, and assignments | `members`, `role_changes`, `member_settings`, `member_availability`, `dm_profiles`, `member_follows`, `dm_requests`, `unlockables`, `member_unlocks`, `lieutenant_assignments`, `archon_assignments`, `assignment_changes`, `dm_profile_review_events`, `request_decisions`, `verifications` |
| Character and reference data | `backstories`, `creation_catalog`, `character_catalog_picks`, `characters`, `character_ddb_mirrors`, `character_ddb_attempts`, `character_progression_ledger`, `downtime_projects`, `character_logs`, `character_changes` |
| Quest and reward data | `quest_arcs`, `quests`, `quest_participants`, `quest_hexes`, `quest_regions`, `quest_changes`, `quest_reward_entitlements`, `quest_reward_decisions`, `arc_changes` |
| Spatial and time data | `regions`, `maps`, `hexes`, `pois`, `hex_edges`, `hex_entry_links`, `hex_changes`, `time_anchors`, `game_calendar`, `game_time_map`, `region_changes`, `pointcrawl_nodes`, `pointcrawl_edges`, `pointcrawl_entry_links`, `pointcrawl_node_changes`, `time_anchor_changes`, `calendar_changes`, `map_changes` |
| Shared content, platform, and delivery | `documents`, `document_revisions`, `document_links`, `document_readers`, `notifications`, `notification_events`, `notification_channel_deliveries`, `background_jobs`, `idempotency_keys`, `agent_questions`, `discord_activity_events`, `bot_heartbeats`, `site_settings`, `site_setting_changes`, `job_redrives`, `operational_observations`, `auth_override_audit` |

Additional inspected storage includes the agent's LanceDB passage and vector index and browser localStorage editor drafts. The index is a derived retrieval projection. Drafts are unsaved editing state. Neither establishes another committed campaign-content authoring authority. Current running index contents and deployed modes were not inspected.

Local source inventories and challenge evidence are retained under `.local/workflow-runs/backend-plan-resume-20261016/pstack-completion/content-boundary-review/`. The durable findings and source anchors are on this page. The local reports do not become product authority.

## Decisions before implementation

The direction is settled at the responsibility level. The following choices remain with the owner:

1. Which exact Document or sections hold DM prose, and which Document revision does each approval reference? How does editing approved prose affect review state?
2. Does backstory lore use a dedicated Document or an existing Codex entry? How do personal character background and reusable lore relate?
3. Are character logs editable journals, immutable operational evidence, or two distinct features?
4. Which downtime, catalog, unlockable, banner, and contextual-note fields are substantive authored content rather than brief operational text?
5. What audiences and editing rights apply to each new reference? Existing privacy rules must not merge merely because prose shares an engine.
6. What is the composed Quest post contract, including narrative and supported media links? Separate storage ownership does not require a fragmented authoring experience.

Existing open product decisions about privileged-read audit scope, repeated-read audit identity, summary classification and selection, pending-character queues, hidden-Document POIs, and notification semantics remain unresolved. This review does not settle them or authorize their dependent implementation.

## Verification limits

This review makes source-backed findings only. It does not certify migrated databases, current stored rows, live GraphQL responses, browser behavior, production state, or full multimedia rendering. No application code, schema, tests, settings, or acceptance gates were changed for the review. No backend acceptance credit follows from documentation or table coverage.

Before a migration claims to remove duplicate authority, inspect actual stored values read-only, settle the owner decisions, and prove the composed read, write, revision, review, and visibility behavior. Historical narrative, immutable snapshots, and actionable current state must remain distinguishable.
