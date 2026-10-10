# T617-admin-review — Admin review + verify tabs

## Goal

Admin review + verify tabs (wave W8).

## Allowed globs

See `sdd/ownership.json` → `T617-admin-review.allowed_globs`.

## Depends on

T610-admin-shell

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T617-admin-review admin-review-+-verify-tabs`

## Report

`docs/parity/sdd/reports/T617-admin-review-report.md`
