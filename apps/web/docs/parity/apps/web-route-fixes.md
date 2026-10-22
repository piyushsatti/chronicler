# apps/web route fixes (Phase 0 baseline)

| Issue                  | Before                        | After (T001)                                        | Status                                          |
| ---------------------- | ----------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Codex catch-all        | `/codex/:slug`                | Removed; typed codex paths only (stubs)             | superseded by 2026-10-19 (Toronto) ruling below |
| Rules detail           | `/rules/:slug`                | `/rules/guides/:id`, `/rules/rulings/:id`           | done                                            |
| Chronicle detail param | `/chronicles/:slug`           | `/chronicles/:id`                                   | done                                            |
| Documents route        | `/documents/:slug`            | Removed from router (adapters remain)               | done                                            |
| Verify queue page      | `/verify` rendered VerifyPage | Redirect → `/admin/review` only                     | done                                            |
| 404 handling           | `*` → `/`                     | `NotFoundPage` catch-all                            | done                                            |
| Route order            | Feature slice order           | `routeManifest` sort + `tests/routes/order.test.ts` | done                                            |

## Follow-ups (later waves)

- Replace placeholder routes with real pages (Wave 5–8).
- Hybrid Search is authorized by the 2026-10-20 complete frontend plan. Search and the command palette use current canonical reader destinations, including `/codex/:slug`; `/documents/:slug` is not a reader route. Current acceptance remains recorded in the QA route registry.
- ProtectedRoute / AdminWorkspaceRoute gates (T410, T610).

## Codex owner ruling — 2026-10-19 (Toronto)

`/codex/:slug` is the canonical resource URL. Typed slug routes redirect there; typed UUID routes first resolve existing `documentById(id)` metadata and require `codex_entry`. All successful aliases use the same `codexEntry(slug)` reader and its actual backlink count. This replaces the Codex-only Phase 0 restriction without restoring `/documents/:slug` or changing other route contracts.

Editor routes remain before the aliases in the manifest. Full-registry route tests cover both ordinary static routes and the equal-specificity `/codex/npc/new` and `/codex/artifact/new` cases.
