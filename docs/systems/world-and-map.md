# World and pointcrawl Maps

**Map:** [systems.md](/docs/systems.md)

## What it is

A Region groups Maps. Each Map owns pointcrawl nodes, edges and typed entry links. A node references its location Document rather than owning its prose. Submaps and Quest expected or visited associations use the current pointcrawl model. C3 retired hex grids and POIs; N2 retired aggregate change histories; N5 replaced Quest hex associations. See the [accepted API behavior](/apps/api/docs/design/graphql-product/behavior.md) and [Map activation guidance](/apps/web/docs/map-authoring.md).

A node without a linked location Document remains public. When a location Document is linked, its audience controls admission. This accepted exception does not create a separate Map visibility store.

## Interfaces

| Interface                                      | Role                                          |
| ---------------------------------------------- | --------------------------------------------- |
| [scoped-body](/docs/interfaces/scoped-body.md) | Location visibility through Document audience |

## Implemented by

| App        | Local docs                       |
| ---------- | -------------------------------- |
| `apps/api` | [apps/api/docs/](/apps/api/docs) |
| `apps/web` | [apps/web/docs/](/apps/web/docs) |

## Requirements

R-ids for this system: [../requirements/by-system/world-and-map.md](/docs/requirements/by-system/world-and-map.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/world-and-map.md` (gitignored).
