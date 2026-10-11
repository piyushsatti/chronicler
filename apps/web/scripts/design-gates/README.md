# Design gates (Wave 2 / T020)

CI entrypoint: `apps/web` `lint` → `node ../../scripts/design-gates/run-all.mjs`.

Root suite (`chronicler/scripts/design-gates/`) now mirrors the legacy 13 gates
plus monorepo `check-responsive` (viewport `@media` ban):

| Gate | Script | Soft-skip until |
| --- | --- | --- |
| A4 boundary | `check-boundary.mjs` | — |
| A5 tokens | `check-tokens.mjs` (legacy scrape) | — |
| A8 layout | `check-layout.mjs` | — |
| A6 duplication | `check-duplication.mjs` | — |
| A6 orphan | `check-orphan.mjs` | T619 gallery |
| A6 theme-schema | `check-theme-schema.mjs` | — |
| B7 contrast | `check-contrast.mjs` | — |
| A7 ratchet | `check-ratchet.mjs` | — |
| B6 gallery | `check-gallery.mjs` | T619 gallery |
| C4 state-trio | `check-state-trio.mjs` | — |
| B10 motion | `check-motion.mjs` | T230 motion catalog |
| B8 effects | `check-effects.mjs` | T230 EFFECT_CATALOG |
| B9 cosmetic | `check-cosmetic.mjs` | T230 cosmeticEffects |
| I1 responsive | `check-responsive.mjs` | — |

Allowlist + ratchet floors live next to the scripts. Soft-skips exit 0 with a
`SKIP` line so Wave 2 CI stays green while later waves land required trees.
