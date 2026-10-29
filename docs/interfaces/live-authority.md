# Interface: Live authority at the boundary

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** `apps/web` (sends JWT only), any machine principal caller

## Rule

The JWT asserts identity only. Roles, permissions, and status are read live from the `members` row (or equivalent authority object) once per request. Clients and tokens are never trusted as authorization sources.

Ownership is an invariant in code; operation declarations name any non-owner authority. [D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) separates document read audience from write ownership. [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md) separates existing surfaces, caller-dependent authorization and caller-independent state validity.

**Player-character exception (2026-09-16):** only the owning player may mutate its aggregate, including progression/logs, verification submission, downtime and D&D Beyond sync. Platform owner, admin, verifier and other staff have no mutation bypass. Admin/verifier assessment decisions remain separately authorized and ledgered; they may change approval/lifecycle state without editing player-authored fields or syncing.

The per-row read-audience family is documents, revisions and links; public quests and characters do not make their linked documents readable. [scoped-body](/docs/interfaces/scoped-body.md) preserves the whole-document gate, per-viewer blocks on every readable document, and author/admin raw-body grants.

**Lifecycle admission:** [D30](/docs/decisions/D30-Deletion-Is-Named-Per-Entity.md) supplies the per-entity deletion/retention matrix. [D31](/docs/decisions/D31-No-Erasure-Anonymize-In-Place.md) keeps member anonymization provisional, unbuilt and owner-confirmed before first execution. A cascade, retirement state or missing delete route is not a replacement for either policy.

## Enforcement

| Mechanism                          | Location                                                         | Status                                                                                |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Verified request Authority         | `apiHandler` → `auth.LiveMiddleware` → Postgres member authority | Implemented; isolated native request tests cover role changes and fail-closed lookups |
| Account identity and role response | `GET /v1/members/me`                                             | Exactly four fields; roles use that same verified Authority                           |

### Remaining enforcement boundaries

- Document audience/admin bypass and protected override logging are implemented in `Specification.Allows`, `ScopeFromAuthority` and `projectBody`; `TestPrivilegedCallbacksAreGatedBeforeDelegation` and `TestAdminBlockOverrideAuditOmitsProtectedBytes` cover those boundaries.
- Character reads exist, but owner-only mutation, sync and staff assessment commands are absent from the current Go character API. Their authorization requirements are **not enforced as implemented operations**.
- Platform-owner fixed-account representation, complete declaration coverage across aggregates, and a common audit distinction for all privileged overrides are **not enforced** by the current provider. Existing quest admin branches are not proof of shared D29 conformance.
- The full lifecycle matrix is **not enforced**. Document reads filter tombstones; quest/character/region soft-delete columns and commands are absent. Current aggregate cascades can remove retained ledgers/revisions on physical deletion.

## Provider

API builds the request Authority from live member data once per request. Missing or inactive members and lookup failures fail closed. Design notes and current login behavior belong under [apps/api/docs/auth-flow.md](/apps/api/docs/auth-flow.md). Current schema/lifecycle behavior and its historical boundary are recorded in [API schema guidance](/apps/api/docs/schema-v2.md#current-go-lifecycle-boundary).

Local native checks use an isolated synthetic Postgres database. They establish the exercised implementation boundary, not production deployment or external-provider effectiveness.

## Consumers

Web and Discord send identity credentials. Web may cache a validated member response for presentation; the API never trusts client role bits or token role fields as authorization authority.

## Related decisions

- [D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md)
- [D18](/docs/decisions/D18-The-Member-Row-Is-The-Session.md)
- [D19](/docs/decisions/D19-Machine-Principals.md)
- [D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)
- [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md)
- [D30](/docs/decisions/D30-Deletion-Is-Named-Per-Entity.md)
- [D31](/docs/decisions/D31-No-Erasure-Anonymize-In-Place.md)
- [D47](/docs/decisions/D47-Guest-Onboarding-And-Player-Promotion.md)
- [D48](/docs/decisions/D48-Former-DMs-Retain-Owned-Quest-Management.md)

## Reopen

Authority is allowed to be carried in the token, or a second gate system is introduced without retiring the first.

The planned product cutover replaces GET /v1/members/me with Query.memberMe under the [GraphQL transport contract](/docs/interfaces/graphql-product-transport.md). Existing HTTP behavior above remains an as-built boundary until the scheduled route removal. Same-request authority/cache invalidation is specified in the [API contract](/apps/api/docs/graphql-contract.md), not inferred from old HTTP test success.
