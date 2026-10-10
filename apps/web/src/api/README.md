# Web API clients

| File           | Purpose                                    |
| -------------- | ------------------------------------------ |
| `endpoints.ts` | Path constants for `/v1` and auth          |
| `graphql.ts`   | `POST /v1/graphql` (errors[] always fails) |
| `rest.ts`      | Typed REST helpers                         |
| `queryKeys.ts` | TanStack Query key factory                 |

Slice order: site → member → document → spatial → character → quest. Screens use `/v1` only; no legacy `/graphql`.
