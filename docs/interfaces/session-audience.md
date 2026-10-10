# Interface: Session and audience predicate

**Status:** accepted  
**Provider:** `apps/api`  
**Consumers:** all GraphQL/HTTP request paths that read audience-scoped data

## Rule

One database session per request. The audience (visibility) predicate is bound to that session so no query can forget it. Sibling work on the same request serializes on that session.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Session-scoped listener / gate | API ORM session setup | **not enforced** |

## Provider

API session factory and audience binding. Local design: `apps/api/docs/`.

## Consumers

No consumer reimplements audience rules in SQL or client code.

## Related decisions

- [D12](/docs/decisions/D12-Scope-Predicate-At-The-Session.md)
- [D27](/docs/decisions/D27-One-Session-Per-Request.md)
- [D28](/docs/decisions/D28-One-Predicate-Over-Policy.md)

## Reopen

A second session or a query path that bypasses the session-bound predicate is accepted in writing.
