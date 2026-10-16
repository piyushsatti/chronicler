# Interface: Task database work and audience predicate

**Status:** accepted design; full Go enforcement pending
**Provider:** apps/api
**Consumers:** GraphQL resolvers, batch providers and HTTP paths reading scoped data

## Rule

Each independent read task or loader batch borrows its own pooled connection for its bounded database work. There is no request-wide session, transaction or serialization lock. Current authority and the audience specification travel as immutable inputs. Every Document/revision/link projection applies the owning audience predicate.

A business command owns one unit-of-work transaction and binds all repositories/foreign writers to it. Repositories never commit. Required history, in-app notifications and durable work admission share that command transaction. Several mutation roots remain independent commands. Remote provider work holds no database transaction or query connection.

## Enforcement

| Mechanism                                        | Location                                            | Status                                                    |
| ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| Command transaction ownership                    | uow.Runner.Do                                       | existing primitive; full product command use not enforced |
| Scoped Document projections                      | Document specification and scoped-body tests        | partially implemented                                     |
| Task-local batching and complete command writers | product repositories/loaders and mounted acceptance | not enforced until implementation                         |

## Provider

The [API contract](/apps/api/docs/graphql-contract.md) and [Go interfaces](/apps/api/docs/design/graphql-product/interfaces.md) specify actual provider/caller signatures. Pool acquisition/query bounds and concurrent loader limits are accepted in the [performance contract](/apps/api/docs/design/graphql-product/performance.md).

## Consumers

Consumers do not implement competing audience rules. Renderers receive the already scoped body. A shared pgx transaction is never handed to concurrent resolver tasks.

## Related decisions

- [D27](/docs/decisions/D27-One-Session-Per-Request.md) was amended to session per task with no lock.
- [D28](/docs/decisions/D28-One-Predicate-Over-Policy.md) retains one audience predicate.

## Reopen

Measured pool/resource behavior requires a new accepted boundary, or a scoped load bypasses the owning predicate.
