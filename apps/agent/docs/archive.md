# Archive (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

Archive retains **canonical public document projections** as token-bounded passages in LanceDB and exposes them over MCP for the answer worker. It is the authority for public eligibility, canonical URLs, and content versions. Search hits alone cannot support a citation.

**Port status:** `pi.chronicler.archive` and `pi.chronicler.qa` live under `apps/agent`. Deploy outline: [agent-archive-local.md](/deploy/docs/agent-archive-local.md).

## Responsibilities

| Concern                             | Owner                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| Eligibility / projection digest     | `pi.chronicler.qa` helpers                                       |
| Chunking + embeddings + Lance index | `pi.chronicler.archive`                                          |
| Live corpus snapshot                | Anonymous GraphQL (`documents` / `documentById`) on `apps/api`   |
| MCP tools                           | `search_documents`, `read_document` (passage-aware when enabled) |

## Retrieval profile (inherited)

Evaluated defaults from legacy Archive (do not change without a new quality receipt):

- Chunk target **256** tokens, overlap **32**, separate from embedding model max input.
- Hybrid dense + full-text with reciprocal-rank fusion.
- Optional Cohere-compatible rerank (`RERANK_MODEL`) is **opt-in**; do not enable for release until quality beats hybrid-RRF on held-out gates.
- Tokenizer/revision/dimension/hash pins are required at startup — no runtime Hugging Face downloads in production images.

## GraphQL verification (before Phase C cutover)

Archive’s anonymous source must match Go GraphQL fields for published public documents. Checklist:

1. Confirm `documents` filters (`kind`, `status`, `visibility`) and `documentById` against `packages/contracts` SDL.
2. Confirm projection fields used for digest (id, slug, kind, category, status, visibility, title, updatedAt, frontmatter, effectiveBody).
3. Run a contract test against a local API once Phase C lands — do not assume FastAPI field names.

## Bootstrap

Empty LanceDB needs a bootstrap snapshot or a successful index sync (`INDEX_INTERVAL_SECONDS`, bootstrap path/sha env — see [environment.md](/apps/agent/docs/environment.md)). Dev CLI: `chronicler-archive-reindex-dev` (Phase C).

## Related

- [architecture.md](/apps/agent/docs/architecture.md)
- [environment.md](/apps/agent/docs/environment.md)
- [legacy-mapping.md](/apps/agent/docs/legacy-mapping.md)
