# Decisions (boundary)

Short ADRs that cross apps or define product boundaries. IDs D1–D33 never change. Template: [../templates/decision.md](/docs/templates/decision.md). Cap: 100 lines.

**Read [systems.md](/docs/systems.md) and [interfaces/](/docs/interfaces) first** unless you need how a choice was reached.

App-local decisions:

| App | Path                                                 |
| --- | ---------------------------------------------------- |
| API | [apps/api/docs/decisions/](/apps/api/docs/decisions) |
| Web | [apps/web/docs/decisions/](/apps/web/docs/decisions) |

Long-form historical text (gitignored): `.local/docs-quarry/decisions-longform/`.

## Classification

| Kind                   | Records                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Boundary (this folder) | D1, D3, D4, D10–D15, D18–D20, D22–D24, D27–D31, D33, D45, D46, D47, D48 |
| Local → API            | D2, D5–D9, D16, D17, D25, D26, D32                                      |
| Local → Web            | D21                                                                     |

## Index (boundary)

| Record                                                                   | One line                                            | Interface                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)                   | API owns Discord announce; bot never writes         | [discord-sensor](/docs/interfaces/discord-sensor.md)               |
| [D3](/docs/decisions/D3-Audience-Policy-Model.md)                        | One audience-policy engine                          | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D4](/docs/decisions/D4-Scoped-Body-Cache.md)                            | No per-viewer body cache                            | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md)                | Workstation durable backups                         | [actions-releases](/docs/interfaces/actions-releases.md)           |
| [D11](/docs/decisions/D11-Live-Authority-At-The-Boundary.md)             | JWT identity only; live authority                   | [live-authority](/docs/interfaces/live-authority.md)               |
| [D12](/docs/decisions/D12-Scope-Predicate-At-The-Session.md)             | Audience predicate on session                       | [session-audience](/docs/interfaces/session-audience.md)           |
| [D13](/docs/decisions/D13-One-Gate-System-Three-Shapes.md)               | One gate system                                     | [live-authority](/docs/interfaces/live-authority.md)               |
| [D14](/docs/decisions/D14-Ownership-Is-Code-Override-Is-Declared.md)     | Ownership in code; overrides declared               | [live-authority](/docs/interfaces/live-authority.md)               |
| [D15](/docs/decisions/D15-Denial-Is-Explicit.md)                         | Denied ≠ not-found                                  | [live-authority](/docs/interfaces/live-authority.md)               |
| [D18](/docs/decisions/D18-The-Member-Row-Is-The-Session.md)              | Member row is the session                           | [live-authority](/docs/interfaces/live-authority.md)               |
| [D19](/docs/decisions/D19-Machine-Principals.md)                         | Machine principals named                            | [discord-ingest](/docs/interfaces/discord-ingest.md)               |
| [D20](/docs/decisions/D20-One-Closed-Marker-Set.md)                      | Closed marker set                                   | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md)            | Renderers never know viewer                         | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md)          | One work table; out-of-band alerts                  | [work-queue-durability](/docs/interfaces/work-queue-durability.md) |
| [D24](/docs/decisions/D24-Media-Is-Linked-Not-Hosted.md)                 | Media linked, not hosted                            | [media-linked](/docs/interfaces/media-linked.md)                   |
| [D27](/docs/decisions/D27-One-Session-Per-Request.md)                    | One session per request                             | [session-audience](/docs/interfaces/session-audience.md)           |
| [D28](/docs/decisions/D28-One-Predicate-Over-Policy.md)                  | Listing is authz surface                            | [session-audience](/docs/interfaces/session-audience.md)           |
| [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md) | Owner/admin bypass rules                            | [live-authority](/docs/interfaces/live-authority.md)               |
| [D30](/docs/decisions/D30-Deletion-Is-Named-Per-Entity.md)               | Deletion named per entity                           | [live-authority](/docs/interfaces/live-authority.md)               |
| [D31](/docs/decisions/D31-No-Erasure-Anonymize-In-Place.md)              | Anonymize in place (provisional)                    | [live-authority](/docs/interfaces/live-authority.md)               |
| [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)    | Actions-only production releases                    | [actions-releases](/docs/interfaces/actions-releases.md)           |
| [D45](/docs/decisions/D45-Redaction-Keeps-Rough-Size.md)                 | Redaction keeps line count and rough size           | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D46](/docs/decisions/D46-Hide-Action-Reads-Markers-Client-Side.md)      | Hide action reads markers client-side (writes only) | [scoped-body](/docs/interfaces/scoped-body.md)                     |
| [D47](/docs/decisions/D47-Guest-Onboarding-And-Player-Promotion.md)      | New sign-ins are guests until character approval    | [live-authority](/docs/interfaces/live-authority.md)               |
| [D48](/docs/decisions/D48-Former-DMs-Retain-Owned-Quest-Management.md)   | Former DMs keep management of their owned quests    | [live-authority](/docs/interfaces/live-authority.md)               |
