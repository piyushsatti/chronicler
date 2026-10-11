# Deep port report — close controller gaps

**Verdict:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Constraint:** File edits only (no git writes). Did not touch `src/styles/**` (T020).

## Green gates

- `bun run --filter @pi/web typecheck` — pass
- `bun run --filter @pi/web test` — **52 files / 116 tests** pass (+12 vs controller’s 104)

## Delivered (real parity, not stubs)

### Notifications
- `markNotificationsRead` via REST `POST /v1/me/notifications/read` (field-routing)
- Page: auto mark-read + unread invalidation (legacy L13), retry UI, `NotificationRow` with subject links
- Adapter returns paging shape (`items` / `hasMore` / `nextBefore`); infinite-scroll UI still deferred

### Personalize
- `personalizationAdapter`: reconcile → GQL `myPersonalization` → equip/settings REST
- Page tabs: Look (theme/mode/effect + settings PATCH) and Catalog (owned/equip)

### Editor mutations
- `editorMutations` adapter: create/update quest, create/update/publish document, preview-body
- `EditorWorkspace` form + Publish/Preview wired through adapters (all editor routes)

### Admin + verify
- `AdminReviewPage` in workspace shell with lazy Character / DM Profile verify tabs + decide REST mutations
- Panels embedded: `MembersPanel` (roles PUT), `HomeBannerPanel`, `CharacterDirectoryPanel`, `DeliveryPanel`
- `/admin` Today uses workspace shell + delivery/character panels

### Character / community / quest / home / gallery
- Character detail tabs: Progression, Quest history, Connections, Summaries (REST tab adapters)
- Community hub tabs (Muster / DMs / Players); profile pages resolve directory by handle
- Quest detail Roster/Details tabs; home heading shows site stats member count
- Gallery entry registry + sectioned tree (smoke demos for button/chip/card)

### Tests ported/added
- `editorMutations.test.ts`, `personalizationAdapter.test.ts`, `characterTabsAdapter.test.ts`, `NotificationRow.test.tsx`
- Admin/Verify tests updated for workspace/tab structure

## Remaining gaps (concrete)

1. **Editor chrome** — no full legacy EditorShell/LiveEditor/PropertiesPanel/field schemas; no load-for-edit of existing quest/document into the form; Discord sync after quest save not ported
2. **Notifications** — infinite `fetchNextPage` / `hasNextPage` UI not wired (cursor fields present)
3. **Personalize** — full pz-* rarity/unlock-hint UI, ThemeSwatch, celebration overlays not ported
4. **Admin** — World (regions/clock), Content catalogs (backstories/creation), Data-health/ingestion, BulkRoleBar, MemberRoleEditor polish, DM dashboard ops still thin
5. **Verify** — decide mutations omit full stale-submission handling / DDB URL safety from legacy tabs
6. **Character** — owner edit/submit/retire, StatusBadge/token header, region resolution not ported
7. **Profiles** — dm-table detail still placeholder; no dedicated member-profile GQL beyond community directory
8. **Gallery** — registry exists; most of ~40 entry demos still empty shells
9. **Home** — home banner read on public home not wired (admin editor only)
10. **E2E / matrices** — remaining Playwright specs + CSV stub→done flips still Phase 9
11. **Git** — still uncommitted per controller constraint

## Files of note

| Area | Paths |
| --- | --- |
| Notifications | `features/notifications/**`, `member/adapters/notificationsAdapter.ts` |
| Personalize | `features/personalize/**` |
| Editor | `features/editor/{EditorRoute,EditorWorkspace,adapters/editorMutations}.ts(x)` |
| Admin/verify | `features/admin/{pages,components,adapters}/**`, `features/verify/components/**` |
| Character tabs | `features/character/{pages/CharacterPage,adapters/characterTabsAdapter}.ts(x)` |
| Community/profile | `features/community/pages/CommunityPage.tsx`, `features/profile/pages/ProfilePages.tsx` |
| Gallery | `features/gallery/{entries,pages}/**` |
