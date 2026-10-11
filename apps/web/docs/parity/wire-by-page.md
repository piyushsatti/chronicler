# Wire by page (skeleton)

Derived from legacy `app/api/queries/*` and `app/hooks/*`. Rows marked **TBD** until feature tasks land.

## Core and quests

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/` | `HomeBuckets`, `HomeWarRoom`, `GET /v1/stats` | — | — | T310-feat-home |
| `/quests` | `QuestBoard` | — | — | T311-feat-quest |
| `/quests/:code` | `Quest`, participations, discord delivery | signup, transition, close | quest, board | T311-feat-quest |
| `/quests/:code/summary` | `QuestSummaryPage` | — | — | T311-feat-quest |

## Characters and community

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/characters` | character directory queries | — | — | T312-feat-character |
| `/characters/:code` | `Character`, progression, logs | profile, verification | character | T312-feat-character |
| `/community`, `/players`, `/dms` | `CommunityDirectory`, member lists | — | — | T313-feat-community |
| `/players/:shortCode`, `/dms/:shortCode` | profile hooks | social requests | profiles | T313-feat-community |
| `/community/dm-table/:slug` | `loadDmTableBySlug` + `loadCommunityHub` + `loadDmTableSchedule` (questBoard filter by dm handle) | none (read-only) | document / communityHub / questBoard | T313 + FINAL-GAPS |

## Codex and regions

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/codex` | codex directory | — | — | T314-feat-codex |
| Typed `/codex/*`, `/npcs*`, `/factions*` | `useCodexDetailDocument`, guards | editor mutations | codex caches | T314-feat-codex |
| `/regions/:slug`, `/codex/region/:slug` | region + map viewport | — | map | T315-feat-map |

## Chronicles and summaries

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/chronicles` | chronicle list | — | — | T316-feat-chronicle |
| `/chronicles/:id` | chronicle detail | — | — | T316-feat-chronicle |
| `/summaries/:slug` | summary document | — | — | T316-feat-chronicle |

## Rules, search, misc

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/rules` | rules hub | — | — | T317-feat-rules |
| `/rules/guides/:id`, `/rules/rulings/:id` | guide/ruling detail | editor paths | rules | T317-feat-rules |
| `/search` | `Search`, kinds REST | — | — | T319-feat-search |
| `/welcome`, `/settings`, `*` | page-local | settings mutations | — | T318-feat-misc-pages |

## Auth and account

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/login`, `/auth/callback` | OAuth | JWT | me | T410-auth-plumbing |
| `/me`, `/notifications`, `/me/personalize` | me, notifications | read/mark, personalize | member caches | T411–T413 |

## Admin, editors, gallery

| Route | Reads | Writes | Invalidations | Owner task |
| --- | --- | --- | --- | --- |
| `/admin/*` | admin operations panels | panel mutations | admin | T610–T618 |
| `/editor/*`, `/quests/new`, codex editors | editor workspace | document CRUD | editor | T510–T514 |
| `/gallery` | gallery entries | — | — | T619-admin-gallery |
