# Design mode decision (Phase 0)

## Legacy behavior

- Query flag `?data=design` toggles fixture-driven content via `fixtures/applyDesignMode.ts`.
- Design-mode Vitest suites (`*.designMode.test.tsx`) assert token/layout behavior under fixtures.

## Decision (provisional — execute in Phase 2)

**Port design mode for parity**, with MSW as the default dev path:

1. Reimplement `applyDesignMode` under `apps/web/src/fixtures/` (no dump imports).
2. Gate with the same `?data=design` contract for gallery and walkthrough tooling.
3. Keep production builds ignoring design mode unless explicitly enabled in dev/CI.
4. Port design-gates scripts in Wave 2 (`T020`) with CI ratchet floors documented here.

## Rationale

Gallery and token gates in legacy CI depend on deterministic design fixtures. MSW-only replacement would not cover CSS gate snapshots tied to fixture HTML.

## Verification

- Port or waive each legacy `*.designMode.test.tsx` row in `component-matrix.csv`.
- Phase 9: design walkthrough row in `e2e-port-list.md`.
