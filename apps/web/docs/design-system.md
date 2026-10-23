# Frontend Design System

Last updated: 2026-10-22

## Layer stack

```
tokens.css → global stylesheets → primitives / foundation React → domain components → feature pages
```

| Layer             | Location                                                                    | Examples                                                    |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Tokens            | `src/styles/tokens.css`                                                     | `--p-*` primitives, `--color-*` semantics, `--sp-*`, `--rad` |
| Global CSS        | `src/styles/index.css` and its imports                                      | `.stack`, `.row`, `.type-*`, `.card`, `.btn`, `.chip`       |
| Primitives        | `src/components/primitives/` (registry: `src/styles/primitives.registry.ts`) | `Button`, `Card`, `Chip`, `Tabs`, `Modal`, `WeekGrid`       |
| Foundation React  | `src/components/foundation/`                                                | `Field`, `PageShell`, `StatePanel`, `StatusBadge`           |
| Domain components | `src/components/domain/`, `src/components/data/`                            | `DmTablePanel`, `Party`                                     |
| Feature UI        | `src/features/*/components/`, `src/features/*/pages/`                       | quest board, chronicles timeline                            |

## Tokens

Three tiers (W3C design-tokens draft):

1. **Primitive** `--p-*`: raw values, one block per theme × mode. Components never read these (gate A5).
2. **Semantic** `--color-*`: what components consume (`--color-text`, `--color-accent`, `--color-bg-panel`).
3. **Component** (`--btn-*`, `--field-*`): optional, per component.

Themes are `[data-theme][data-mode]` blocks on `<html>`, set by the boot script in `index.html` and `context/theme.utils.ts`. Ruled themes: parchment (default), midnight, ember, dracula, vegan; each has light and dark (`themes.manifest.json`, gate A6 theme-schema). Spacing `--sp-1`..`--sp-8` scales with `data-density`.

## Page layout (round 3)

One frame, one width, one anatomy. The tokens live in the layout section of `tokens.css`:

| Token | Value | Use |
| ----- | ----- | --- |
| `--page-max` | `73.75rem` (1180px) | The page frame on every route. There is no wide tier. |
| `--page-max-reading` | `48rem` | Inner column for long-form reading and single forms (`.reading-column`, `.cr-prose`, editor body). Never the frame. |
| `--page-gutter-inline` | `--sp-6`; `--sp-4` under `[data-width-class='compact']` | Frame side padding, set from Imposition's width class (no `@media`). |
| `--page-pad-block-start` / `-end` | `--sp-7` / `--sp-8` | Frame top and bottom padding. |
| `--rail-width` | `20rem` | The one side rail allowed on detail pages, through `DetailLayout` (SplitPane `layout="rail"`). |
| `--detail-main-min` | `36rem` | `DetailLayout` main column minimum; below it the rail wraps under the main column. |
| `--card-min` | `18.75rem` (300px) | Minimum column of every auto-fill card grid (`CardGrid`, `.roster`, `[data-cols='auto']`). |
| `--filter-search-width` | `20rem` | `FilterBar.Search` inline size; fixed so typing never reflows the bar. |

`PageShell` always renders `.page-root > .page`; `context` only adds the `ctx-*` class to `.page-root`. `.page` (base.css) is the only rule that sets a page width. The `max` prop is deprecated and ignored. The document root reserves its scrollbar gutter (`scrollbar-gutter: stable`, shell.css), so a tab switch that changes page height never moves the frame sideways.

Index-page anatomy, top to bottom:

```
PageHeader   eyebrow? / title / lede? / meta?     actions (right, on the title baseline)
FilterBar    [search] [chip groups or Picker] ...  count (right)    <- full width, one surface
Content      CardGrid or list, full frame width
```

Filters never sit in a side rail on an index page. Page-section tabs use the `Tabs` primitive (or `Tabs.Nav` for route links), whose one skin matches the top nav pills; `SegmentedControl` is for value switches inside forms. The L5 drift gate (`check-page-layout.mjs`) enforces this; see [ui-conventions.md](/apps/web/docs/ui-conventions.md#page-layout-primitives).

Detail-page anatomy (one quest, entry, profile, character, and every editor):

```
PageHeader   ← Parent (back link) / title / lede? / meta?   actions (right)
DetailLayout main column (full width)  |  rail? (--rail-width; drops under main on narrow)
             prose body in DetailLayout.Reading (--page-max-reading)
```

### Labels, display values and states (round 3, L7)

- **Sentence case everywhere.** No type tier or shared class sets `text-transform: uppercase` (`.type-heading`, `.type-label`, `.type-ui`, `.eyebrow`, table heads, editor labels). Hierarchy comes from size and weight. Eyebrows are optional; leave them out when they repeat the nav item or the title.
- **One back link.** `PageHeader back={{ to, label }}` renders "← Codex" above the title, named for the real parent page. No other back-link style.
- **Display values.** Dates and times go through `utils/format.ts` (`useDateFormatter()` in components) in the viewer's zone: "7 Mar 2026", "Sat 7 Mar 2026, 23:30". No zone name unless the viewer chose UTC (or the time falls in the repeated autumn DST hour). People show by `personName()`; `handleLabel()` (`@handle`, null for numeric ids) is secondary text on profiles only. Never show slugs, snowflake ids, "Code", revision numbers or enum keys (`isMachineId()`, `statusLabel()`, `humanizeKey()`).
- **One state surface.** Page-level loading, empty, error and denied states are `StatePanel` (parchment `.card.state-panel` at frame width: optional heading, one sentence, one action). "Nothing here" inside a section is `EmptyState` (dashed parchment slot, one sentence, one action). Never a plain white or centred box.

## Rules

1. **No page-injected `<style>` blocks**: use scoped CSS modules (`*.module.css`) or global classes.
2. **No hardcoded colour or spacing in components**: use semantic tokens (`var(--color-*)`, `var(--sp-*)`). Prefer layout attributes (`data-gap`, `data-align`) over inline `style`.
3. **Reusable components receive view props only**: no `api/`, store, auth or hook imports in `primitives/` or `foundation/`. App wiring lives beside them, for example `chrome/ToastHost.tsx` and `hooks/useToast.ts` around the presentational `Toast`.
4. **One styling hook per state**: a primitive's emitted classes and `data-*` values must be the ones its stylesheet selects (gate A9). Button variants and sizes use `.btn--{variant}` / `.btn--{size}`; link-buttons (`<Link className="btn btn--primary">`) use the same classes. The bare `.primary` / `.ghost` / `.sm` / `.lg` classes are legacy aliases.
5. **Feature pages wire hooks → adapters → view models → components.**

## Behaviour layer

Pattern: **headless primitive + project CSS skin**. Overlay and menu behaviour (focus scope, dismissal, portals, inert background, scroll lock, positioning, menu keyboard model) comes from [Base UI](https://base-ui.com) (`@base-ui/react`, pinned). Chronicler's classes supply the look: Base UI parts receive `className` and expose state as `data-*` attributes.

| Primitive | Behaviour from | Notes |
| --------- | -------------- | ----- |
| `Modal` | Base UI Dialog | Portalled; background inert; scroll locked; nested dialogs stack |
| `Popover` | Base UI Popover | Dialog-type content; collision-aware positioning |
| `Menu` | Base UI Menu | Action/choice lists: arrows, Home/End, typeahead |
| `SegmentedControl` | In-house | APG radio group: one tab stop, arrows move focus and select |
| `Listbox` | In-house | APG single-select listbox: `aria-activedescendant`, typeahead, selection follows arrows |
| `Tabs` | In-house | APG tabs with roving tabindex |

New interactive primitives (Tooltip, Select, Combobox, Checkbox, Switch, Radio) should wrap the matching Base UI component the same way rather than hand-rolling focus or keyboard handling. Portalled content renders outside page containers, so scope classes (for example `.hf2`) belong on the popup itself.

## Enforcement

CI runs the design gates through `bun run lint` (`scripts/design-gates/run-all.mjs`). See [scripts/design-gates/README.md](/apps/web/scripts/design-gates/README.md) for the full table: tokens (A5), duplication, orphans and theme schema (A6), ratchet (A7), layout (A8), class coverage (A9), gallery (B6), contrast (B7), effects (B8), cosmetics (B9), motion (B10), state trio (C4), responsive (I1) and page layout (L5).

## Gallery and design sync

- The in-app gallery (`src/features/gallery/`) renders one entry per registry primitive.
- `apps/web/.design-sync/` holds the inputs that sync this design system to a claude.ai/design project, so its design agent builds with these components. It includes the curated entry `ds-pkg/index.ts`, the `DsRoot` theme wrapper, authored previews and the conventions header. Read `.design-sync/NOTES.md` before re-syncing.
