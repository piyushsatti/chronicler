# IG2 — Integrator gate after Waves 5–6

## Goal

Integrator gate after Waves 5–6 (wave IG2).

## Allowed globs

See `sdd/ownership.json` → `IG2.allowed_globs`.

## Depends on

T319-feat-search, T413-personalize

## Verify

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```

## Commit

`port(sdd): IG2 integrator-gate-after-waves-5–6`

## Report

`docs/parity/sdd/reports/IG2-report.md`
