# Monorepo overview (as-built)

## Verdict

- This page is the **monorepo map**: what lives in this repository and how pieces connect.
- Product **intent**: [systems.md](/docs/systems.md) · [interfaces/](/docs/interfaces/README.md).
- CI and `scripts/verify` are the “implemented” signal.

## Applications

| App | Runtime | Role | Docs |
| --- | --- | --- | --- |
| `apps/api` | Python (FastAPI, Strawberry GraphQL) | Authoritative API and persistence | [apps/api/docs/](/apps/api/docs/README.md) |
| `apps/web` | TypeScript (React, Vite) | Member-facing SPA | [apps/web/docs/](/apps/web/docs/README.md) |
| `apps/discord` | TypeScript (discord.js) | Guild activity sensor | [apps/discord/docs/](/apps/discord/docs/README.md) |
| `apps/agent` | Python | Agent logic | [apps/agent/docs/](/apps/agent/docs/README.md) |

## Shared contract

`packages/contracts` holds the canonical GraphQL schema. Interface: [graphql-schema](/docs/interfaces/graphql-schema.md).

## How it moves

```mermaid
flowchart LR
    B[Browser] --> V[Vercel_static_web]
    B --> C[Caddy_TLS]
    C --> A[API_FastAPI]
    A --> P[(Postgres)]
    D[Discord_gateway] --> BO[discord_app]
    BO --> A
    A --> DW[Discord_webhook]
```

Authoring is website-first. The bot is a sensor; the API announces. See [discord-sensor](/docs/interfaces/discord-sensor.md).

## Related

- [Systems map](/docs/systems.md) · [Interfaces](/docs/interfaces/README.md) · [Requirements](/docs/requirements/README.md) · [Semantics](/docs/semantics/README.md)
- Runbooks: [deploy/docs/](/deploy/docs/README.md)
