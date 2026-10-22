# Design gates (Wave 2 / T020)

CI entrypoint: `apps/web` `lint` → `node ../../scripts/design-gates/run-all.mjs`.

Root suite (`chronicler/scripts/design-gates/`) now mirrors the legacy 13 gates
plus monorepo `check-responsive` (viewport `@media` ban), `check-class-coverage`
(every class hook a primitive/foundation component emits has a CSS rule) and
`check-custom-properties` (every `var(--name)` resolves to a defined custom property):

| Gate | Script | Soft-skip until |
| --- | --- | --- |
| A4 boundary | `check-boundary.mjs` | — |
| A5 tokens | `check-tokens.mjs` (legacy scrape) | — |
| A8 layout | `check-layout.mjs` | — |
| A9 class-coverage | `check-class-coverage.mjs` | — |
| A10 custom-properties | `check-custom-properties.mjs` | — |
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

Allowlist + ratchet floors live next to the scripts. A9 statically scans
`src/components/{primitives,foundation}/*.tsx` `className` emissions (literals,
`cx(...)`, `[...].join(' ')`, ternaries, local consts, literal-union template
spans; unresolved spans become prefixes) against the `src/styles/index.css`
`@import` closure plus component-local CSS, and flags `data-*` values a
class's `[data-x='v']` rules never select. Its `classCoverage` allowlist
entries key on `file`/`rule`/`class` and must carry a `reason`; stale entries
are reported for removal. A10 scans every `var(--name` in `src/**/*.css` and in
string/template literals of `src/**/*.{ts,tsx}` (comments, `*.gen.ts` and tests
excluded) against the union of `--name:`/`@property` declarations in `src`
CSS, `@pi/react-imposition/styles.css` (resolved via node from `apps/web`) and
runtime writes (`'--name'` style-object keys, `setProperty`, `--name:` text);
template spans in a name make its static head a prefix. A reference with no
fallback that nothing defines fails; one with a `var(--x, …)` fallback renders
deterministically and is printed as a warning. Its `customProperties` allowlist
entries key on `file`/`rule`/`name` with a `reason`. Gate tests: `node --test scripts/design-gates/tests/*.test.mjs`
from the repository root. Soft-skips exit 0 with a
`SKIP` line so Wave 2 CI stays green while later waves land required trees.
