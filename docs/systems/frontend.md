# Frontend

**Map:** [systems map](/docs/systems.md)

## Role

The frontend is a static React and Vite application hosted on Vercel. It sends API requests through same-origin Vercel rewrites. Production requests route to `chronicler-prod-api.piyushsatti.com`, a Cloudflare Tunnel hostname. Staging requests must route to `chronicler-api.piyushsatti.com`.

[`apps/web/vercel.json`](/apps/web/vercel.json) contains production API routing and [`apps/web/vercel.staging.json`](/apps/web/vercel.staging.json) the staging routing. Each release workflow selects its own file and fails if the build contains the other environment's origin; do not reuse production routing unchanged for staging.

## Interfaces and implementation

| Interface                                            | Role                                 |
| ---------------------------------------------------- | ------------------------------------ |
| [Scoped body](/docs/interfaces/scoped-body.md)       | Render server-scoped document bodies |
| [GraphQL schema](/docs/interfaces/graphql-schema.md) | Shared client and API contract       |

The application implementation and local notes live in [`apps/web/docs`](/apps/web/docs/README.md). The staging and production release paths are recorded in [Vercel frontend routing](/deploy/docs/vercel-frontend.md).

## Requirements

See [frontend requirements](/docs/requirements/by-system/frontend.md) and the [requirements index](/docs/requirements/index.md).
