# PHASE9 report — integration close-out

**Verdict:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Constraint:** File edits only (no git writes).

## Green gates

- `bun run --filter @pi/web typecheck` — pass
- `bun run --filter @pi/web test` — **53 files / 121 tests** pass

## Delivered this pass

### Editor (gap 1)
- `EditorShell` + `LiveEditor` (toolbar markdown helpers, edit/read modes, Cmd/Ctrl+S draft save)
- `editorLoad` adapter: quest / documentById / document(slug) load-for-edit
- `useEditorDraft` localStorage draft persistence
- `EditorRoute` load gate → `EditorWorkspace` publish path for quest/codex/summary/guide/ruling/dm-table

### Admin workspace panels (gap 2)
- `RegionsPanel` (+ createRegion REST)
- `BackstoriesPanel` / `CreationCatalogPanel` in Content tabs with HomeBanner
- `DataHealthPanel` from `adminOperations.activeAlerts`
- DM dashboard embeds DeliveryPanel

### Gallery (gap 3)
- Meaningful demos for button/chip/card/tabs/empty/error/field/modal/type/tokens/motion/effects

### Home banner (gap 4)
- Public `/` reads `loadHomeBanner` into `banner` region when enabled

### Character owner mutations (gap 5)
- `updateCharacterProfile` / `submitForVerification` / `retireCharacter` adapters
- `OwnerActions` when `canEditOwned(me, ownerId)`

### Notifications infinite scroll (gap 6)
- `useInfiniteQuery` + IntersectionObserver sentinel + Load more fallback

### Personalize polish (gap 7)
- Catalog `rarity` / `unlockHint` from payload (`pz-catalog-item`, `pz-unlock-hint`)

### Phase 9 (gap 8)
- Expanded e2e: data-walkthrough, shell-layout, directories, editor-smoke, locked-screens
- Matrices: flipped ported editor/admin/gallery/home/notification hook+component rows toward `done`
- `e2e-port-list.md` updated
- This report

## Remaining gaps

1. Full legacy LiveEditor contenteditable / wikilink autocomplete / PropertiesPanel field schemas — toolbar+textarea shell only
2. Discord sync after quest save; multi-step published-brief editPublishedDocument path
3. Admin region detail editor (rename/kind/archon), TimeAnchor/GameCalendar panels, BulkRoleBar polish
4. Verify stale-submission / DDB URL safety from legacy tabs
5. Character StatusBadge / token header / region resolution; dm-table detail still thin
6. Gallery: toast host demo + remaining ~20 legacy entry files not individually ported
7. E2E: themes, component-contracts, container-safety, character-header-mobile, v03-fidelity still pending
8. Full `scripts/verify` monorepo gate + live seedqa walkthrough not run in this pass
9. Component/hook matrices not 100% `done` (many Layer A/B pending rows remain)
10. Uncommitted (controller forbid git writes)

## Commands

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
```
