# T210-domain-core — Port domain components (except audienceBlocks)

## Goal

Port domain components (except audienceBlocks) (wave W4).

## Allowed globs

See `sdd/ownership.json` → `T210-domain-core.allowed_globs`.

## Depends on

T020

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): T210-domain-core port-domain-components-(except-audienceb`

## Report

`docs/parity/sdd/reports/T210-domain-core-report.md`
