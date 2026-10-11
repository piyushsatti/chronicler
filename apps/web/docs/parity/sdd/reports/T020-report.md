# T020 report — Tokens / atlas / gates

**Status:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Commit:** none (working tree left dirty per controller hard constraint — no git writes)

## Delivered

- **Styles:** Full legacy layer set under `src/styles/` (tokens, typography, themes.manifest, contexts, layout, shell, motion, effects, cosmetic, editor, atlas*, atlas-vendor, primitives + registry) wired via `styles/index.css` (includes atlas-vendor globally so feature pages need not import CSS).
- **Imposition doctrine:** Viewport width/height `@media` stripped; preference media restored (`prefers-reduced-motion`, `pointer: coarse`, `hover: none`).
- **tokens.css repair:** Prior strip left `:root` unclosed and dropped `--bp-*` + `[data-density="compact"]` — restored.
- **Public assets:** `404.gif`, `404-poster.png`, `avatar-fallback.jpg`, plus `public/{maps,regions,guilds}/` (spike-map skipped — large legacy spike).
- **Design gates:** Root `scripts/design-gates/` now runs legacy 13 + `check-responsive` (14/14 green). Ported layout/duplication/orphan/theme-schema/contrast/gallery/state-trio/motion/effects/cosmetic + fuller tokens scrape + `lib/css-blocks.mjs`. Soft-skip until later waves: gallery/orphan (T619), motion/effects/cosmetic (T230).
- **Smoke test:** `tests/styles/tokens.smoke.test.ts` (breakpoints, density, brace balance).

## Verify

```
bun run --filter @pi/web typecheck  # exit 0
bun run --filter @pi/web test       # 48 files / 107 tests pass
node scripts/design-gates/run-all.mjs  # 14/14 passed
```

## Concerns / rulings

- Soft-skips keep CI green before gallery/motion/effects trees exist; those gates re-arm automatically when files land.
- Allowlist ratchet: `boundary` (notifications→member, T412), `duplication` (Field + StubNotice dual scaffolds, T110/T121).
- Page-level CSS modules (`WelcomePage.css`, etc.) remain feature-owned later waves — not in T020 globs.
- `spike-map/` public tree not copied (~7.4M); add if spike route returns.
