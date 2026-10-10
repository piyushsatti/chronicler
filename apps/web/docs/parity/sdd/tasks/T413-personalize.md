# T413-personalize — Personalize page

## Goal

Personalize page (wave W6).

## Allowed globs

See `sdd/ownership.json` → `T413-personalize.allowed_globs`.

## Depends on

T410-auth-plumbing

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T413-personalize personalize-page`

## Report

`docs/parity/sdd/reports/T413-personalize-report.md`
