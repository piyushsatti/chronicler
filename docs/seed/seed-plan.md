# Weeping day-zero seed plan

This plan seeds the Weeping world (see `weeping-digest.md`) into Chronicler.
It reuses the existing JSONL fixture loader, `apps/api/cmd/seedqa`, which
`scripts/load-qa.sh` already uses for `qa.jsonl`. The only loader change is
one new reference form, `platform_owner`, described below.

**Status: not loaded anywhere.** The seed has only been loaded into a
throwaway Postgres container, which has since been removed. Loading into dev,
staging or production waits for an explicit go-ahead.

## Files

| File                                    | What it is                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `docs/seed/build_weeping_seed.py`       | Generator. Reads the extracted archive and writes the JSONL files. Standard library only; run with `python3 -I`. |
| `apps/api/cmd/seedqa/main.go`           | Loader. Gains the `platform_owner` member reference (plus a unit test in `main_test.go`).                        |
| `apps/api/db/seed/weeping.jsonl`        | Documents, the Lightfall region and the character-creation catalog.                                              |
| `apps/api/db/seed/weeping-hexmap.jsonl` | The Lightfall hex map as a pointcrawl: one map, its nodes and edges.                                             |

## Author: the platform owner, resolved at load time

Every seeded document's `author_id` and the hex map's `created_by` are
written as `{"table": "members", "platform_owner": true}` instead of a
`public_id`. At load time `seedqa` reads `PLATFORM_OWNER_DISCORD_ID` from the
environment, checks it is 17–20 ASCII digits (the same rule as
`internal/platform/config`), and resolves it to the active member with that
`discord_id`. The ID is never written to the repository, and the loader's
error messages never print it.

This is load-time reference resolution with the value injected from the
environment, the same pattern the API uses for the owner at boot. It moves
toward one surface: the owner has one configured source, used by both.

The loader stops before writing anything when:

- the variable is unset: `PLATFORM_OWNER_DISCORD_ID is not set; this fixture needs it to resolve the platform owner member`;
- the value is malformed: `invalid PLATFORM_OWNER_DISCORD_ID`;
- no active member has that Discord ID (the owner must have signed in once):
  the load aborts and its transaction rolls back.

`--author-public-id` on the generator still pins a specific member instead,
for example the `local.sql` admin on a throwaway database.

## How the loader works

Each JSONL line is `{table, conflict, refs, row}`. `refs` turn a `public_id`
into the internal bigint id at load time. Every insert is
`ON CONFLICT (<conflict columns>) DO NOTHING`, and the whole file runs in one
transaction. Before inserting, the loader checks that `goose_db_version`
matches the newest migration in `db/migrations`.

Consequences:

- Re-running is safe: rows that already exist are skipped, nothing is updated
  or deleted.
- Editing a source file and re-running does **not** update an existing row.
  A changed document must be edited in the app or via the API.
- Public ids are deterministic (UUIDv5 from a fixed namespace and the entity
  name), so a rebuild produces the same ids.

## Mapping

| Archive content                               | Target                                                                               | Conflict key   |        Count |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- | -----------: |
| Codex NPC files                               | `documents`, kind `codex_entry`, category `NPC`                                      | `slug`         |            4 |
| Codex faction files                           | `documents`, `codex_entry`, `Faction`                                                | `slug`         |            4 |
| Codex artifact files                          | `documents`, `codex_entry`, `Artifact`                                               | `slug`         |            3 |
| Codex lore files                              | `documents`, `codex_entry`, `Lore`                                                   | `slug`         |            6 |
| "Notable Locations" bullets in `Lightfall.md` | `documents`, `codex_entry`, `Locations`                                              | `slug`         |            9 |
| Guides                                        | `documents`, kind `rule`, category = guide cluster                                   | `slug`         |           18 |
| Rulings                                       | `documents`, kind `rule`, category `ruling`                                          | `slug`         |            4 |
| Lightfall                                     | `regions`, kind `server`, linked to the Lightfall document                           | `public_id`    |            1 |
| Species / classes / backgrounds               | `creation_catalog`, kinds `species` / `class` / `background`, codes `weeping_<slug>` | `(kind, code)` | 15 / 13 / 17 |
| Hex map                                       | `maps` (`pointcrawl`, atlas code `WEEPING-LF`)                                       | `atlas_code`   |            1 |
| Hexes                                         | `pointcrawl_nodes`, named by hex code                                                | `public_id`    |          161 |
| Hex adjacency                                 | `pointcrawl_edges`, kind `hex`                                                       | `public_id`    |          436 |

All documents are `published`, `public`, dated 2026-10-25. Frontmatter keys
other than `title`, `category` and `locked` are kept in `frontmatter_yaml`
(the API exposes them as `frontmatter`). Guides and rulings carry their
description as `summary`, which the rules list uses as the excerpt.

Codex categories match the allowed list in
`internal/document/product_validation.go`. There is no `Region` category, so
Lightfall itself is a `Lore` entry plus a `regions` row.

Hex layout: flat-top axial grid, ring 1 starting at cardinal north and walking
clockwise, matching the convention in the DM Mechanics guide. The map has no
`asset_path`, so the viewer fits the graph to the node bounds.

## Verification done

On a disposable Postgres (port 55432, removed afterwards), with the
platform-owner build:

1. `goose up` to the latest migration, then `db/seed/local.sql`.
2. Owner variable unset, malformed, and pointing at no member: each run
   failed with the message above, and the document count stayed at 1.
3. Added a scratch member with a made-up 17-digit Discord ID (scratch DB
   only), then loaded `weeping.jsonl` and `weeping-hexmap.jsonl` twice. The
   second run inserted nothing. Totals: documents 49 (48 + 1 from
   `local.sql`), all 48 Weeping documents and the map owned by the scratch
   member; regions 2, maps 2, nodes 161, edges 436, catalog 45 (1
   unavailable). No body contains "lightbearer"; 4 documents mention an
   "Order of Frostmarch" or "Order of Sol Invictus".
4. Loaded `qa.jsonl` on top without errors.
5. Unit tests: `go test ./cmd/seedqa` (the non-database tests, including the
   new `TestPlatformOwnerRef`) pass.

An earlier build (dev admin as author) was also run against the API on a
scratch database: `document(slug: "katsik-i")` returned category
`NPC`, parsed frontmatter and an author; `codexCategories` listed the
Weeping categories; `map(atlasCode: "WEEPING-LF")` returned 161 nodes and
436 edges (with `limit: 500`; the default limit is 200).

## Commands (run only after approval)

Always pass `DATABASE_URL` explicitly. The loader's default points at the dev
Postgres on `127.0.0.1:5432`.

Check the target is reachable and migrated, without writing:

```bash
cd apps/api && DATABASE_URL='<target>' go run ./cmd/seedqa -check -file db/seed/weeping.jsonl -migrations db/migrations
```

Load the world, then the hex map. `PLATFORM_OWNER_DISCORD_ID` must already be
in the environment (on staging and production it comes from the GitHub
secret or host environment; never paste it into a command that is logged):

```bash
cd apps/api && DATABASE_URL='<target>' go run ./cmd/seedqa -file db/seed/weeping.jsonl -migrations db/migrations
```

```bash
cd apps/api && DATABASE_URL='<target>' go run ./cmd/seedqa -file db/seed/weeping-hexmap.jsonl -migrations db/migrations
```

Production changes run only through GitHub Actions (D33), so a production
load would need a workflow step, not a workstation command.

Rebuild after changing the generator:

```bash
python3 -I docs/seed/build_weeping_seed.py <extracted-archive-dir> --out apps/api/db/seed/weeping.jsonl --hexmap-out apps/api/db/seed/weeping-hexmap.jsonl
```

A `scripts/load-weeping.sh` wrapper, mirroring `load-qa.sh` but without a
default `DATABASE_URL`, can be added if wanted.

## Gaps (content with no home in the schema)

1. **Calendar.** The archive has no calendar. `game_calendar` is a singleton
   row already inserted by `local.sql`, so a seed insert would be skipped
   anyway; a calendar would be set with the `updateGameCalendar` mutation.
2. **Hex state.** Migration 0011 adds `pointcrawl_nodes.state` (locked /
   unlocked / mapped, default locked) and admins set it with
   `setPointcrawlNodeState`. The seed does not set it yet, so every seeded hex
   starts locked. Day zero should have only LFC1001 and ring 1 unlocked.
3. **Hex tile images.** 161 tile image URLs exist (in `Untitled.md`) but nodes
   have no per-node image column, and the map has no background image yet.
4. **Magic item recipes and relics.** 516 recipes and the relic economy have no
   table; `unlockables` only allows `achievement` and `dm_tier`. They stay in
   the Magic Items guide text.
5. **Deities and events.** No table; they live in lore text only.
6. **Cross-links.** `document_links` (NPC to faction, location to region) are
   not seeded.
7. **Inline images** are external URLs (`i.ibb.co`, Discord CDN). Discord CDN
   links may expire.

## Decisions (owner defaults, 2026-10-25)

1. **Author:** the platform owner, resolved at load time from
   `PLATFORM_OWNER_DISCORD_ID` (see above).
2. **Lightfall region kind:** `server`.
3. **Locations visibility:** the 9 Lightfall locations are `published` and
   `public`, so everyone can read them on day zero. The region and archon
   gates in `internal/platform/auth/policy.go` apply to editing Locations
   entries, not to reading them.
4. **Names:** "Lightkeeper" is the ruler title; the order is "Order of
   Frostmarch" / "Order of Sol Invictus" and the place keeps the bare name.
   The Metron and the Mage's Guild are left as the source has them. The exact
   replacements are listed in `weeping-digest.md`.
5. **Sailor background:** stays unavailable.
6. **Hamstring Shot:** seeded as written; listed in the digest for the DMs.
7. **Rulings:** one `ruling` category.
