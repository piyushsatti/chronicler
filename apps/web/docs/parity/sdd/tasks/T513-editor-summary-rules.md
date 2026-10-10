# T513-editor-summary-rules — Summary guide ruling editors

## Goal

Summary guide ruling editors (wave W7).

## Allowed globs

See `sdd/ownership.json` → `T513-editor-summary-rules.allowed_globs`.

## Depends on

T510-editor-core

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T513-editor-summary-rules summary-guide-ruling-editors`

## Report

`docs/parity/sdd/reports/T513-editor-summary-rules-report.md`
