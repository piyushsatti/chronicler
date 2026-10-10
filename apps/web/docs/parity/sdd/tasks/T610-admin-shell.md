# T610-admin-shell — AdminWorkspaceShell

## Goal

AdminWorkspaceShell (wave W8).

## Allowed globs

See `sdd/ownership.json` → `T610-admin-shell.allowed_globs`.

## Depends on

IG2

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T610-admin-shell adminworkspaceshell`

## Report

`docs/parity/sdd/reports/T610-admin-shell-report.md`
