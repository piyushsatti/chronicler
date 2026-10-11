# SDD ledger — plan: full_frontend_one_to_one_port_f8a3c21e.plan.md

| When | Entry |
| --- | --- |
| 2026-10-10 | **T001** started — Phase 0 integrator (matrices, route manifest, feature stubs, route drift fixes). |
| 2026-10-10 | Preflight table filed at `sdd/preflight-conflicts.md`; Wave 1 (`T010`) cleared pending T001 commit. |
| 2026-10-10 | **T001** complete — 90/90 manifest routes registered + ordered; NotFound catch-all; stubs in registry; typecheck/test green (88). See `reports/T001-report.md`. |
| 2026-10-10 | **T001** complete (`a613a79`) — DONE_WITH_CONCERNS; report at `sdd/reports/T001-report.md`. |
| 2026-10-10 | **T010** started — Wave 1 shell parity (contexts, SiteChrome, Redux). |
| 2026-10-10 | **Ruling (T010):** Auth stays in `auth/` (T410); Wave 1 re-exports via `context/AuthContext`. lazyWithReload/AmbientLayer/motion under `chrome/` until T221/T230. |
| 2026-10-10 | **T010** complete (uncommitted — controller forbid git writes) — DONE_WITH_CONCERNS; typecheck + 99 tests green; report at `sdd/reports/T010-report.md`. |
| 2026-10-10 | **T010** complete (uncommitted) — ThemeProvider, prefs/search slices, ScrollManager, RootErrorBoundary, AmbientLayer, NavDrawer, lazyWithReload, skip+#main. Tests 93 green. See `reports/T010-report.md`. |
| 2026-10-10 | **T020** started — Wave 2 tokens/atlas/gates. |
| 2026-10-10 | **T020** complete (uncommitted) — full style layer port + @media strip + public 404 assets. See `reports/T020-report.md`. |
| 2026-10-10 | **W3/W4** started — primitives + domain scaffolds. |
| 2026-10-10 | **T020** re-run (uncommitted) — fixed tokens.css `:root`/breakpoints/density corruption; restored preference media; wired atlas-vendor in `index.css`; copied `public/{maps,regions,guilds}`; ported full design-gate suite (14/14, soft-skips for T230/T619); tokens smoke test. DONE_WITH_CONCERNS. See `reports/T020-report.md`. |
| 2026-10-10 | **W3/W4** complete (uncommitted) — scaffolds + Button/Card/Modal/Chip/Tabs/Empty/Error + utils/motion/effects. See `reports/W3-W4-report.md`. |
| 2026-10-10 | **W5–W8** complete (uncommitted) — public pages, ProtectedRoute/intendedPath, EditorRoute, AdminWorkspaceShell, gallery/dm. See `reports/W5-W8-report.md`. |
| 2026-10-10 | **T900** scaffolding complete (uncommitted) — data-walkthrough e2e stub; typecheck + 104 tests green. See `reports/T900-report.md`. |
| 2026-10-10 | **Controller final** — DONE_WITH_CONCERNS. See `reports/CONTROLLER-final.md`. |
| 2026-10-10 | **Deep port** — closed major W5–W8 gaps: notifications mark-read + NotificationRow; personalize catalog/equip/settings; editor REST mutations + workspace; AdminReview tabs + Members/HomeBanner/Characters/Delivery panels; character detail tabs; community/profile pages; gallery entry registry. typecheck + **116** tests green. See `reports/DEEP-PORT-report.md`. |
| 2026-10-10 | **Gap close + PHASE9** — EditorShell/LiveEditor + load-for-edit; admin Regions/Backstories/CreationCatalog/DataHealth panels; gallery demos; home banner on `/`; character owner mutations; notifications infinite scroll; personalize rarity/unlock hints; e2e walkthrough+shell/directories/editor/locked; matrices/e2e-port-list updated. typecheck + **121** tests green. See `reports/PHASE9-report.md`. |
| 2026-10-10 | **FIDELITY** — LiveEditor wikilinks/list-cont; PropertiesPanel schemas; editPublishedDocument + quest Discord sync; region detail / TimeAnchor / GameCalendar / BulkRoleBar; verify DDB+stale; StatusBadge+character phead+region; dm-table host resolve; gallery toast; e2e themes/contracts/container/character-header/v03; matrices updated. typecheck + **130** tests; design-gates 13/14. See `reports/FIDELITY-report.md`. |
| 2026-10-10 | **FINAL-GAPS** — LiveEditor Tab/quote/wiki-kb/gutter; FieldControls+PropertiesPanel; DateTimePicker/Popover; dm-table document+questBoard schedule; gallery ~32 entries; matrices/wire updated. typecheck + **135** tests; design-gates 13/14; `scripts/verify` blocked on monorepo lint:js. See `reports/FINAL-GAPS-report.md`. |
| 2026-10-10 | **WRAP** — LiveEditor blocks variant; entityIndex + search feed; genre-options REST; A4 boundary structural fix (14/14); primitive APIs for gallery; matrices updated. typecheck + **139** tests; lint 14/14; seedqa/`scripts/verify` accepted residual. See `reports/WRAP-report.md`. |
