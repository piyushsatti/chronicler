# apps/web route fixes (Phase 0 baseline)

| Issue | Before | After (T001) | Status |
| --- | --- | --- | --- |
| Codex catch-all | `/codex/:slug` | Removed; typed codex paths only (stubs) | done |
| Rules detail | `/rules/:slug` | `/rules/guides/:id`, `/rules/rulings/:id` | done |
| Chronicle detail param | `/chronicles/:slug` | `/chronicles/:id` | done |
| Documents route | `/documents/:slug` | Removed from router (adapters remain) | done |
| Verify queue page | `/verify` rendered VerifyPage | Redirect → `/admin/review` only | done |
| 404 handling | `*` → `/` | `NotFoundPage` catch-all | done |
| Route order | Feature slice order | `routeManifest` sort + `tests/routes/order.test.ts` | done |

## Follow-ups (later waves)

- Replace placeholder routes with real pages (Wave 5–8).
- Update search hit links off `/documents/:slug` to typed codex/quest paths (T319 + T314).
- ProtectedRoute / AdminWorkspaceRoute gates (T410, T610).
