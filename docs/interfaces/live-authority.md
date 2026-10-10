# Interface: Live authority at the boundary

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** `apps/web` (sends JWT only), any machine principal caller

## Rule

The JWT asserts identity only. Roles, permissions, and status are read live from the `members` row (or equivalent authority object) once per request. Clients and tokens are never trusted as authorization sources.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Named gate / Authority construction | API auth path | **not enforced** |

## Provider

API builds the request Authority from live member data. Design notes belong under `apps/api/docs/`.

## Consumers

Web and Discord send identity credentials only; they do not cache role bits as authority.

## Related decisions

- [D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md)
- [D18](/docs/decisions/D18-The-Member-Row-Is-The-Session.md)
- [D19](/docs/decisions/D19-Machine-Principals.md)

## Reopen

Authority is allowed to be carried in the token, or a second gate system is introduced without retiring the first.
