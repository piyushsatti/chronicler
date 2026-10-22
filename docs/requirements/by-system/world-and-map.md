# Requirements — Location visibility follows Document audience

System: [World and Map](/docs/systems/world-and-map.md)

The 2026-10-20 complete frontend plan authorizes pointcrawl browsing and editing. The [accepted API behavior](/apps/api/docs/design/graphql-product/behavior.md), including C3, N2 and N5, supersedes the historical hex and change-ledger assumptions below. Existing requirement identities are preserved; this update does not assert that implementation or verification is complete.

## Requirements

| #   | Requirement                                                                                                                                                                                            | Authority                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A Region groups Maps. A Map owns pointcrawl nodes and edges; nodes reach authored location prose by reference.                                                                                         | Current GraphQL product behavior, C3.                                                                                              |
| R2  | Typed Map entry links are the retained mechanism for node-to-Document associations. Unlinking does not delete the Document.                                                                            | Current pointcrawl commands and C3; historical hex link names in D6 are retired.                                                   |
| R3  | No discovery, fog or per-member visibility store exists. Linked Document audience controls admission and protected references.                                                                         | Current behavior and scoped-body contract; the single-audience intent of D7 is retained.                                           |
| R4  | Location mutations enforce current command authority, assignments and Document write authority. Do not infer permission from a role label or a historical verb name.                                   | Current capability policy and Document command contracts supersede the dated July audit wording.                                   |
| R5  | Map owns its operational nodes, edges and entry associations. Document owns prose. Retired hex, POI and aggregate change-history tables are excluded.                                                  | C3, N2 and the current aggregate boundaries.                                                                                       |
| R6  | Activation requires current real-API, permission, accessibility, responsive and cold-cache evidence, followed by explicit visual approval. Production release requires separate Actions authorization. | Owner-approved complete frontend plan; [resume and launch checklist](/apps/web/docs/map-authoring.md#resume-and-launch-checklist). |

## Assumptions

| #   | Assumption                                                                              | Consequence if it changes                                                                |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A1  | Place visibility uses the canonical Document audience engine.                           | A second Map visibility policy needs an explicit owner decision.                         |
| A2  | Current command and Document authority remain the admission rules for location editing. | A capability change requires a reviewed policy decision and revocation tests.            |
| A3  | The historical hex-terrain consistency assumption is retired by C3.                     | Restoring hex or POI storage requires a new decision and is outside frontend completion. |
| A4  | Region and Map remain separate domain owners composed by reference.                     | A change to their transaction boundary needs architecture review.                        |
