# T514-editor-dmtable — DM table editor gate

## Goal

DM table editor gate (wave W7).

## Allowed globs

See `sdd/ownership.json` → `T514-editor-dmtable.allowed_globs`.

## Depends on

T510-editor-core

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T514-editor-dmtable dm-table-editor-gate`

## Report

`docs/parity/sdd/reports/T514-editor-dmtable-report.md`
