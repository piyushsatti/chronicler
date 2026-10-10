# T410-auth-plumbing — Auth plumbing ProtectedRoute storeIntendedPath

## Goal

Auth plumbing ProtectedRoute storeIntendedPath (wave W6).

## Allowed globs

See `sdd/ownership.json` → `T410-auth-plumbing.allowed_globs`.

## Depends on

T010

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T410-auth-plumbing auth-plumbing-protectedroute-storeintend`

## Report

`docs/parity/sdd/reports/T410-auth-plumbing-report.md`
