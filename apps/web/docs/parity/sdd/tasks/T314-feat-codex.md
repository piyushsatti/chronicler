# T314-feat-codex — Codex reader and compatibility paths

## Routes

All `/codex/*` detail and directory paths, `/npcs*`, `/factions*`, `/regions` list

## Allowed globs

`features/codex/**`, tests

## Owner ruling — 2026-10-19 (Toronto)

The canonical resource URL is `/codex/:slug`. This supersedes the Phase 0 prohibition on that route and converges directory, entity-link, editor-publish, and compatibility links on the same NEW reader.

- Slug aliases `/codex/npc/:slug`, `/codex/faction/:slug`, `/codex/region/:slug`, `/codex/location/:slug`, `/npcs/:slug`, and `/factions/:slug` redirect to the canonical reader.
- UUID aliases `/codex/artifact/:id`, `/codex/event/:id`, and `/codex/lore/:id` resolve existing `documentById(id)` metadata, validate `kind === 'codex_entry'`, then redirect using its canonical slug. They do not treat a UUID as a slug or impose retired category meanings.
- The canonical reader uses `codexEntry(slug)` for the readable document and actual backlink count. Existing audience errors and Zod boundaries remain authoritative; missing, unreadable, malformed, and other-kind results do not render document content.
- Existing `/codex/new` and category/new/edit routes retain registration precedence, including `/codex/npc/new` and `/codex/artifact/new`.
