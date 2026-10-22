# Frontend Design System

Last updated: 2026-10-21

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

CI runs the design gates through `bun run lint` (`scripts/design-gates/run-all.mjs`). See [scripts/design-gates/README.md](/apps/web/scripts/design-gates/README.md) for the full table: tokens (A5), duplication, orphans and theme schema (A6), ratchet (A7), layout (A8), class coverage (A9), gallery (B6), contrast (B7), effects (B8), cosmetics (B9), motion (B10), state trio (C4) and responsive (I1).

## Gallery and design sync

- The in-app gallery (`src/features/gallery/`) renders one entry per registry primitive.
- `apps/web/.design-sync/` holds the inputs that sync this design system to a claude.ai/design project, so its design agent builds with these components. It includes the curated entry `ds-pkg/index.ts`, the `DsRoot` theme wrapper, authored previews and the conventions header. Read `.design-sync/NOTES.md` before re-syncing.
