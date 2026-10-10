# Web source

| Path          | Purpose                                     |
| ------------- | ------------------------------------------- |
| `api/`        | GraphQL and REST transport                  |
| `auth/`       | JWT lifecycle (identity only)               |
| `components/` | Foundation, domain, chrome                  |
| `errors/`     | Boundary error types                        |
| `features/`   | Adapters, hooks, pages                      |
| `hooks/`      | Cross-cutting query hooks (`useMe`)         |
| `mocks/`      | MSW handlers (browser worker + test server) |
| `store/`      | Redux (toasts)                              |
| `styles/`     | Tokens and base CSS                         |

Contracts: `@pi/contracts`. Rules: [`docs/architecture.md`](../docs/architecture.md).
