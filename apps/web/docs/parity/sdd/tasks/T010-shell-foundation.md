# T010 — Shell foundation (Wave 1, serial)

## Goal

AuthContext, ThemeProvider bridge, AmbientLayer, ScrollManager, RootErrorBoundary, lazyWithReload, SiteChrome + NavDrawer behavioral parity, SearchNavigation, Redux toasts/search/preferences.

## Allowed globs

`ownership.json` → `T010`.

## Forbidden

`features/**`, `styles/**`

## Depends on

T001

## Verify

`bun run --filter @pi/web typecheck` + tests under `tests/chrome/**`, `tests/store/**`.

## Commit

`port(sdd): T010 shell foundation parity`
