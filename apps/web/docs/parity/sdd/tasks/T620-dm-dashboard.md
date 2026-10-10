# T620-dm-dashboard — DM dashboard

## Goal

DM dashboard (wave W8).

## Allowed globs

See `sdd/ownership.json` → `T620-dm-dashboard.allowed_globs`.

## Depends on

T610-admin-shell

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T620-dm-dashboard dm-dashboard`

## Report

`docs/parity/sdd/reports/T620-dm-dashboard-report.md`
