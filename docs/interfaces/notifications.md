# Interface: Addressed notifications

**Status:** accepted requirements; implementation partial  
**Provider:** `apps/api`  
**Consumers:** `apps/web`

**Locked (2026-10-18):** [owner-decisions](/docs/audits/owner-decisions.md) **D1**, **N4** — inbox `notifications` rows only. No `notification_events`, no `notification_channel_deliveries`, and no channel-delivery ledger in the squashed schema. **F1**, **N3** — no `dm_requests` / `request_decisions`; the `DM_REQUEST_DECIDED` kind is **retired** (see [Events and recipients](#events-and-recipients)).

## Rule

Generate notifications at the business event's write, address them to the concerned members, and resolve protected display text under each reader's current authority. Recipient routing, document visibility, and unread state are separate concerns; optional external channels are product work **outside** a durable delivery ledger.

### Events and recipients

This is the retained event vocabulary and recipient contract. It is not evidence of producers in the rebuilt API; expansion or retirement requires a product decision.

| Kind                                    | Recipient                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHARACTER_VERIFICATION_DECIDED`        | The character's owner                                                                                                                                          |
| `QUEST_SIGNUP_CONFIRMED`                | The signing-up member; signup is self-service, not an approval                                                                                                 |
| `QUEST_WAITLIST_PROMOTED`               | The promoted member, not the withdrawing actor                                                                                                                 |
| `DOCUMENT_EDITED`, `DOCUMENT_PUBLISHED` | The document author, excluding the actor                                                                                                                       |
| `DM_MENTIONED`                          | Newly named, resolvable `[!dm:@handle]` members, excluding the actor; editing an unchanged mention does not notify again                                       |
| `QUEST_SCHEDULED`                       | Signed-up and waitlisted members, excluding the actor; includes rescheduling and the recorded quest-change variants                                            |
| ~~`DM_REQUEST_DECIDED`~~                | **Retired** — superseded by owner-decisions **N3** / **F1** (no DM request workflow tables). Do not add producers or SDL for this kind on the product cutover. |

One provider module owns recipient derivation. Write sites validate actors. A public Discord quest-board announcement is a broadcast and does not satisfy addressed inbox delivery.

### Privacy and read state

- Store subject/recipient identifiers rather than frozen document titles, bodies, or rendered summaries. Closed event facts such as a verification verdict are distinct from document-derived display text.
- Resolve every document-derived field through the existing document read authority at display/delivery time, including a quest title obtained from its brief document. A public quest row does not make its brief's title public. Follow [live-authority](/docs/interfaces/live-authority.md) and [scoped-body](/docs/interfaces/scoped-body.md); do not copy the audience predicate into notifications.
- Character names on public character rows do not acquire a new document audience rule. Notification ownership still limits their inbox rows to addressed recipients.
- Recheck after audience or identity changes. Suppress invisible or missing document subjects without returning their text, codes, or links; retain the notification record. The retained suppression contract marks those rows read so the badge converges. In the rebuilt CQRS API this needs a real acknowledgement command, not a write hidden inside an unread-count read.
- Page cursors advance from the raw rows considered, before suppression, so an entirely suppressed page does not loop. Mark-read and suppression acknowledgement may affect only the current member's rows. Clear client caches on viewer/token transitions.

### Generation and failure

Generate once at the event site, inside its business unit of work. Repositories never commit independently. Persist queryable per-member unread state on **`notifications`** only (**N4**). There is no separate event row or per-channel delivery table in the squashed schema; do not document or implement `notification_events` / `notification_channel_deliveries` as product authority.

**Durability:** generation should commit with the originating command when feasible. The legacy savepoint/isolation pattern is not resurrected as a parallel event ledger. Optional email/Discord/push channels, if added later, consume inbox rows or side-effect outside Postgres — not a second durable delivery ledger in the hobby cutover.

In-app inbox is the baseline surface. Additional channels, copy/grouping/digests, and retry policy remain product/implementation work. Any live signal must satisfy the same current-authority privacy boundary; a subject identifier can itself reveal hidden existence.

## Enforcement

| Mechanism                                                                                                                          | Location                                                                                                          | Status                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current-member unread count, exact `{count}` response, negative-count failure and no writes                                        | `notification.Routes`, `Queries.UnreadCount`, `CountUnreadNotificationsByMember`; `query_test.go`, `http_test.go` | Implemented; native API/PostgreSQL tests and 11 controlled 1920×1080 browser cases passed on 2026-10-11                                                                                                                                                 |
| Count wire/mount contract                                                                                                          | `TestNotificationsUnreadCountCanonicalRoutingOpenAPIAndMount`                                                     | Passed in the 2026-10-11 integrated Go contract suite after the YAML decoder test repair                                                                                                                                                                |
| Native PostgreSQL recipient/current-authority/error/no-write assertions                                                            | `notifications_unread_integration_test.go`                                                                        | Six native tests passed on 2026-10-11 against the real mounted API and an isolated PostgreSQL fixture; no failures or skips                                                                                                                             |
| Web count parser, badge, and account error/recovery assertions                                                                     | Notification adapter, bell and login-panel tests                                                                  | Passed in the recorded offline web suite; fixture evidence, not native inbox parity                                                                                                                                                                     |
| Explicit mark-read, recipient isolation, preserved timestamps and idempotent retries                                               | `notification.ProductCommands.MarkNotificationsRead`, GraphQL mutation; native, contract and web batching tests   | Implemented; six native mark-read tests passed on 2026-10-11, including real SQL/commit rollback and simulated lost acknowledgement after commit. Web batching and viewer-transition tests passed; full native inbox/browser journey remains unverified |
| Producers, recipient derivation, protected display, acknowledgement, pagination, delivery/preferences and durable failure recovery | Full notification journey                                                                                         | **not enforced** in the current rebuild                                                                                                                                                                                                                 |

### Approved mark-read command

GraphQL `Mutation.markNotificationsRead(ids, meta)` accepts at most 100 entries before deduplication. Canonical hyphenated UUIDs are case-insensitive; the API normalizes and deduplicates them. Empty arrays are valid. Invalid IDs return the GraphQL `INVALID` error with the existing message `Invalid notification read request`; unknown or foreign valid IDs are ignored. Authentication uses the current active member. The retired `POST /v1/me/notifications/read` route returns 404.

A command-owned transaction changes only that member’s addressed unread rows, using one command timestamp and preserving existing read timestamps. The GraphQL receipt is returned after commit. Retrying with the same idempotency key replays its receipt. A new-key retry also preserves existing timestamps. An internal error can leave the commit outcome uncertain; the client must not infer rollback from an error. Web retries split larger sets into serial batches of at most 100, retain unresolved IDs, and discard work when the viewer changes. Suppression acknowledgement remains a separate command.

The 2026-10-11 mark-read results above describe the former HTTP transport. The retained PostgreSQL assertions now exercise the GraphQL mutation in `notifications_read_integration_test.go`, including recipient confinement, current authority, timestamps, concurrent retries, write and deferred-commit rollback, and simulated lost commit acknowledgement. Their current execution receipt must be reported separately.

## Owner-approved unsupported-row policy (2026-10-11)

The owner approved **HISTORY-1** and **ROWS-1** as target inbox policy. A valid character-verification or quest-change notice whose original verdict/change cannot be proven, or a malformed row or missing non-document subject, makes that requested inbox read fail visibly with an opaque error until the row is repaired. Preserve proven historical facts and never infer an earlier event from current status. Retain affected rows; return no raw body or fabricated card, and do not silently skip, mark read, delete, or quarantine them. Ordinary hidden-document suppression remains governed by the separate current-authority rule above.

This decision does not by itself specify inbox projection completeness. Current source wires `queryResolver.MyNotifications` through notification ProductQueries to `ProductNotificationInbox`; HISTORY-1/ROWS-1 failure semantics and row repair/backfill still need separate authorization. It also approves no generation durability policy or suppression-acknowledgement implementation.

## Provider

Current source has `GET /v1/me/notifications/unread-count` in [OpenAPI](/packages/contracts/openapi.yaml), mounted through `notification.Routes`. Authentication resolves the current active member; the query counts only that member's rows with `read_at IS NULL`. The response contains only a nonnegative integer `count`; unavailable dependencies or query/invariant failures are internal errors, not a successful empty result. It neither suppresses nor acknowledges nor marks read.

`queryResolver.MyNotifications` wires through notification ProductQueries to Postgres inbox rows (cursor-paginated). The former REST route is unmounted. `Mutation.markNotificationsRead` is mounted through GraphQL with a command-owned transaction and recipient-scoped SQL update. Its former REST route is unmounted. Web submits bounded serial batches through its feature adapter and mutation hook. The current `notifications` table includes a `body` column but has no per-channel delivery table; schema presence does not establish privacy-safe generation or delivery. See [API schema notes](/apps/api/docs/schema-v2.md) for storage, not behavioral authority.

**Historical boundary:** the later retained legacy source implemented event-site generation, recipient derivation, audience-safe display, paginated inbox/mark-read and server-backed preferences. Its inbox read also committed suppression marks. This supersedes the older epic's greenfield/absent-code snapshot. Those Python mechanisms and historical passing claims are not the current Go implementation or permission to restore side-effecting reads.

## Consumers

Web uses one notifications feature owner: composition/query/mutation hooks call Zod edge adapters, and props-driven UI consumes their results. Chrome calls hooks, never adapters; MSW remains feature-local. Follow [web architecture](/apps/web/docs/architecture.md). The account preview and infinite inbox use distinct feature-owned query keys under one invalidation prefix, preventing incompatible cache shapes. Count and mark-read success do not establish inbox projection, suppression acknowledgement, preferences, generation or delivery completeness. The controlled count browser cases use synthetic local identities and the real API/PostgreSQL; they are not live/legacy visual comparisons. Mark-read browser verification through a real inbox remains pending its provider recovery.

## Related decisions

- [D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md) — ownership and the document read-scope boundary
- [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md) — declared identity bypass and player-character exception
- [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md) — scope before rendering
- [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) — reads and explicit commands follow the accepted wire routing

## Reopen

An event/recipient change, new delivery channel, or a durability ruling changes this contract. Current implementation defects do not silently redefine it.

## Current inbox repair (2026-10-20)

The command-bound producer now writes one inbox row per addressed member through `EventWriter.InsertInbox`. It keeps typed immutable facts in a private versioned envelope in the existing `body` column and independent notification/recipient proof in the originating completed command receipt. There is no event or delivery ledger. See the [producer contract](/apps/api/docs/design/graphql-product/notification-producer-contract.md#current-repair-implementation-2026-10-20) for the exact representation and replay bounds.

Historical inbox reads compare each envelope with its completed command proof and native source evidence. They never infer the earlier verdict or participation transition from current status. Unsupported legacy plaintext and missing or corrupt proof fail visibly with opaque `INTERNAL`; rows and unread timestamps remain intact. Public cards contain closed-fact labels and subject IDs, never the private envelope or frozen Document text.

Current Document authority suppresses hidden cards after proof validation. Cursors use the raw validated page, so an entirely hidden page still advances. Reads have no acknowledgement side effect. Explicit suppression acknowledgement validates the entire transaction-bound locked batch and changes only current hidden Document rows. A malformed non-Document notice or an audience-provider failure rolls back the command.

Native PostgreSQL tests prove recipient confinement, original quest transitions after roster changes, original verification verdicts, independent revision mention evidence, command replay, insertion rollback, hidden-page pagination, and atomic suppression acknowledgement. Notification data and proof use two set queries at raw page sizes 1, 10, and 50; Document audience resolution is separate. Quest signup and promotion are wired. The remaining Document and Character generation write sites, live browser notification journey, and external delivery remain unverified or pending their owning work.
