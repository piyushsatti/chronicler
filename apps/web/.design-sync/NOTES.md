# design-sync notes (chronicler web)

Config home is `apps/web` (run everything from there). Package shape, no Storybook.

## Setup

- The design system is not a published package. `.design-sync/ds-pkg/` is a sync-only entry package: `index.ts` re-exports the curated DS surface from `src/components/{primitives,foundation,interactive}`; `DsRoot.tsx` is the provider (sets `data-theme`/`data-mode`/`data-density` on `<html>` like `index.html`'s boot script, paints the theme page surface, supplies `MemoryRouter` for `Card`'s react-router `Link`).
- `buildCmd` (`node .design-sync/build-css.mjs`) flattens `src/styles/index.css` into `ds-pkg/dist/styles.css` and copies the self-hosted fonts from `public/fonts/`. Run it before the converter whenever styles change. `ds-pkg/dist/` is gitignored by the root `dist/` rule.
- No playwright browser cache on this host: export `DS_CHROMIUM_PATH=/usr/bin/google-chrome` for validate and capture.
- Converter deps install into `.ds-sync/` with `npm i esbuild ts-morph @types/react playwright@1.62.1`; esbuild works without its postinstall.
- `.design-sync/overrides/dts.mjs` fork: the converter treats props declared outside the entry package as inherited DOM noise and dropped own handlers (`onValueChange`, `onSortChange`...). The fork counts `apps/web/src/**` as the DS's own source. Needs `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` per clone.
- `dtsPropsFor` holds hand-resolved prop bodies for components whose extracted `.d.ts` referenced unexported helper types (`ListboxOption<T>`, `Column<T>`, `DayCell`, `AppError`, bare `CSSProperties`) or lost Button's native `disabled`/`type`/`onClick`. Re-check them when those components' props change.

## Excluded from the sync surface

- `Toast` / `ToastHost` / `useToast`: `Toast.tsx` imports auth, Redux store and `useMe`, which drags the whole app graph (features, `.graphql?raw` imports, CSS modules) into the bundle. Excluded until Toast is decoupled from app state.
- `ContentRenderer` / `MermaidBlock`: Mermaid adds ~7.8 MB to the bundle (156 KB without). Excluded for bundle size.
- `components/domain/*` and `components/data/*`: app-wired, not DS primitives.

## Preview authoring

- Layout vocabulary for previews: `.stack` / `.row` with `data-gap="1".."8"`, `data-align`, `data-wrap="1"`; type classes `.type-display|heading|title|label|body|narrative|caption|code|value|ui`.
- `Card.Header` and `Card.Footer` are flex rows (`align-items: center`). Put `Card.Eyebrow` outside the header, otherwise it squeezes beside the title.
- Content theme: tabletop campaign management (quests, sessions, chronicles, characters, DMs).
- Modal (and any fixed-position overlay) in a cardMode single card needs a wrapper with explicit height (480px) in the preview: the single-card container is a transformed containing block with no height, so the fixed backdrop otherwise collapses to a 32px strip.

## App styling defects found and fixed during the first sync (2026-10-21)

Preview authoring exposed primitives whose markup and stylesheet disagreed (Chip, AvatarGroup, Avatar empty, Listbox, SegmentedControl, Tabs, Popover, Skeleton, ListRow, StatTile, WeekGrid heat, Toast, Chip.Row). Owner authorized fixing them in `src/`; fixes live in the "Markup/stylesheet convergence (2026-10-21)" section of `src/styles/primitives.css` plus targeted component edits. Design gate A9 (`check-class-coverage.mjs`) now fails CI when a primitive emits an unstyled class hook, so this class of defect cannot silently return.

- Toast is now a styled presentational primitive (`.pr-toast`); `ToastHost` (`src/chrome/`) and `useToast` (`src/hooks/`) hold the store wiring. Toast is back in the sync surface.
- WeekGrid hot heat cells referenced the undefined token `--color-bg`; now `--color-bg-deep`. Remaining undefined-token references outside primitives (left for the owner): `--color-surface-2` (character detail), `--space-3` (onboarding calendar, has fallback), `--flair-gold` (tokens.css, has fallback).
- DateTimePicker default `className="field"` makes the input the `.field` container; previews pass `className="field-input"` (not yet fixed in src).

## Preview authoring gotchas

- Glyphs outside the DS fonts (for example `◐`) render as slivers; use ○/●.
- `Calendar` renders only title, caption and children; compose it with content.
- `MasterDetail` list has no selected marker; only the detail pane follows `selectedKey`.

## Known render warns

- None on the final build. Review sheets show ~500px-tall cells for one-line content (capture card sizing); not a defect.

## Re-sync risks

- First upload done 2026-10-21 into project "Chronicler" (`projectId` in config.json), 174 files. DesignSync auth on triton comes from running `/design-login` once in an interactive `claude` terminal there; desktop-app sessions cannot run it themselves. Re-syncs are anchored: fetch the project's `_ds_sync.json` to `.design-sync/.cache/remote-sync.json` and pass `--remote`.
- `ds-pkg/index.ts` is a hand-curated export list. New primitives are not synced until added there (and to `primitives.registry.ts`). `ContentRenderer`/`MermaidBlock` stay excluded: the converter's single-file bundle inlines Mermaid's dynamic import (~7.8 MB).
- `dtsPropsFor` bodies are hand-written copies of prop types (Button, Card, Field, Listbox, SegmentedControl, MasterDetail, StatePanel, Legend, Table, Avatar, WeekGrid). They go stale silently when those props change; diff them against the source on every re-sync.
- `overrides/dts.mjs` is a fork of the converter's `lib/dts.mjs` (one added line). On re-sync, diff it against the bundled `lib/dts.mjs` and merge upstream changes.
- `build-css.mjs` hardcodes the five font files from `public/fonts/`. A new or renamed font needs adding there.
- Previews were graded on the parchment dark theme only; other themes and light mode were not visually verified.
- Tool versions used: Node 24.21.0, playwright 1.62.1 driving system Chrome 155 via `DS_CHROMIUM_PATH`.
