# T001 — Phase 0 integrator (Wave 0)

## Goal

Exit Phase 0: parity matrices, SDD catalog, route manifest order, feature slice stubs in `featureRegistry`, baseline route drift fixes, smoke tests.

## Legacy reference

- Routes: `.dump/chronicler-old/src/frontend/app/App.tsx`
- Inventory: `app/components/**`, `app/hooks/**`

## Allowed globs

See `sdd/ownership.json` → `T001.allowed_globs`.

## Forbidden

- `apps/web/package.json`, root `scripts/verify`
- Editing the plan file

## Deliverables

All items listed in plan Phase 0 deliverables under `apps/web/docs/parity/`.

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T001 phase 0 parity matrices stubs and route fixes`

## Report

`docs/parity/sdd/reports/T001-report.md`
