# T230-motion-effects — Port motion and AmbientLayer

## Goal

Port motion and AmbientLayer (wave W4).

## Allowed globs

See `sdd/ownership.json` → `T230-motion-effects.allowed_globs`.

## Depends on

T020

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T230-motion-effects port-motion-and-ambientlayer`

## Report

`docs/parity/sdd/reports/T230-motion-effects-report.md`
