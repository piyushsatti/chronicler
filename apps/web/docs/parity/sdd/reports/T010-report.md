# T010 report — Shell foundation

**Status:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Commit:** none (working tree left dirty per controller hard constraint — no git writes)

## Delivered

- **Auth surface:** `context/AuthContext.tsx` re-exports existing `auth/AuthContext` (T410 owns OAuth depth)
- **Theme:** `context/ThemeContext.tsx` + `theme.utils` (`initPrefs`, localStorage, `data-*` attrs); local-only setters
- **Redux:** `toasts` + `search` + `preferences` slices wired in `store.ts`; `useAppStore` hook
- **Shell chrome:** `ScrollManager`, `RootErrorBoundary`, `AmbientLayer` (prefs/`bgEffect`), `NavDrawer`, `SearchNavigation` (Redux bridge), `useMotionCollapse`, `lazyWithReload` → `lazyElement`
- **SiteChrome / App:** skip link → `#main`, `data-motion-collapse` on `<html>`, drawer vs top/bottom link placement via `navPatternFor`, notification bell → `/notifications`, search Redux sync + SearchCommandRoot consume
- **Providers:** `AuthProvider` + `ThemeProvider` wrap

## Verify

```
bun run --filter @pi/web typecheck  # exit 0
bun run --filter @pi/web test       # 44 files / 99 tests pass
```

## Concerns / rulings

- **Ruling:** Auth implementation stays in `auth/` (ownership T410); Wave 1 exposes it via `context/` re-export.
- **Ruling:** `lazyWithReload` / AmbientLayer / motion collapse live under `chrome/` for Wave 1; T221/T230 may relocate fuller ports to `utils/` / `effects/` / `motion/`.
- AmbientLayer is prefs-driven shell only — full EFFECT_CATALOG → T230.
- Theme server pull/push deferred to T413 (personalize).
- Search palette UI still owned by feature `SearchCommandRoot`; chrome keeps Redux slice + SiteChrome hooks in sync.
- NavDrawer CSS tokens/atlas styling → Wave 2 (`styles/**` forbidden here).
