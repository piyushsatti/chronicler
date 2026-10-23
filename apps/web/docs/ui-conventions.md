# Frontend UI conventions — deep reference

Extracted 2026-08-22 from `src/frontend/AGENTS.md` per agent-files v0.1.0 §4. Operational guardrails (token vocabulary summary, gates/ratchet, error-copy rule, test mirroring, generated-type boundaries) remain in that file; this page preserves the full tables, recipes, theming matrix, and structure map verbatim.

# Frontend -- React Web App Instructions

This is the web frontend: a thin client that displays data from the Python GraphQL API. It is the second interface alongside the Discord bot.

## Stack

- **Vite** for build and dev server
- **React** with functional components only
- **React Router** for routing
- **TanStack Query** for all server state and data fetching
- ~~Tailwind CSS for layout utilities~~ -- RETIRED by C9 (design-language.md): layout mechanics are `data-justify`/`data-align`/`data-cols`/`data-gap`/`data-grow`/`data-shrink`/`data-wrap`/`data-row` (`app/styles/layout.css`), never a Tailwind utility class. Tailwind still ships (color-class retargeting per fork 11, `tailwind.config.ts`), it is just not the layout mechanism.
- **Atlas** (`app/styles/atlas.css`) -- the structural design system; use Atlas component classes + design tokens
- **graphql-request** for API calls
- **TypeScript** with strict mode

No external component libraries -- no Material UI, Chakra, Ant, shadcn, or pixel-retroui.

## The token vocabulary: one mechanism per concern

Every visual property has exactly one sanctioned API. A component that reaches around it (raw hex, inline `fontSize`, a `justifyContent` style object, a Tailwind color class) is a defect, not a style choice -- see design-language.md's composition rules C1/C2/C6/C9/C10.

| Concern                                                | Sole API                                                                                                                                                           | Never                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Color                                                  | CSS variables from `app/styles/tokens.css` (`--color-*`, semantic tier)                                                                                            | Raw hex/rgb/hsl/color-mix-with-literal, Tailwind color classes (`bg-gray-900`, `text-white`, `bg-bg-*`, `text-text-*`) |
| Typography                                             | The 10 `type-*` classes (below)                                                                                                                                    | Inline `fontSize`/`fontWeight`/`fontFamily`/`lineHeight`/`letterSpacing`, `text-sm`/`font-bold`/`text-gray-500`        |
| Spacing                                                | `--sp-*` tokens, or `data-gap="N"` on a layout element                                                                                                             | Raw px gap/padding/margin values                                                                                       |
| Layout mechanics (justify/align/grow/row/column)       | `data-justify` / `data-align` / `data-cols` / `data-gap` attributes, backed by `app/styles/layout.css`, on top of `.stack`/`.row`/`.cols` (`app/styles/atlas.css`) | Inline `style={{ display: 'flex', justifyContent: … }}` objects                                                        |
| Per-datum color (region color on a pill, category dot) | A token, or `color-mix()` with a CSS variable operand                                                                                                              | String-concatenated hex+alpha (`` `${col}1c` ``)                                                                       |

### Typography tiers

10 semantic CSS classes for ALL text styling. Components never set font-family, font-size, or text color inline -- they use a tier class.

| Class            | Purpose           | Font      | Example                |
| ---------------- | ----------------- | --------- | ---------------------- |
| `type-display`   | Page titles       | heading   | Command center         |
| `type-heading`   | Section titles    | heading   | Recent quests          |
| `type-title`     | Entity/card names | heading   | Siege of Kraghold      |
| `type-label`     | Small labels      | body      | Quests active          |
| `type-body`      | Paragraph text    | body      | Description text...    |
| `type-narrative` | Prose/lore        | narrative | Adventure summaries... |
| `type-caption`   | Helper text       | body      | 5 Apr 2025, DM Ashwin  |
| `type-code`      | Short codes       | heading   | Q-42, C-131            |
| `type-value`     | Stat numbers      | heading   | 247                    |
| `type-ui`        | Interactive text  | heading   | Tab labels, filters    |

### Layout API

`data-justify`, `data-align`, `data-cols`, `data-gap`, `data-grow`, `data-shrink`, `data-wrap`, `data-row` -- attribute-driven, defined in `app/styles/layout.css`. `--sp-*` is the only spacing mechanism at every depth, not just the page shell. Example:

```tsx
<div className="row" data-justify="between" data-align="center" data-gap="3">
```

## The gates: how this doc is enforced

Seven `scripts/design-gates/check-*.mjs` gates are the enforcement mechanism for the table above, plus `eslint.config.js`'s boundary rules and one meta-gate (`check:ratchet`) that stops the others from being worked around by growing the allowlist. All of it runs in `pnpm lint`; a new-and-unlisted violation fails CI.

| Gate                      | Script                                                                                   | Guards                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check:tokens` (A5)       | `scripts/design-gates/check-tokens.mjs`                                                  | Color: no raw hex/rgb/hsl, no `--p-*` outside the semantic tier, no Tailwind color classes                                                                                                                                                                                                 |
| `check:layout` (A8)       | `scripts/design-gates/check-layout.mjs`                                                  | Layout: no inline `display:flex`/`justifyContent`/`alignItems` style objects                                                                                                                                                                                                               |
| `check:boundary` (A4)     | `scripts/design-gates/check-boundary.mjs` + `eslint.config.js` (`no-restricted-imports`) | Three rules: `app/components/**` never imports `app/features/**` or `app/api/generated`\|`app/api/types`; `app/features/**` (outside `adapters/**`) never imports `app/api/generated`\|`app/api/types` directly; `app/features/<X>/**` never imports `app/features/<Y>/**` (cross-feature) |
| `check:duplication` (A6)  | `scripts/design-gates/check-duplication.mjs`                                             | No registry primitive has a second exported implementation, AND no unjustified near-duplicate cluster under `app/components/map/**`/`app/features/map/**` (name-similarity; needs a `// duplication-justified: <reason>` comment if intentional)                                           |
| `check:orphan` (A6)       | `scripts/design-gates/check-orphan.mjs`                                                  | Every file under `app/components/**` has at least one real importer (gallery counts)                                                                                                                                                                                                       |
| `check:theme-schema` (A6) | `scripts/design-gates/check-theme-schema.mjs`                                            | Every manifest-ruled theme/mode has a `tokens.css` block, that block declares every required `--p-*` token (union across ruled blocks), and `themes.manifest.json` itself passes its typed-options schema                                                                                  |
| `check:ratchet` (A7)      | `scripts/design-gates/check-ratchet.mjs`                                                 | The above gates' allowlists may only shrink -- a growing allowlist is red, even if every entry is individually listed                                                                                                                                                                      |

Pre-existing violations are enumerated in `scripts/design-gates/allowlist.json` (file:line, rule, owning Epic C wave). Adding new code to an already-allowlisted line is fine; adding a _new_ violation anywhere is not -- fix it with the sanctioned API, or add an allowlist entry naming the wave that will remove it (never add one without a wave).

### Adding a primitive

1. Check `app/styles/primitives.registry.ts` first -- if a primitive already covers the shape you need, extend or compose it rather than hand-rolling a new one (`check:duplication` will catch a near-duplicate).
2. Build it with the compound-component pattern where it has sub-parts (`<Tabs><Tabs.List>…`), a single `variant`/`tone` prop for skins, never a boolean-prop explosion (C5).
3. Colors, type, spacing, and layout mechanics all go through the tables above -- a primitive is not exempt from the token vocabulary.
4. Stateful primitives expose `x` / `onXChange` / `defaultX` (controlled with uncontrolled default, C15); the primitive owns its own state only when `x` is omitted.
5. Register it in `primitives.registry.ts` so `check:duplication` and `check:orphan` can see it.
6. Run `pnpm run lint` before opening a PR -- it runs every gate above in sequence and reports every red one, not just the first.

### Page layout primitives

Every route renders inside `PageShell` (one frame, `--page-max`). Index pages compose three registry primitives inside it; do not hand-build headers, filter bars or card grids.

```tsx
<PageShell context="chronicle" className="hf2">
  <SingleRegionPage page="chronicles">
    <PageHeader
      eyebrow="Game timeline"
      title="Chronicles"
      lede="Session recaps, player journals, arc summaries and world events."
      actions={canCreate ? <Link className="btn btn--primary" to="/editor/new">+ New entry</Link> : null}
    />
    <FilterBar label="Filter chronicles" count={`${total} entries`}>
      <FilterBar.Search label="Search entries" placeholder="Search entries…" value={q} onValueChange={setQ} />
      <FilterBar.Group label="Author">
        {authors.map((a) => <Chip key={a.id} selected={a.id === author} onClick={() => setAuthor(a.id)}>{a.label}</Chip>)}
      </FilterBar.Group>
    </FilterBar>
    <CardGrid as="ul" aria-label="Entries">{/* <li> cards */}</CardGrid>
  </SingleRegionPage>
</PageShell>
```

| Primitive | Props | Notes |
| --------- | ----- | ----- |
| `PageHeader` | `title`, `back?: { to, label }`, `eyebrow?`, `lede?`, `meta?`, `actions?`, `level?: 1 \| 2` | `back` is the one back-link style ("← Codex", above the title). Actions sit right of the title on its baseline and wrap below on narrow screens. `PageShell title= back=` renders one for simple pages. |
| `DetailLayout` | children (main), `rail?`, `railLabel?`, `className?`; `DetailLayout.Reading` | Detail pages: full-width main column plus an optional `--rail-width` rail (`<aside>` landmark) through `SplitPane layout="rail"`; the rail wraps under main below `--detail-main-min`. Prose goes in `DetailLayout.Reading`. |
| `SplitPane` | `start`, `end`, `layout?: 'equal' \| 'rail'`, `label?` | `rail` is what `DetailLayout` uses; pages use `DetailLayout`, not `SplitPane` directly. |
| `StatePanel` | `status`, `error?`, `title?`, `emptyMessage?`, `deniedMessage?`, `action?`, `onRetry?`, `retryLabel?`, `variant?` | Page states on one parchment card at frame width: heading, one sentence, one action. Errors with `onRetry` get "Try again"; member denials get "Back to home" (or `action`) plus the optional retry; guests get "Sign in". |
| `EmptyState` | `message?`, `kind?`, `action?` (or `actionLabel` + `onAction`), `className?` | "Nothing here" inside a section: dashed parchment slot, one sentence, one action. Default `kind` copy is sentence case. |
| `FilterBar` | `label` (region name), `count?`, children | One panel surface, full frame width, wraps. Controls and count share one wrapping flow, so the count trails the last control at the end of the bar instead of taking a row of its own; `aria-live="polite"`. |
| `FilterBar.Search` | `label`, `value?` / `defaultValue?` / `onValueChange?`, `placeholder?`, `name?` | Fixed `--filter-search-width`; never resizes while typing. |
| `FilterBar.Group` | `label?`, children | Labelled `role="group"` for chips. Stays one row and scrolls sideways when it outgrows the bar. |
| `FilterBar.Picker` | `label`, `options` (`value`, `label`, `count?`), `value`, `onValueChange`, `disabled?` | Single-choice filter on `Menu`. Use it instead of a native `<select>` for filters; form fields that submit through `FormData` keep native selects. |
| `CardGrid` | `as?: 'div' \| 'ul' \| 'ol' \| 'section'`, `gap?: 3 \| 4 \| 5`, `aria-label?` | `repeat(auto-fill, minmax(min(var(--card-min), 100%), 1fr))`. |
| `Tabs` | `items`, `value?` / `defaultTabId?` / `onValueChange?`, `aria-label?` | Page sections only; one pill skin (active = filled ink). The row scrolls sideways when narrow, fades the clipped edge (`data-overflow`) and keeps the active tab in view. Never restyle it in a feature. |
| `Tabs.Nav` (`TabNav`) | `items: { to, label, current }[]`, `aria-label` | Route-level section links in the same skin; current link gets `aria-current="page"`. |
| `Modal` | `size?: 'sm' \| 'md' \| 'lg' \| 'palette'` | `palette` is a fixed-size command dialog: first content child pinned, the rest scrolls. |

Reading content (entry body, editor body, a single settings form) goes in `<div className="reading-column">` (or `DetailLayout.Reading`) inside the frame. A detail page may have one side rail of `--rail-width` through `DetailLayout`, never a hand-rolled grid.

```tsx
<PageShell context="chronicle" className="hf2">
  <PageHeader
    back={{ to: '/chronicles', label: 'Chronicles' }}
    title={entry.title}
    meta={<>{personName(entry.author)} · {formatDate(entry.publishedAt)}</>}
    actions={canEdit ? <Link className="btn" to={editHref}>Edit entry</Link> : null}
  />
  <DetailLayout rail={<RelatedLinks entry={entry} />} railLabel="Related">
    <DetailLayout.Reading><ContentRenderer body={entry.body} /></DetailLayout.Reading>
  </DetailLayout>
</PageShell>
```

Display helpers (`src/utils/format.ts`): `useDateFormatter()` gives `formatDate` ("7 Mar 2026"), `formatDateTime` ("Sat 7 Mar 2026, 23:30", no zone name unless the viewer chose UTC) and `formatScheduled` ("TBA" when absent) in the viewer's zone. `personName({ displayName, handle })` is the only way to name a member; `handleLabel(handle)` gives "@handle" (null for numeric ids) for profile secondary text; `isMachineId(value)` spots slugs, snowflakes and UUIDs that must not be shown. Status and enum keys go through `statusLabel` / `roleLabel` / `humanizeKey`.

The L5 gate `scripts/design-gates/check-page-layout.mjs` fails on literal widths >= 160px, literal `minmax(<len>` card minimums, `max="wide"` on `PageShell`, and `<aside>`/sidebar markup in `features/*/pages`. Justified exceptions go in `allowlist.json` `pageLayout` with a `reason`; `pageLayoutPendingMigration` lists round-3 call sites still to migrate and may only shrink.

## Key Patterns

### TanStack Query for All Server State

Every piece of data from the API goes through TanStack Query. No manual useState for server data. No useEffect for fetching. TanStack Query handles caching, refetching, loading states, and error states.

```tsx
const { data, isLoading } = useQuery({
  queryKey: ['quest', questCode],
  queryFn: () => graphqlClient.request(QUEST_QUERY, { code: questCode }),
});
```

### graphql-request for API Calls

Use graphql-request with typed queries generated from the shared GraphQL schema. The same schema the bot uses. Regenerate types with the `/codegen` slash command in Claude Code (runs Strawberry codegen + TypeScript codegen).

### Current Pages

Route-level pages live under `app/features/*/pages/` for feature-owned surfaces and `app/pages/` for legacy or cross-feature routes. Prefer adding new feature pages under `app/features/`.

### Functional Components Only

No class components. Use hooks for all state and effects. Extract reusable logic into custom hooks.

## Theming System

The app uses a CSS variable + data-attribute theming architecture. All visual tokens live in `app/styles/tokens.css`. Theme switching works by setting data-\* attributes on `<html>`:

- `data-mode`: `dark` | `light` -- a MODE AXIS, not an override of a dark default; every theme below carries a peer block for both.
- `data-theme`: the 5 ruled themes (theme-matrix-research.md), each with a `data-mode="light"`/`data-mode="dark"` pair -- `parchment` (primitives shipped, epic-a-tokens #451), `midnight`, `ember`, `dracula`, `vegan` (primitives land in epic B, B7). `default`/`atlas` are legacy/pre-Epic-B blocks still in `tokens.css` for backward compatibility (`forge`/`dracula-pixel`/`pencil-and-ink` were purged in Epic C M1), not part of the ruled matrix -- do not add UI that assumes they're permanent.
- Typography is fixed: Fraunces Variable for display/narrative and Geist/Geist Mono for body/UI/code. The retired `data-font` selector, frontend font catalog, and picker were removed in the production component-convergence wave. Historical local `font` and server `bodyFont` values are tolerated but ignored; the backend field remains for compatibility.
- `data-colorblind`: `safe` | `off`

### ThemeContext

All theme state lives in `ThemeContext`. Access it via the `useTheme()` hook:

```tsx
const { prefs, setMode, setTheme, setColorblindSafe } = useTheme();
```

Never read `data-*` attributes directly in components -- use `prefs` from `useTheme()`.

### Font classes

- `font-heading` -- Fraunces Variable (refined-modern; the pixel/Minecraft heading font was purged with the pixel-retroui aesthetic)
- `font-body` -- Geist, applied to `body` automatically. It is fixed and has no user preference axis.

### Style Contexts

4 CSS classes applied on the page root container. They adjust typography tier rendering per page type:

- `ctx-war-room` -- Dense dashboards (/, /map, /search, /dm, /admin)
- `ctx-tavern` -- Card-based browsing (/quests, /characters, /guilds, /regions)
- `ctx-rpg` -- Detail pages with tabs (/quests/:code, /characters/:code, /guilds/:code)
- `ctx-chronicle` -- Timeline/narrative (/timeline, /series/:code, /calendar)

Components never know which context they're in. Add new contexts (e.g., `ctx-premium`) in `app/styles/contexts.css` -- zero React changes required.

## Project Structure

```text
frontend/
app/
    main.tsx          # Entry point
    App.tsx           # Router setup
    api/              # graphql-request client and typed queries
    features/         # Feature-owned pages, components, adapters, types
    pages/            # Legacy or cross-feature route-level components
    components/       # Shared UI components (never imports app/features/**)
    hooks/            # Custom hooks (useQuest, useCharacter, useSearch, etc.)
    utils/            # Formatting, date helpers, etc.
    styles/           # tokens.css, atlas.css, layout.css, typography.css, contexts.css
    context/          # ThemeContext.tsx
  tests/            # symlink -> ../../tests/frontend (the repo-root test tree)
  package.json
  vite.config.ts
  tailwind.config.ts
  Dockerfile
```

## Environment

`VITE_API_URL` must be set to point at the Python API (default in `.env.example`: `http://localhost:8000`). The Vite dev server proxies are not configured -- set this explicitly when running outside Docker.

## Common Commands

```bash
pnpm install    # First-time setup
pnpm run dev    # Start Vite dev server (usually http://localhost:5173)
pnpm build      # Production build to dist/
pnpm lint       # ESLint + all five design gates above
pnpm test       # Run tests
```

## Conventions

- TypeScript strict mode
- No `any` types
- Descriptive component and hook names
- Tests live in the repo-root `tests/` tree, mirroring the source path: a test for `src/frontend/app/<path>/<name>.tsx` lives at `tests/frontend/<path>/<name>.test.tsx` (worked example: `src/frontend/app/features/editor/LiveEditor.tsx` -> `tests/frontend/features/editor/LiveEditor.test.tsx`). `vitest.config.ts` includes `../../tests/frontend/**/*.test.{ts,tsx}` and nothing else; `src/frontend/tests` is a symlink into that same tree, not a second one
- No direct fetch calls -- always go through graphql-request + TanStack Query
- Responsive design against the `--bp-sm`/`--bp-md`/`--bp-lg` breakpoint tokens (`app/styles/tokens.css`, design-language.md section 7) -- the values-only source of truth (CSS can't read custom properties in `@media`, so these are mirrored by hand into `@media` rules and read via `getComputedStyle` for any JS-side `matchMedia` use); not a Tailwind breakpoint prefix
- Generated GraphQL types stay in `app/api/`, `app/hooks/`, and `app/features/*/adapters/`. Do not add new imports from `app/api/generated/` or `app/api/types` to `app/features/*/pages/`, `app/features/*/components/`, or shared `app/components/`.

### No raw errors ever reach the UI (owner-ruled, 2026-07-21, #266)

What: no caught error, mutation rejection, query failure, or render crash may render `error.message`, a stack trace, or a raw GraphQL error to the DOM. Every error surface shows fixed, pre-vetted copy instead.

Why: a raw `ClientError.message` embeds the full GraphQL response body -- for an unhandled backend exception that includes raw SQL or a stack trace. A raw REST `detail` string carries the same risk. Users see noise, not an actionable next step, and backend internals leak.

How: route every caught error through `app/utils/errorCopy.ts`'s `controlledErrorMessage(err, fallback, context)` (app-wide) or `app/features/editor/editorErrors.ts`'s `mapEditorError(err, action, typeKey)` (editor verbs). Both check network failure -> connectivity copy, GraphQL `ClientError` -> the caller's `fallback` (or a mapped `extensions.code`, table currently empty pending backend codes), an explicit opt-in marker (`ControlledError` / `AdapterError`) -> shown verbatim, anything else -> `fallback`. The real error always goes to `console.error` first so debugging never depends on what's safe to show. The root `ErrorBoundary` in `app/App.tsx` follows the same rule for render crashes. `queryClient`'s `QueryCache.onError` in `app/main.tsx` is DEV-console-only logging, never DOM -- that's fine as-is. Never add a new `err.message` / `error.message` interpolation directly into JSX; grep for it before merging any new error-handling code.
