# IG1 — Integrator gate after Waves 3–4

## Goal

Integrator gate after Waves 3–4 (wave IG1).

## Allowed globs

See `sdd/ownership.json` → `IG1.allowed_globs`.

## Depends on

T122-data, T210-domain-core

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): IG1 integrator-gate-after-waves-3–4`

## Report

`docs/parity/sdd/reports/IG1-report.md`
