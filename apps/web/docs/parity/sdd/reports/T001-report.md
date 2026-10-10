# T001 report — Phase 0 integrator

## Status

**DONE_WITH_CONCERNS**

## Commit

`a613a79cbd3548b921b555d6b84078e87cf00eaf` — `port(sdd): T001 phase 0 parity matrices stubs and route fixes`

## Summary

Phase 0 parity workspace is in place: route manifest (89 paths), component/hook matrices (81 / 92 rows), SDD ownership + Wave 1–3 and Wave 5 task stubs, preflight rulings, and integrator route wiring. Legacy route drift is corrected (`/codex/:slug`, `/rules/:slug`, `/chronicles/:slug`, `/documents/:slug` removed from router; `/verify` redirect; `NotFoundPage` catch-all). Nineteen feature slices are registered in `featureRegistry.ts` with manifest-ordered routes and placeholder pages for not-yet-ported screens.

## Verification

```text
bun run --filter @pi/web typecheck  → exit 0
bun run --filter @pi/web test       → 38 files, 88 tests passed (includes tests/routes/order.test.ts)
```

## Deliverables checklist

| Item | Path | Notes |
| --- | --- | --- |
| SDD ledger | `sdd/progress.md` | T001 logged |
| Route manifest | `routes.manifest.md`, `src/routes/routeManifest.ts` | Ordered parity with legacy `App.tsx` |
| Matrices | `component-matrix.csv`, `hook-matrix.csv` | All rows `pending` |
| Wire maps | `wire-by-page.md`, `wire-by-page-backend.md` | Skeleton |
| QA registry | `qa-route-registry.json` | 20 paths from `qa.jsonl` slugs/codes |
| E2E list | `e2e-port-list.md` | 11 legacy specs mapped |
| Imposition index | `imposition/index.md` | Skeleton |
| Admin map | `admin-panel-map.md` | Workspace panel targets |
| Design mode | `design-mode-decision.md` | Provisional port decision |
| Route fixes log | `apps/web-route-fixes.md` | Baseline drift marked done |
| Ownership | `sdd/ownership.json` | T001, T010, T020, T110–T122, T310–T319 |
| Task briefs | `sdd/tasks/*.md` | T001 + Wave 1–3 + Wave 5 |
| Preflight | `sdd/preflight-conflicts.md` | Wave 1 cleared |
| Code | `featureRegistry`, stubs, `routes.tsx`, order test | See commit |

## Concerns

1. **Placeholder routes** — Most legacy paths render `PlaceholderPage` until Wave 5–8 tasks; walkthrough `expectText` in `qa-route-registry.json` may not match MSW copy yet.
2. **Deep links** — Search and `DocumentCard` still emit `/documents/:slug` (T319/T314 follow-up).
3. **Repo staging** — Commit includes first-time `apps/web/src/features/**` and parity docs; other `apps/web` scaffolding (Vite config, chrome, remaining tests) remains untracked outside this commit.
4. **Protected routes** — Legacy `ProtectedRoute` / admin gates not ported (T410/T610).

## Next controller action

Dispatch **T010** (Wave 1 serial) after confirming branch/worktree; read `sdd/preflight-conflicts.md`.
