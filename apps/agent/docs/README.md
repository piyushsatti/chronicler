# Agent app docs (`apps/agent`)

**App:** `apps/agent`  
**Implements:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Verdict

Python uv project for the Chronicler answer worker (`pi.chronicler.agent`) and the Archive indexing stack (`pi.chronicler.archive`, Phase C). Job durability lives in `apps/api`. Discord submits and polls over HTTP. RabbitMQ is not used on the monorepo path.

## Index

| Doc | Topic |
| --- | --- |
| [architecture.md](/apps/agent/docs/architecture.md) | Components, trust, flows |
| [http-transport.md](/apps/agent/docs/http-transport.md) | Submit / claim / complete contracts |
| [archive.md](/apps/agent/docs/archive.md) | LanceDB + MCP + GraphQL source |
| [environment.md](/apps/agent/docs/environment.md) | Env var table |
| [legacy-mapping.md](/apps/agent/docs/legacy-mapping.md) | Pre-monorepo → `pi.chronicler.*` |
| [port-gap-audit.md](/apps/agent/docs/port-gap-audit.md) | Stale docs and known bugs |

Layout and local commands: [../README.md](/apps/agent/README.md).
