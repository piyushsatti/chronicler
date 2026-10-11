# E2E port list (legacy → apps/web)

| Legacy spec | New path | Status | Owner |
| --- | --- | --- | --- |
| `tests/e2e/data-walkthrough.spec.ts` | `tests/e2e/data-walkthrough.spec.ts` | done (registry-driven walk of first 8 routes) | T900 / PHASE9 |
| `tests/e2e/themes.spec.ts` | `tests/e2e/themes.spec.ts` | done (theme×mode×viewport + font smoke) | FIDELITY |
| `tests/e2e/shell-layout.spec.ts` | `tests/e2e/shell-layout.spec.ts` | done | T010 + PHASE9 |
| `tests/e2e/directories.spec.ts` | `tests/e2e/directories.spec.ts` | done | Wave 5 + PHASE9 |
| `tests/e2e/editor-smoke.spec.ts` | `tests/e2e/editor-smoke.spec.ts` | done | T510 + PHASE9 |
| `tests/e2e/locked-screens.spec.ts` | `tests/e2e/locked-screens.spec.ts` | done | T410 + PHASE9 |
| `tests/e2e/component-contracts.spec.ts` | `tests/e2e/component-contracts.spec.ts` | done (gallery modal/toast contracts; soft-skip if labels missing) | FIDELITY |
| `tests/e2e/container-safety.spec.ts` | `tests/e2e/container-safety.spec.ts` | done (geometry harness, no app server) | FIDELITY |
| `tests/e2e/character-header-mobile.spec.ts` | `tests/e2e/character-header-mobile.spec.ts` | done (static phead overlap check) | FIDELITY |
| `tests/e2e/screenshot-vercel.spec.ts` | `tests/e2e/screenshot-vercel.spec.ts` | optional | T900 |
| `tests/e2e/v03-fidelity/fidelity.spec.ts` | `tests/e2e/v03-fidelity/fidelity.spec.ts` | done (scaffold: home/quests/gallery landmarks) | FIDELITY |

Use `qa-route-registry.json` for walkthrough paths (no legacy `Q-201`-style codes).
