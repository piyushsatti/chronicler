# API-local decisions

Short ADRs that apply only inside `apps/api`. Boundary decisions: [docs/decisions/](/docs/decisions/README.md).

| Record | One line |
| --- | --- |
| [D2](/apps/api/docs/decisions/D2-Multi-Quest-Summary-Identity.md) | Summary identity is nullable documentId |
| [D5](/apps/api/docs/decisions/D5-DM-Table-Empty-State-And-Uniqueness.md) | Missing DM table is null; one per member |
| [D6](/apps/api/docs/decisions/D6-Hex-Location-Link-Canon.md) | hex_entry_links is the sole hex↔doc link |
| [D7](/apps/api/docs/decisions/D7-Location-Gate-And-Fog-Cleanup.md) | Map is stateless; fog is audience |
| [D8](/apps/api/docs/decisions/D8-Member-Metrics-Scope.md) | Metrics scope for member counts |
| [D9](/apps/api/docs/decisions/D9-Tag-Normalization.md) | Tags fold-match at write |
| [D16](/apps/api/docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md) | Ledger mixin shape |
| [D17](/apps/api/docs/decisions/D17-Lowest-Layer-Not-A-Utils-Package.md) | No utils package |
| [D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md) | Expected failures are values |
| [D26](/apps/api/docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) | Ten aggregate roots |
| [D32](/apps/api/docs/decisions/D32-One-Codex-Lifecycle-Category-Gated.md) | One Codex lifecycle, category-gated |
| [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) | GraphQL for trees; REST for commands and fixed shapes |
| [D41](/apps/api/docs/decisions/D41-Go-API-Token-Claims.md) | JWT claims and anonymous-on-bad-token |
| [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md) | Worker binary, goose migrations, agent boundary |
| [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md) | Agent worker claims jobs over HTTP |
| [D44](/apps/api/docs/decisions/D44-Leased-Work-With-Fencing.md) | Leased work queue, fencing and bounded question journey |
