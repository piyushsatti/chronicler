# T001 report — Phase 0 integrator

**Status:** DONE  
**Date:** 2026-10-10

## Delivered

- Parity matrices: `component-matrix.csv`, `hook-matrix.csv`
- Route manifest: `routes.manifest.ts` / `.md` + `src/routes/routeManifest.ts` (90 paths, order matches legacy `App.tsx`)
- Wire maps: `wire-by-page.md`, `wire-by-page-backend.md`
- `qa-route-registry.json`, `e2e-port-list.md`, `admin-panel-map.md`, `design-mode-decision.md`, `imposition/index.md`, `apps/web-route-fixes.md`
- SDD: `ownership.json` (41 tasks), `tasks/*`, `preflight-conflicts.md`, `progress.md`
- Feature stubs wired in `featureRegistry.ts` (editor, errors, gallery, notifications, onboarding, personalize, profile + existing slices)
- Route drift fixes: no `/codex/:slug`, `/rules/:slug`, `/chronicles/:slug`, `/documents/:slug`; `/verify` → `/admin/review`; `*` → `NotFoundPage`
- Route order test: `tests/routes/order.test.ts`

## Verify

```
bun run --filter @pi/web typecheck  # exit 0
bun run --filter @pi/web test       # 38 files / 88 tests pass
```

## Concerns

- Matrices mark most rows `todo` / `stub` — expected until later waves.
- Wave 4/6/7/8/9 task briefs are scaffolding-complete; panel-level admin section tasks (T612–T616, T618) batched under T611/T617 for controller throughput.
