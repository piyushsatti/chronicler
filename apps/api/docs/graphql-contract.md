As-built living note. Scrubbed from quarry; prefer durable symbol/schema names over path:line.
Interfaces: see [docs/interfaces/](/docs/interfaces/README.md).

# GraphQL contract


## What this is

The contract is two machine-checked artifacts, not this doc:

1. **SDL** — [`/packages/contracts/schema.graphql`](/packages/contracts/schema.graphql)
2. **Auth registries** — `QUERY_AUTH_REGISTRY` and `MUTATION_AUTH_REGISTRY` in the API package (legacy: ``apps/api`/graphql/auth_modes.py`)

This doc explains auth classes and drift enforcement. For every field, read the SDL and registry comments.

## Query auth (`QUERY_AUTH_REGISTRY`)

| class | what a caller needs |
| --- | --- |
| `PUBLIC` | Nothing. Anon-readable. |
| `AUTHENTICATED` | Logged in, any member. |
| `VIEWER_SCOPED` | Logged in; resolver returns only caller's own data. |
| `ROLE_GATED` | Logged in plus role/permission; fine rule in resolver. |

Legacy distribution at excerpt time: 67 queries — 53 `PUBLIC`, 7 `VIEWER_SCOPED`, 7 `ROLE_GATED`.

## Mutation auth (`MUTATION_AUTH_REGISTRY`)

| mode | what a caller needs |
| --- | --- |
| `MACHINE_INGEST` | Machine secret (unused at excerpt time). |
| `AUTHENTICATED_USER` | Logged-in member; capability checks in service. |
| `STAFF_ADMIN` | Admin gate in service. |

Legacy distribution: 62 mutations — 35 `AUTHENTICATED_USER`, 27 `STAFF_ADMIN`.

## Drift enforcement

Registry tests diff live schema field names against registry keys. After port, colocate tests under `apps/api/tests/`.

---

*Truncated excerpt — see quarry file for field-level gates and full prose.*
