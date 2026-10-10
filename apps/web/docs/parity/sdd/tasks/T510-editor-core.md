# T510-editor-core — Editor shell and route registry

## Goal

Editor shell and route registry (wave W7).

## Allowed globs

See `sdd/ownership.json` → `T510-editor-core.allowed_globs`.

## Depends on

IG2

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T510-editor-core editor-shell-and-route-registry`

## Report

`docs/parity/sdd/reports/T510-editor-core-report.md`
