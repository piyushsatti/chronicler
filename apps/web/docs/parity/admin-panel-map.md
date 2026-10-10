# Admin panel map (legacy standalone → workspace)

Legacy standalone admin pages are **redirects**; panels mount inside `AdminWorkspaceShell`.

| Legacy page / bookmark | Workspace route | Panel target | Task |
| --- | --- | --- | --- |
| `AdminTodayPage` | `/admin` | Today overview | T611-admin-today |
| `AdminMembersPage` → redirect | `/admin/people` | People / members | T612-admin-people |
| `AdminPeoplePage` | `/admin/people` | People | T612-admin-people |
| `AdminCharactersPage` | `/admin/characters` | Characters directory | T613-admin-characters |
| `AdminReviewPage` + verify tabs | `/admin/review` | Character + DM verify tabs | T617-admin-review |
| `VerifyQueuePage` (not routed in App.tsx) | — | Embed tabs only | T617-admin-review |
| `AdminWorldPage`, regions/world-clock redirects | `/admin/world` | World + regions | T614-admin-world |
| `AdminContentPage`, catalogs/home-banner | `/admin/content` | Content + catalogs | T615-admin-content |
| `AdminDeliveryPage` | `/admin/delivery` | Delivery | T616-admin-delivery |
| `AdminDataHealthPage`, ingestion redirect | `/admin/data-health` | Data health | T618-admin-data-health |
| `/verify` | redirect → `/admin/review` | — | T001 (done) |
