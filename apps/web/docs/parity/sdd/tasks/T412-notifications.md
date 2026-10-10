# T412-notifications — Notifications page

## Goal

Notifications page (wave W6).

## Allowed globs

See `sdd/ownership.json` → `T412-notifications.allowed_globs`.

## Depends on

T410-auth-plumbing

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T412-notifications notifications-page`

## Report

`docs/parity/sdd/reports/T412-notifications-report.md`
