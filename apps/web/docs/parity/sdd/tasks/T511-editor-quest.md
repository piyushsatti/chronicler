# T511-editor-quest — Quest editor new/edit

## Goal

Quest editor new/edit (wave W7).

## Allowed globs

See `sdd/ownership.json` → `T511-editor-quest.allowed_globs`.

## Depends on

T510-editor-core

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T511-editor-quest quest-editor-new/edit`

## Report

`docs/parity/sdd/reports/T511-editor-quest-report.md`
