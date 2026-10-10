# Taxonomy

How kinds and states classify entities. Nouns: [nouns.md](/docs/semantics/nouns.md). Normative shape: [schema v2](/docs/interfaces/graphql-schema.md) and architecture system pages. **As-built enum drift** (frontend/backend forks): [entity-state vocabularies](/docs/systems/data-model.md) — audit, not the primary taxonomy source.

## Codex authoring categories (closed set)

Artifact, Event, Lore, NPC, Faction — one document lifecycle, one permission policy; category-specific read layouts are presentations, not separate identities. Reclassification retains document identity; NPC cannot leave category while a Lieutenant assignment exists.

## Other document kinds (N07)

Distinct from the five Codex categories but still `Document` nouns: quest brief, summary, rule, community prose, and location or other gated kinds. They share tombstone/audience rules where applicable but may have different authoring gates (see [documents and audience](/docs/systems/documents-and-audience.md)).

## Document dimensions (orthogonal)

| Dimension | Examples | Must not conflate |
| --- | --- | --- |
| Kind/category | Codex category, quest brief, summary | With audience or tombstone |
| Publication | draft / published | With deletion |
| Audience | policy, readers, scoped body | With edit permission |
| Deletion | tombstone | With identity (slug/UUID survive) |

## Quest lifecycle (quest status)

Legal transitions are enforced in code for `QuestStatus`; this table is the semantic map, not every guard in services.

| From | To (allowed examples) | Notes |
| --- | --- | --- |
| `open` | `full`, `played`, `cancelled` | `→ full` when slots fill; `→ played` only when `now >= scheduled_at` |
| `full` | `open`, `played`, `cancelled` | `→ open` when a signed-up seat frees; same `scheduled_at` guard for `→ played` |
| `played` | `closed` | Closure coordinates attendance/rewards (V07, V17) |
| `cancelled` | — | Terminal; only from `open` or `full` (before play) |
| `closed` | — | Terminal |

Canonical diagram and `LEGAL_TRANSITIONS`: [quests and play](/docs/systems/quests-and-play.md).

Participation statuses (`signed_up`, `waitlisted`, `withdrawn`, `played`, `no_show`) are **not** quest status — see N05.

## Character lifecycle

| State | Meaning |
| --- | --- |
| `active` | May sign up for quests subject to other rules |
| `pending_approval` | Verification in flight |
| `retired` | Terminal for active play; history kept; V05 refused after retire |
| `dead` | Terminal; distinct from retired in product meaning — transition verbs are not fully enumerated here |

## DM profile (N02)

`draft`, `pending`, `approved`, `rejected` — orthogonal to member `active` / `inactive` / `banned`. Rejected is not always a resubmit-friendly terminal; see [identity and access](/docs/systems/identity-lifecycle.md).

## Member vs role

Member status (`active` / `inactive` / `banned`) is distinct from composable roles (DM, Archon, Lieutenant, Verifier, Admin). Roles are not a single hierarchy. Actors: [actors.md](/docs/semantics/actors.md).

## Machine lanes

`discord`, `maintenance`, `dead_letter` — policy boundaries with named PGMQ transport; not interchangeable with logical job identity (N27).

## Region kinds

`server`, `archon`, `uncharted` — stewardship and visibility interact with map and assignment (N10, N24).
