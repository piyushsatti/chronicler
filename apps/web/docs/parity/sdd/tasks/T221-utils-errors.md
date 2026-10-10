# T221-utils-errors — Port errorCopy and lazyWithReload

## Goal

Port errorCopy and lazyWithReload (wave W4).

## Allowed globs

See `sdd/ownership.json` → `T221-utils-errors.allowed_globs`.

## Depends on

T020

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T221-utils-errors port-errorcopy-and-lazywithreload`

## Report

`docs/parity/sdd/reports/T221-utils-errors-report.md`
