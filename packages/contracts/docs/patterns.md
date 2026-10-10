# Contract patterns

Locked conventions from [D40](../../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md), `field-routing.md`, and the roots SDL header. New fields should pick a row from this menu.

## GraphQL vs REST vs DROP

| Transport | When | Where |
| --- | --- | --- |
| **GraphQL** | Screen selects a tree of related fields in one round trip (list or detail with nested children) | `POST /v1/graphql` |
| **REST** | Command (old mutation); pure lookup with fixed response; static config / fixed aggregate; read-that-writes (become an explicit command, then optionally a query) | Path under `/v1` |
| **DROP** | Alias, deprecated path, or placeholder that always returned empty | Not ported |

Reads that write split into a command plus a follow-up read (e.g. acknowledge notifications, then `myNotifications`). Full map: [field-routing.md](../field-routing.md).

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
