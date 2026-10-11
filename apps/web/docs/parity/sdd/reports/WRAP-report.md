# WRAP report — remaining implementable port gaps

**Verdict:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Constraint:** File edits only (no git writes).  
**Prior:** `FINAL-GAPS-report.md`

## Green gates

| Gate | Result |
| --- | --- |
| `bun run --filter @pi/web typecheck` | pass |
| `bun run --filter @pi/web test` | **58 files / 139 tests** pass (+4 vs FINAL-GAPS 135) |
| `bun run --filter @pi/web lint` | **14/14** design-gates (A4 boundary fixed; soft-skips unchanged) |
| `node scripts/design-gates/run-all.mjs` | **14/14** |
| `scripts/verify` | **not green** — monorepo `lint:js` fails early (pre-existing eslint outside apps/web). Accepted residual. |
| seedqa / full e2e walkthrough | **not run**. Accepted residual. |

## Delivered this wrap

### 1. LiveEditor → legacy block editor (not contenteditable)

Legacy never used `contentEditable`; it is a per-line read/edit hybrid. Ported that model as default `variant="blocks"`:

- Per-line `.le-read` / active `.le-input`, regions (`leRegions`: code/mermaid/table/callout) as `.le-widget` / `.le-rawbox`
- Enter list/quote continuation, Tab indent, Backspace merge, ArrowUp/Down between lines
- Wikilink AC against flat `entityIndex`; structure toolbar retained
- `variant="plain"` keeps the prior single-textarea path
- Exported `leRegions`, `leTypeClass` (+ tests)

Still missing vs full legacy: ContentRenderer-backed read lines, mermaid modal, LEEntityPicker/media menus.

### 2. entityIndex + search entity feed

- `editor/adapters/entityLinkIndexAdapter.ts` — `loadEntityLinkIndex` (questBoard + codexDirectory) + `searchEntityLinkFeed` (GraphQL `search`)
- `useEntityLinkIndex` wired through `EditorWorkspace` → `EditorShell` → `LiveEditor`
- MSW handlers for EntityLink* ops; unit tests for parse

### 3. questGenreOptions REST → PropertiesPanel

- `GET /v1/quests/genre-options` via `questGenreOptionsAdapter` + `rest.questGenreOptions`
- `GenreTagsField` loads options (datalist); falls back to `TAG_SUGGESTIONS` if empty/error
- Feature endpoint + MSW handler

### 4. A4 boundary — structural fix (not allowlist growth)

Ratchet ceiling forbids growing `boundary` allowlist. Fixed under apps/web:

- Verify tabs moved `verify/` → `admin/components/`
- `homeBannerAdapter` (home-local)
- Notifications adapter copy under `notifications/adapters/`
- `profileCommunityAdapter` (profile-local hub read)
- Allowlist `boundary` cleared; ratchet floor lowered `1 → 0`

### 5. Scaffold primitive APIs (gallery consumers)

Fleshed real APIs + gallery demos: Avatar, AvatarGroup, Table, WeekGrid, StatTile, SegmentedControl, ListRow, Listbox. Calendar/SplitPane/MasterDetail/ColorSwatch/Legend remain thin shells.

### 6. Matrices

- hook-matrix: `useEntityLinkIndex` → editor adapter/hook `done`
- component-matrix: Avatar, AvatarGroup, ListRow, Listbox, SegmentedControl, StatTile, Table, WeekGrid → `done`

## Accepted residual (blocked / out of scope)

1. **Full ContentRenderer markdown** in LiveEditor read lines / mermaid modal — foundation ContentRenderer still a children shell.
2. **Map-scoped useRegions** — editor has regions; map feature hooks still partial.
3. **scripts/verify** — monorepo `lint:js` (gen-parity / design-gate scripts eslint) blocks full verify; not apps/web-local.
4. **seedqa / data walkthrough e2e** — not executed this pass.
5. **Some gallery primitives** still scaffold (Calendar, SplitPane, MasterDetail, FieldDateTime wrapper, Legend/ColorSwatch thin).
6. **Uncommitted** — controller forbid git writes.

## Commands

```bash
cd chronicler
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
bun run --filter @pi/web lint   # design-gates 14/14
node scripts/design-gates/run-all.mjs
```
