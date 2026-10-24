# Frontend

**Map:** [systems map](/docs/systems.md)

## Role

The frontend is a static React and Vite application hosted on Vercel. It sends API requests through same-origin Vercel rewrites. Production requests route to `api.chronicler.smokebombstudios.com`. Staging requests must route to `chronicler-api.piyushsatti.com`.

The current [`apps/web/vercel.json`](/apps/web/vercel.json) contains production API routing. Staging needs its own build or deployment configuration. The later workflow round will add that configuration; do not reuse production routing unchanged.

## Interfaces and implementation

| Interface                                            | Role                                 |
| ---------------------------------------------------- | ------------------------------------ |
| [Scoped body](/docs/interfaces/scoped-body.md)       | Render server-scoped document bodies |
| [GraphQL schema](/docs/interfaces/graphql-schema.md) | Shared client and API contract       |

The application implementation and local notes live in [`apps/web/docs`](/apps/web/docs/README.md). The planned staging and production release paths are recorded in [Vercel frontend routing](/deploy/docs/vercel-frontend.md).

## Requirements

See [frontend requirements](/docs/requirements/by-system/frontend.md) and the [requirements index](/docs/requirements/index.md).
