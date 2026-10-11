# FIDELITY report — remaining full-frontend port gaps

**Verdict:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Constraint:** File edits only (no git writes).

## Green gates

- `bun run --filter @pi/web typecheck` — pass
- `bun run --filter @pi/web test` — **56 files / 130 tests** pass (+9 vs PHASE9 121)
- `node scripts/design-gates/run-all.mjs` — **13/14** OK (gallery orphan / T619 soft-skips remain)

## Delivered this pass

### 1. Editor fidelity
- `LiveEditor`: wikilink toolbar + `[[` entity suggestions, table/diagram inserts, Enter list continuation, `leRenumberOrderedListRun`
- `PropertiesPanel` + `editorSchemas` / `editorValidation` wired through `EditorShell`
- `editPublishedDocument` (`PATCH /v1/documents/{id}/published`) when brief/document is published
- Discord sync after quest save (`maybeSyncQuestDiscord` / durable-queue skip)
- `editorLoad` exposes `briefPublished` from brief/document status

### 2. Admin world + members
- Region detail editor (name / kind / archon) via `updateRegion`
- `TimeAnchorPanel` + `GameCalendarPanel` (Greyhawk preset) on Admin World tabs
- `BulkRoleBar` + multi-select in `MembersPanel` (mixed-selection wipe guard)

### 3. Verify safety
- `CharacterVerifyTab`: `isSafeDdbUrl`, stale-submission feedback, `expectedSubmissionAt` on decide
- `isSafeUrl` / `isSafeDdbUrl` in `utils/url.ts`

### 4. Character + dm-table
- Full `StatusBadge` (life + quest state atlas)
- Character `phead` token header, verification chip, safe DDB link, region name resolution
- `DmTableDetailPage` resolves host from community hub by slug

### 5. Gallery
- Live toast demo via Redux `useToast` + presentational `Toast` / `ToastHost`
- Extra entries: status-badge, popover, skeleton

### 6. E2E
- Ported/scaffolded: `themes`, `component-contracts`, `container-safety`, `character-header-mobile`, `v03-fidelity/fidelity`
- `e2e-port-list.md` flipped to done for those rows

### 7. Matrices
- Component/hook matrix rows flipped for StatusBadge, Toast, DmTablePanel, admin time/members/batch roles, character owner mutations, editor LiveEditor/PropertiesPanel/discord/editPublished, verify tab

## Remaining concerns

Superseded by `FINAL-GAPS-report.md` (2026-10-10). Snapshot at FIDELITY time:

1. LiveEditor still textarea-based; entityIndex feed not global.
2. PropertiesPanel field controls simplified (addressed in FINAL-GAPS).
3. GameCalendarPanel period-row editor incomplete.
4. Dm-table schedule placeholder (addressed in FINAL-GAPS via questBoard filter).
5. Gallery short of full legacy entry set (expanded in FINAL-GAPS).
6. Full `scripts/verify` + seedqa not run.
7. Uncommitted (controller forbid git writes).

## Commands

```bash
bun run --filter @pi/web typecheck
bun run --filter @pi/web test
node scripts/design-gates/run-all.mjs
```
