# Agent and Archive local stack

## Verdict

The local stack requires API migration [0015_archive_documents_view.sql](/apps/api/db/migrations/0015_archive_documents_view.sql). Its `public.archive_documents_v1` view exposes only `document_id` for non-deleted documents readable by an anonymous viewer under `document_readable`.

Archive fetches each candidate's current body through anonymous GraphQL `effectiveBody`. The API's Go projector owns marker redaction. Archive checks the fetched projection for a supported route and a non-empty public body before indexing.

[Compose](/deploy/compose/agent-archive.yml) supplies the local service configuration. Follow the steps below to validate startup with the configured database, API, assets, and providers. Configuration tests alone do not establish runtime readiness.

## Services

| Service           | Build                           | Role                             |
| ----------------- | ------------------------------- | -------------------------------- |
| `archive`         | `apps/agent/Dockerfile.archive` | LanceDB and authenticated MCP    |
| `agent`           | `apps/agent/Dockerfile`         | HTTP claim and completion worker |
| API, external     | Existing API process            | Job store and anonymous GraphQL  |
| LiteLLM, external | Operator gateway                | Chat and embeddings              |

Both Compose services use `restart: unless-stopped`. Archive keeps its index in `archive-data`. The API defaults to `host.docker.internal:8080`; anonymous GraphQL uses `/v1/graphql`.

## Prepare configuration

1. Apply API migrations through `0015_archive_documents_view.sql` with the existing API migration tooling. Use the API's migration identity, separate from Archive's read identity.
2. Supply the exact approved values from [environment.md](/apps/agent/docs/environment.md) and [`.env.example`](/apps/agent/.env.example). Use the supplied model aliases, revision, dimensions, tokenizer hashes, maximum input, and query prefix.
3. Stage the database CA file, embedding tokenizer file, and agent tokenizer directory at existing absolute paths. Compose binds each path read-only at the same container path and refuses to create missing host paths. Grant the container user read access.
4. Supply the Archive TLS database URL and MCP allowed hosts. Archive's existing database identity needs access to `public.archive_documents_v1`. The identity and its grants are operator-owned.
5. Set the anonymous GraphQL URL. HTTPS is required except for exact hosts `localhost`, `127.0.0.1`, `::1`, and `host.docker.internal`. Both `/v1/graphql` and `/graphql` are accepted.

## Start and check the stack

From the repository root, validate configuration and start the local services:

```bash
docker compose -f deploy/compose/agent-archive.yml config
docker compose -f deploy/compose/agent-archive.yml up --build -d
curl --fail --retry 30 --retry-connrefused --retry-max-time 120 --max-time 10 \
	http://localhost:8090/healthz
```

Initial connections may be refused while the first index sync completes. The probe retries connection refusals and transient HTTP errors within a 120-second retry window, with a 10-second limit per request.

Archive returns HTTP 200 with `ready` and `initial_sync_complete` set to `true` after its first successful index sync. A responding but unready health endpoint returns HTTP 503. Check service logs if startup fails or the probe exhausts its retries:

```bash
docker compose -f deploy/compose/agent-archive.yml logs archive agent
```

These are local verification steps. Provider dimensions, TLS connectivity, and answer quality require live evidence from the configured stack.

## Related

- [Deployment runbook](/deploy/docs/deploy-runbook.md)
- [Agent HTTP interface](/docs/interfaces/agent-qa-http.md)
- [Archive source and synchronization](/apps/agent/docs/archive.md)
