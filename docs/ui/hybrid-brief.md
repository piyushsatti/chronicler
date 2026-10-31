# Hybrid brief: site chrome + wireframe page structure

Owner direction (25 Oct 2026): do not copy the wireframe literally. Keep what the
site already does well; take page organization and specific ideas from the wireframe.

## Keep from the site (do not restyle)

- Top toolbar in `chrome/SiteChrome.tsx`: segmented nav group, search, login.
- Page top: `PageHeader` (title, lede, chip meta row).
- Theme, tokens, fonts (`styles/tokens.css`), both light and dark.
- Rich domain components: `QuestCard`, `Sched`, `Chip`, `Card`, `Avatar`, `Button`.
- `PageToolbar` on the quest board (status segments, quick dates, search, count).

## Take from the wireframe (see figma-specs.md)

- How content is organized on each page: section order, tabs, side cards, button groups.
- A Filter button on the quest board for things the toolbar cannot express (DM, specific date).
- Spacing guidance only where the site has none: section gap 28, card grid gap 16.

## Rules for authors

- Edit only the files your task names. Shared primitives in `components/` are off limits;
  if one needs a change, stop and report it instead.
- Reuse existing hooks, GraphQL documents and adapters. Do not change the API or schema.
  If data is missing, render what exists and list the gap in your report.
- Match the surrounding code style (CSS modules, `data-el` attributes, `type-*` classes).
- No commits.
- Run `bunx tsc --noEmit -p apps/web` (or the web package's typecheck script) and the
  tests for the files you touched; report exact results.
