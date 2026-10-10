# T220-utils-permissions — Port permissions utils

## Goal

Port permissions utils (wave W4).

## Allowed globs

See `sdd/ownership.json` → `T220-utils-permissions.allowed_globs`.

## Depends on

T020

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T220-utils-permissions port-permissions-utils`

## Report

`docs/parity/sdd/reports/T220-utils-permissions-report.md`
