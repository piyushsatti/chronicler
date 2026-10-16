# Requirements: Serving a request

System reference: [serving a request](/docs/systems/serving-a-request.md). The owner-approved Go product cutover reconciles the earlier Python/session and union wording. Requirements remain unverified until the named provider tests exercise them.

| #   | Requirement                                                                                                                                                         | Verification obligation                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1  | Each independent read/batch task borrows its own connection; no request-wide lock or session.                                                                       | Real concurrent loader and pool-budget tests.                                                     |
| R2  | Each new business command owns one unit-of-work transaction including its required cross-domain writes, history, inbox and durable work. Repositories never commit. | Mounted mutation rollback/replay/concurrency tests; no remote work while holding the transaction. |
| R3  | Expected failures use Go apierr values. GraphQL exposes the six accepted codes in errors.extensions.code; unexpected failures stay opaque INTERNAL.                 | Real transport/authority and mounted negative cases.                                              |
| R4  | Validate actual depth, weighted complexity, alias and response bounds before executing work where specified by the transport contract.                              | The shared AST cost specification and real boundary sensitivity tests.                            |

## Assumptions

No task holds database resources during remote I/O. Each loader preserves duplicate-key correspondence and argument/authority scope. Product commands do not implicitly share a transaction across mutation roots. Pool sizing and bounds require measured native acceptance evidence; the values are initial engineering limits.

The approved cutover reopens the historical rejection of cost/depth limits. Accepted values are depth12, complexity100000,20 aliased roots,256KiB request and2MiB staged response; exact limits and failure ordering belong to the [transport interface](/docs/interfaces/graphql-product-transport.md). No requirement verdict becomes met merely because the contract is published.
