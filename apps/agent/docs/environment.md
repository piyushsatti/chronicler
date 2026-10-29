# Environment (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

Variables for the HTTP-first Q&A path. Values are never committed. Archive requires API migration `0015_archive_documents_view.sql`, which supplies `public.archive_documents_v1` for ID eligibility only. Bodies come from the anonymous API's `effectiveBody`. See [local stack](/deploy/docs/agent-archive-local.md).

## Variables

| Variable                        | Owner                 | Local          | Prod      | Notes                                                                                                    |
| ------------------------------- | --------------------- | -------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `AGENT_ENABLED`                 | Discord               | optional       | as needed | Must be `true` to mount mention agent                                                                    |
| `AGENT_ALLOWED_GUILD_IDS`       | Discord               | yes if enabled | yes       | Comma-separated                                                                                          |
| `AGENT_ALLOWED_CHANNEL_IDS`     | Discord               | yes if enabled | yes       | Guild path                                                                                               |
| `AGENT_ALLOWED_DM_USER_IDS`     | Discord               | optional       | optional  | DM path                                                                                                  |
| `AGENT_MAX_CONCURRENT`          | Discord               | optional       | optional  | Default 2                                                                                                |
| `AGENT_QUEUE_CAPACITY`          | Discord               | optional       | optional  | Default 25                                                                                               |
| `AGENT_PUBLIC_ORIGIN`           | Discord               | yes            | yes       | HTTPS origin for source URL checks                                                                       |
| `API_URL` / Discord `apiUrl`    | Discord               | yes            | yes       | Base URL for agent REST                                                                                  |
| `INGEST_SECRET`                 | Discord + API + Agent | yes            | yes       | Shared ingest header value                                                                               |
| `AGENT_INLINE_COMPLETE`         | API                   | optional       | **unset** | `1` = stub complete; not for production                                                                  |
| `DATABASE_URL`                  | API                   | yes            | yes       | Owns `agent_questions` / jobs                                                                            |
| `API_URL`                       | Agent worker          | yes            | yes       | Base URL for claim/complete (Phase C)                                                                    |
| `INGEST_SECRET`                 | Agent worker          | yes            | yes       | Same secret as Discord                                                                                   |
| `AGENT_CLAIM_INTERVAL_SECONDS`  | Agent                 | optional       | optional  | Poll backoff (Phase C)                                                                                   |
| `LITELLM_BASE_URL`              | Agent + Archive       | yes            | yes       | Gateway; benchmark defaults to `http://127.0.0.1:4000`                                                   |
| `LITELLM_API_KEY`               | Agent + Archive       | yes            | yes       | May differ per role                                                                                      |
| `AGENT_MODEL`                   | Agent                 | yes            | yes       | Chat model alias                                                                                         |
| `ARCHIVE_MCP_URL`               | Agent                 | yes            | yes       | e.g. `http://archive:8000/mcp`                                                                           |
| `ARCHIVE_MCP_TOKEN`             | Agent + Archive       | yes            | yes       | Shared MCP auth                                                                                          |
| `AGENT_CONTEXT_FILE`            | Agent                 | yes            | yes       | Path to context markdown                                                                                 |
| `AGENT_TOKENIZER_PATH`          | Agent                 | yes            | yes       | Local tokenizer dir                                                                                      |
| `AGENT_TOKENIZER_SHA256`        | Agent                 | yes            | yes       | Pin                                                                                                      |
| `AGENT_TOKENIZER_CONFIG_SHA256` | Agent                 | yes            | yes       | Pin                                                                                                      |
| `AGENT_CHAT_TEMPLATE_SHA256`    | Agent                 | yes            | yes       | Pin of UTF-8 template string                                                                             |
| `AGENT_CONTEXT_TOKENS`          | Agent                 | optional       | optional  | Default 16384                                                                                            |
| `AGENT_MAX_COMPLETION_TOKENS`   | Agent                 | optional       | optional  | Default 512                                                                                              |
| `AGENT_MODEL_*`                 | Agent                 | optional       | optional  | temperature, top_p, penalties, seed, thinking, timeouts                                                  |
| `ARCHIVE_PASSAGE_READS`         | Agent                 | optional       | optional  | Default true                                                                                             |
| `PUBLIC_GRAPHQL_URL`            | Archive               | yes            | yes       | Anonymous `/v1/graphql`; `/graphql` remains compatible                                                   |
| `PUBLIC_SITE_URL`               | Archive               | yes            | yes       | Canonical link origin; benchmark defaults to the production site origin                                  |
| `LANCEDB_PATH`                  | Archive               | yes            | yes       | Index volume                                                                                             |
| `EMBEDDING_*`                   | Archive               | yes            | yes       | Compose requires exact model, revision, dimensions, tokenizer path/hash, maximum input, and query prefix |
| `ARCHIVE_CHUNK_*`               | Archive               | optional       | optional  | Tokens / overlap                                                                                         |
| `RERANK_*`                      | Archive               | optional       | optional  | Opt-in only                                                                                              |
| `ARCHIVE_HOST` / `ARCHIVE_PORT` | Archive               | yes            | yes       | Bind                                                                                                     |
| `ARCHIVE_MCP_TOKEN`             | Archive               | yes            | yes       | Must match agent                                                                                         |
| `INDEX_INTERVAL_SECONDS`        | Archive               | optional       | optional  | Sync cadence                                                                                             |
| `ARCHIVE_BOOTSTRAP_*`           | Archive               | optional       | as needed | Snapshot path/sha/counts                                                                                 |
| `ARCHIVE_DATABASE_URL`          | Archive               | yes            | as needed | Required TLS PostgreSQL source for `public.archive_documents_v1` candidate IDs                           |
| `ARCHIVE_DATABASE_CA_FILE`      | Archive               | yes            | as needed | Required staged CA file, mounted read-only by Compose                                                    |
| `ARCHIVE_ALLOWED_HOSTS`         | Archive               | yes            | as needed | Required comma-separated MCP transport host allowlist                                                    |
| `CHRONICLER_BUILD_SHA`          | Agent + Archive       | optional       | yes       | Trace / image label                                                                                      |

## Local assets and anonymous URLs

Compose requires existing absolute paths for `ARCHIVE_DATABASE_CA_FILE`, `EMBEDDING_TOKENIZER_PATH`, and `AGENT_TOKENIZER_PATH`. Each path is mounted at the same location inside its service, read-only. Missing host paths are not created. The agent tokenizer directory must contain its pinned tokenizer and chat-template configuration.

Supply operator-approved model aliases, revisions, dimensions, and hashes. Set `EMBEDDING_QUERY_PREFIX` to the exact contract prefix, including an empty string when required. Compose does not choose a replacement embedding model or dimension.

`PUBLIC_GRAPHQL_URL` requires HTTPS except for exact local hosts `localhost`, `127.0.0.1`, `::1`, and `host.docker.internal`. Credentials, queries, fragments, and redirects are rejected.

## Deprecated (do not set for monorepo path)

| Variable          | Was             | Status      |
| ----------------- | --------------- | ----------- |
| `RABBITMQ_URL`    | Agent / Discord | **Retired** |
| `QA_EXCHANGE`     | Agent / Discord | **Retired** |
| `QA_JOBS_QUEUE`   | Agent           | **Retired** |
| `QA_EVENTS_QUEUE` | Discord         | **Retired** |

## Related

- [http-transport.md](/apps/agent/docs/http-transport.md)
- [archive.md](/apps/agent/docs/archive.md)
- Example file: [apps/agent/.env.example](/apps/agent/.env.example)
