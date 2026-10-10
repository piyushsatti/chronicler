# T211-domain-audience — Port audienceBlocks

## Goal

Port audienceBlocks (wave W4).

## Allowed globs

See `sdd/ownership.json` → `T211-domain-audience.allowed_globs`.

## Depends on

T020

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T211-domain-audience port-audienceblocks`

## Report

`docs/parity/sdd/reports/T211-domain-audience-report.md`
