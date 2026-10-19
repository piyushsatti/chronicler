# Contract patterns

Locked conventions from [D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md), `field-routing.md`, and the roots SDL header. New fields should pick a row from this menu.

## GraphQL vs REST vs DROP

Locked by [D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) (2026-10-14): **every product query and business command** uses `POST /v1/graphql`. HTTP under `/v1` (and a few machine routes) remains for **non-product** protocols only — authentication, health, Discord ingest/heartbeat, agent Q&A — not parallel product commands.

| Transport   | When                                                                                                     | Where                              |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **GraphQL** | Product reads (field trees) **and** product mutations (commands, mark-read, transitions, …)              | `POST /v1/graphql`                 |
| **REST**    | Retained **protocol** endpoints (auth, ingest, agent); legacy OpenAPI product paths are cutover debt     | Path under `/v1` or machine routes |
| **DROP**    | Alias, deprecated path, or placeholder that always returned empty; retired REST product command wrappers | Not ported                         |

Explicit commands that change state still use GraphQL mutations with [CommandMeta](design.md) + replay receipts (**I2**). Follow-up reads use GraphQL queries (e.g. mark-read mutation, then `myNotifications`). Full legacy map: [field-routing.md](../field-routing.md) (update rows toward **D40** as REST product paths are removed).

## Naming — no `V2` suffixes

Version is not part of the GraphQL or REST name. Field and type names drop the `V2` suffix (`charactersV2` → `characters`, `QuestV2` → `Quest` on the wire name). Legacy `*V2*` identifiers remaining in split SDL are debt to clear toward that rule — do not add new ones.

## Path versioning

Version lives once in the path: `/v1/graphql`, `/v1/quests/...`, and so on. Do not invent `/v2` field names or parallel `V2` types to mean “current API”. Auth and health may sit outside `/v1` as machine routes (see OpenAPI / field-routing “Machine routes”).

## `ID` = public UUID on the wire

GraphQL `ID` and REST `{id}` path/body identifiers are the row’s **`public_id` (UUID)**. Clients never see storage bigint `id`. Resolvers and HTTP handlers map UUID → internal id at the repository boundary (same dual-key rule as [`apps/api/db/docs`](../../../apps/api/db/docs/design.md)).

## When DROP

Mark **DROP** in `field-routing.md` when:

- The old field was only an alias of another (keep one name).
- The behavior is folded into another command (e.g. cancel via `transition` → `cancelled`).
- The field was a stub or always-empty placeholder.

Do not leave DROPped names in the live SDL or OpenAPI.

## Enums as `String`

The split SDL does **not** currently carry an “enums-as-String backlog” comment. Today most closed vocabularies on the wire are GraphQL `String` (aligned with DB `TEXT` + `CHECK`); a small set are GraphQL `enum`s (`UnknownReason`, `MemberSortInput`, `PreviewAudience`, `CharacterReviewStatus`, …). Prefer matching DB vocabulary labels. If you promote a `String` field to `enum`, do it deliberately in SDL + OpenAPI together — do not invent a parallel typed and untyped pair.
