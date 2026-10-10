# T611-admin-today — Admin today section

## Goal

Admin today section (wave W8).

## Allowed globs

See `sdd/ownership.json` → `T611-admin-today.allowed_globs`.

## Depends on

T610-admin-shell

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T611-admin-today admin-today-section`

## Report

`docs/parity/sdd/reports/T611-admin-today-report.md`
