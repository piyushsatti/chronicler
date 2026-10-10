# T512-editor-codex — Codex editor paths

## Goal

Codex editor paths (wave W7).

## Allowed globs

See `sdd/ownership.json` → `T512-editor-codex.allowed_globs`.

## Depends on

T510-editor-core

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T512-editor-codex codex-editor-paths`

## Report

`docs/parity/sdd/reports/T512-editor-codex-report.md`
