# FINAL-GAPS report — thin remaining full-frontend port gaps

**Verdict:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Constraint:** File edits only (no git writes).  
**Prior:** `FIDELITY-report.md`

## Green gates

| Gate | Result |
| --- | --- |
| `bun run --filter @pi/web typecheck` | pass |
| `bun run --filter @pi/web test` | **57 files / 135 tests** pass (+5 vs FIDELITY 130) |
| `bun run --filter @pi/web lint` | **13/14** design-gates (A4 boundary still fails — pre-existing cross-feature imports; profile→community hub unchanged) |
| `node scripts/design-gates/run-all.mjs` | **13/14** (same A4 fail; orphan/gallery/motion/effects/cosmetic soft-skips) |
| `scripts/verify` | **not green** — fails early on monorepo `lint:js` (pre-existing eslint in `gen-parity-matrices.mjs`, `gen-qa-route-registry.mjs`, design-gate scripts). Not run to completion (infra/format/pre-commit/python). |

## Delivered this pass

### 1. LiveEditor (textarea → closer to legacy behavior)

Still textarea-based (not full contenteditable DOM), but parity pushed further:

- Ordered-list toolbar (`1.`), HR insert, quote continuation on Enter
- Tab / Shift-Tab indent-outdent on list/quote lines; Tab inserts two spaces otherwise
- Wikilink suggestion keyboard: ArrowUp/Down, Enter pick, Escape
- Paste CRLF normalization
- Structure gutter toggle (`leKind` chips)
- Exported `leKind`, `leStrip`, `leLocateInParts` (+ tests)

### 2. Rich field widgets

- Ported `fields/FieldControls.tsx` (Status, Region, Tags, GenreTags, MultiSelect, RegionMulti, Slots, DateTime, WorldDate, Select, Toggle, Pairs, Stub, Text/TextArea)
- `PropertiesPanel` wired through FieldControls (legacy switch)
- `editorConstants.ts`, `editorRegionsAdapter` (`regions` GQL)
- Minimal real `DateTimePicker` + `Popover` for pickers
- Quest schema: `regions` → `regionmulti`, `genres` → `genretags`

### 3. Dm-table schedule wire

- `profile/adapters/dmTableAdapter.ts`: `loadDmTableBySlug` (document + frontmatter) + `loadDmTableSchedule` (questBoard filtered by DM handle — contract-safe; no dedicated schedule query)
- `DmTableDetailPage` shows document panel when present, host fallback, live schedule list / `schedule-empty`
- `DmTablePanel` expanded (create CTA, draft chip, blurb/tags/body)

### 4. Gallery entries

Registry expanded from ~16 → **~32** entries: avatar, avatar-group, table, list-row, stat-tile, segmented-control, color-swatch, legend, stub-notice, calendar, week-grid, split-pane, master-detail, listbox, field-date-time (+ prior toast/status-badge/popover/skeleton). Many primitives remain scaffold shells with meaningful demo children.

### 5. Matrices / docs

- component-matrix: DateTimePicker, Popover, FieldControls → done
- hook-matrix: useDmTable → profile dmTableAdapter; useRegions/V2 → editorRegionsAdapter (partial)
- wire-by-page: dm-table row updated

## Remaining concerns (cannot close without larger work / contracts)

1. **LiveEditor contenteditable** — full legacy `.le-read` / widget / mermaid modal DOM not ported; still textarea + helpers.
2. **entityIndex feed** — prop ready; no global entity index hook wired into EditorShell.
3. **questGenreOptions** — GenreTagsField falls back to static `TAG_SUGGESTIONS` until a genre-options adapter exists.
4. **Map-scoped useRegions** — editor has its own regions load; map feature hooks still pending.
5. **Gallery primitives** — Avatar/Table/WeekGrid/etc. still scaffold APIs; demos wrap children only. Legacy ~27 entry files; we cover most IDs but not full docs/overflow metadata.
6. **A4 boundary** — admin↔verify, home→admin, notifications→member, profile→community remain.
7. **scripts/verify** — monorepo lint:js + full infra not green; seedqa walkthrough not run.
8. **Uncommitted** (controller forbid git writes).

## Commands

```bash
cd chronicler
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
bun run --filter @pi/web lint   # design-gates 13/14
node scripts/design-gates/run-all.mjs
```
