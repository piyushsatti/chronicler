# T230 motion and effects implementation report

Date: 2026-10-20. Guest and component browser checks passed. Actual hidden-page behavior and final visual approval remain pending. No commit or deployment was performed.

## Retained presentation

The motion catalog has 24 retained Legacy rows. Row numbers remain stable, with retired hex row 21 absent. Fourteen rows retain their launch flag. The Gallery renders those fourteen cues and the existing `quest-publish-burst` event cue beside static previews. Controls replay cues, switch phases, and work with the keyboard.

The ambient catalog describes the three existing CSS effects. `chrome/AmbientLayer.tsx` remains their single renderer. The cosmetic catalog contains the five existing styled role and selection effects. No equipment, unlock, presence, social, canvas, or fog driver was added. Cosmetic roles affect appearance and grant no permission. Selection has visual priority over role styling.

The pattern is a data-driven registry with one renderer for each kind of presentation. Duration and easing values remain in `styles/motion.css`. TypeScript constants name those tokens. The countup demo uses native browser timing to interpret both CSS tokens. Its frame callback paints the number. Event cues do not replay an existing event on mount, and loaded content keys stagger once with a bounded row delay.

This unit restores presentation metadata and real Gallery demos. It does not add motion to unrelated product workflows.

## Motion suppression

The existing `useMotionCollapse` and `resolveMotionCollapse` remain authoritative for OS and saved preferences. New visibility state enters that rule through its existing force-static option.

Contained ambient and animated cosmetic previews stop outside the viewport. Continuous effects stop while the document is hidden. Fixed page effects occupy the viewport and use document visibility. Unsupported observation leaves contained effects static. Observers and listeners disconnect when their renderer unmounts.

CSS guards now exclude both a collapsed element itself and descendants of a collapsed ancestor. This fixes the case where `AmbientLayer` placed its collapse attribute on the same animated element. Hover transitions use the same guards, and keyboard focus triggers the lift preview.

## Existing checks

`check-motion.mjs` reads the current feature-owned Gallery path. Its exact retained row set is 1 through 25 except 21, and it explicitly rejects the retired hex identity. It still checks fourteen launch identities, fifteen demos, timing bands, declared tokens, stagger limits, event invariants, CSS ownership, and collapse coverage.

`check-effects.mjs` reads the existing renderer in `src/chrome`. Its identity, token, CSS, and collapse checks remain active. No duplicate renderer, dependency, allowlist, waiver, API operation, or backend change was introduced.

The Gallery uses canonical protected-read admission for staff access. Configured owners do not need a stored administrator role. Denial preserves the signed-in session, and unexpected failures expose a retry control.

## Verification

The retained source receipts are in `.local/workspace-setup/frontend-completion-20261020/motion-effects/`.

- The whole-web typecheck passed.
- Targeted ESLint passed.
- The focused Vitest run passed 21 tests, including the existing preference synchronization tests.
- Five native gate regression tests passed. They prove that missing retained rows and demos fail, the retired hex row is rejected even with an unchanged count, and the current renderer remains independent of effect identity.
- The native design suite executed all fifteen gates and passed with no failures or skips.
- All 88 files in the earlier administration receipt still match their frozen hashes.

The commands used were:

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test -- tests/motion tests/effects tests/features/personalize/PreferencesSync.test.tsx
node --test scripts/design-gates/tests/motion-effects-paths.test.mjs
node scripts/design-gates/run-all.mjs
```

The API8 guest browser run used installed Playwright 1.62.1 and Chromium 151.0.7922.34 against the real Vite app. Ten Settings-to-Home checks passed: all three effects rendered their actual CSS animations, local preferences survived navigation and reload, OS and saved motion suppression each stopped the animation, and releasing suppression resumed it. The starfield rendered 60 particles. No authenticated request or mutation was made.

The approved standalone component fixture imports the current styles, providers, Gallery sections, and AmbientLayer. Fourteen computed-style checks passed, including same-element forced collapse, actual viewport exit and re-entry, all three live and static effect pairs, cosmetic density suppression, keyboard focus, and OS suppression on all 44 rendered motion targets. Selection priority, keyboard phase switching, and countup completion also passed. All fifteen motion pairs, three effect pairs, and five cosmetic pairs rendered. Screenshots at 390, 900, and 1920 pixels show the actual components without horizontal overflow. These component checks do not establish authenticated acceptance of the Gallery product route.

The first component run stopped when its evidence locator tried to scroll a continuously transforming effect into a stable position. Its failure receipt is retained. The final run scrolled the existing static stage instead and passed without changing product source or reducing assertions. The final guest and component browser process ended at 2026-10-20T05:16:32.465Z. No page errors, failed requests, bearer requests, response mocks, or mutations occurred.

Native headless tab activation, page freezing, and window minimization all left `document.visibilityState` equal to `visible`. These attempts do not establish hidden-page suppression. Actual hidden-tab behavior and final visual approval remain pending. No synthetic visibility override was counted as browser evidence. No build overwrote the coordinator's preview artifact, and no browser login or live mutation occurred during implementation.

The frozen product manifest is `motion-effects/source.sha256`; the final browser receipts are `motion-effects/browser-acceptance.json` and `motion-effects/browser-probe.json` under the evidence directory. The earlier administration manifest remains unchanged.
