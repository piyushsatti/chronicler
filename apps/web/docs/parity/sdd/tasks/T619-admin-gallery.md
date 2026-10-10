# T619-admin-gallery — Gallery design QA

## Goal

Gallery design QA (wave W8).

## Allowed globs

See `sdd/ownership.json` → `T619-admin-gallery.allowed_globs`.

## Depends on

T610-admin-shell

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T619-admin-gallery gallery-design-qa`

## Report

`docs/parity/sdd/reports/T619-admin-gallery-report.md`
