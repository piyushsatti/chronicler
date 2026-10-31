# Archive (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Current status

Archive indexes current anonymous GraphQL projections as token-bounded passages in LanceDB and exposes them over MCP. The API owns disclosure through `effectiveBody`. Search hits require a current read before citation.

The database view `archive_documents_v1` (migration `0015`) supplies only the IDs of documents an anonymous reader may see, using `document_readable`. Bodies come from the anonymous GraphQL API, already projected in Go ([D50](/docs/decisions/D50-Archive-Uses-Current-Anonymous-Projections.md)). See [local stack](/deploy/docs/agent-archive-local.md).

## Responsibilities

| Concern                                    | Owner                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| Document eligibility and marker projection | API Document Specification and `effectiveBody`              |
| Candidate IDs                              | `ProjectionReader`, expecting `archive_documents_v1`        |
| Current body and projection digest         | Anonymous GraphQL `documentById` and `pi.chronicler.qa`     |
| Chunking, embeddings, and LanceDB          | `pi.chronicler.archive`                                     |
| MCP tools                                  | `search_documents`, `read_document`, `read_document_by_url` |

The source batches anonymous revalidation in groups of four. Requested IDs must remain eligible in the current candidate projection. The source obtains body text from GraphQL, never from frozen snapshot text.

## Bootstrap and synchronization

A snapshot pins file SHA-256 and document count. Before promotion, snapshot IDs limit the candidate set, and current candidate eligibility plus anonymous GraphQL govern reads and indexing. Frozen text cannot disclose withdrawn or changed content.

The configured minimum of current, canonically revalidated documents triggers promotion. The durable marker binds promotion to the snapshot SHA-256. Promotion remains in effect after restart. Legitimate edits and withdrawals do not require the current corpus to match the historical snapshot. Configure all five `ARCHIVE_BOOTSTRAP_*` values together.

An identical desired passage set skips replacement. An empty sync over a nonempty index fails and preserves existing passages. Current revalidation still hides withdrawn documents retained in that index. A fresh empty index is allowed. Changed rebuilds retain the existing non-atomic replacement mechanism.

Exact URL reads query matching passages through `url_passages` rather than materializing every stored passage.

## Retrieval contract

- Chunk target is 256 tokens with 32-token overlap, separate from the embedding maximum input.
- Search combines dense and full-text results with reciprocal-rank fusion.
- Reranking is optional through `RERANK_MODEL`. Keep release reranking disabled until it beats hybrid reciprocal-rank fusion on held-out quality gates.
- Compose requires exact operator-supplied model aliases, revision, dimensions, tokenizer hash, maximum input, and query prefix.
- Tokenizer assets and database CA files are staged locally and mounted read-only. No tokenizer download is part of Archive startup.

The anonymous source accepts `/v1/graphql` and the compatible `/graphql` path. HTTPS is required except for the exact local hosts `localhost`, `127.0.0.1`, `::1`, and `host.docker.internal`. Credentials, queries, fragments, and redirects are rejected.

## Related

- [architecture.md](/apps/agent/docs/architecture.md)
- [environment.md](/apps/agent/docs/environment.md)
- [legacy-mapping.md](/apps/agent/docs/legacy-mapping.md)
