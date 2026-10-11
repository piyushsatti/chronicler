# Waves 5–8 report — routes / auth / editors / admin

**Status:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Note:** Uncommitted (no git writes).

## Delivered

### Wave 5 (public)
- Onboarding: Welcome, Settings (theme prefs), ComingSoon for guilds/calendar/schedule/series
- Map: `/map*` → Coming Soon; `/regions/:slug` → RegionHubPage
- Codex typed detail pages for npc/faction/region/location/artifact/event/lore (+ short paths)
- Chronicle SummaryDetailPage; Rules Guide/Ruling detail pages
- Profile stubs: player/DM/dm-table

### Wave 6 (auth/account)
- `intendedPath` + `ProtectedRoute` (safe path stash)
- AuthCallback consumes intended path
- `/me` behind ProtectedRoute; Notifications + Personalize pages wired

### Wave 7 (editors)
- `EditorRoute` + `EditorDemoPage` for all editor manifest paths (protected workspace shell)

### Wave 8 (admin/gallery/dm)
- `AdminWorkspaceShell` + section pages (people/characters/world/content/delivery/data-health)
- DM dashboard page; gallery admin shell with primitive smoke
- Existing AdminPage + VerifyPage retained (tests import them directly)

## Concerns / gaps

- Editor mutations / draft preview not implemented
- Admin panels from legacy standalone pages not embedded yet
- Gallery ~40-file tree not ported
- Verify tabs not yet embedded inside AdminReviewPage shell wrapper
- Cross-feature notification adapter import (notifications → member) may need boundary ADR
