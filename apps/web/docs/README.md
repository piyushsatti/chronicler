# Web app docs (`apps/web`)

As-built and design notes for the React SPA.

## Implements

| Interface                                            | Role                          |
| ---------------------------------------------------- | ----------------------------- |
| [graphql-schema](/docs/interfaces/graphql-schema.md) | Consumes `@pi/contracts`      |
| [live-authority](/docs/interfaces/live-authority.md) | Sends JWT identity only       |
| [scoped-body](/docs/interfaces/scoped-body.md)       | Renders already-scoped bodies |
| [media-linked](/docs/interfaces/media-linked.md)     | Authoring links, not uploads  |

## Topics

| Doc                                                   | Use                                               |
| ----------------------------------------------------- | ------------------------------------------------- |
| [architecture.md](/apps/web/docs/architecture.md)     | Boundaries, hooks, fixtures, JWT accepted defects |
| [design-system.md](/apps/web/docs/design-system.md)   | Design system                                     |
| [ui-conventions.md](/apps/web/docs/ui-conventions.md) | UI conventions                                    |
| [map-authoring.md](/apps/web/docs/map-authoring.md)   | Map authoring                                     |
| [decisions/](/apps/web/docs/decisions)                | Web-local D-records (D21)                         |

Parent: [../README.md](/apps/web/README.md).
