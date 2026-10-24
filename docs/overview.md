# Chronicler monorepo overview

This repository contains the Chronicler campaign-management product and its shared contracts. Product intent lives in [systems](/docs/systems.md), [interfaces](/docs/interfaces/README.md), [requirements](/docs/requirements/README.md), and [decisions](/docs/decisions/README.md). App-specific implementation notes live under each app's `docs/` directory.

## Applications

| App            | Runtime                   | Role                                               | Docs                                         |
| -------------- | ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `apps/api`     | Go                        | GraphQL and REST API, worker, persistence          | [API docs](/apps/api/docs/README.md)         |
| `apps/web`     | React and Vite            | Member-facing site                                 | [Web docs](/apps/web/docs/README.md)         |
| `apps/discord` | TypeScript and discord.js | Discord activity sensor and optional mention agent | [Discord docs](/apps/discord/docs/README.md) |
| `apps/agent`   | Python                    | Agent service and archive tools                    | [Agent docs](/apps/agent/docs/README.md)     |

`packages/contracts` contains the shared GraphQL and OpenAPI contracts.

## Request and release paths

```mermaid
flowchart LR
    B[Browser] --> V[Vercel frontend]
    V -->|same-origin rewrite| A[Chronicler API]
    A --> P[(PostgreSQL)]
    D[Discord gateway] --> BO[Discord app]
    BO --> A
    A --> W[Background worker]
    AG[Agent service] --> A
```

The staging site is `chronicler.piyushsatti.com`, with API `chronicler-api.piyushsatti.com` through Cloudflare Tunnel. Production uses `chronicler.smokebombstudios.com` and API `api.chronicler.smokebombstudios.com`. The production API and worker are targeted for one DigitalOcean droplet with PostgreSQL. Current production Compose does not yet include PostgreSQL, ingress, or migrations. The staging and production release workflows are also not implemented.

Production changes follow the single GitHub Actions release authority in [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). See the [deployment runbooks](/deploy/docs/README.md) for the target and its current gaps.

## Related maps

[Systems](/docs/systems.md) · [Interfaces](/docs/interfaces/README.md) · [Requirements](/docs/requirements/README.md) · [Semantics](/docs/semantics/README.md)
