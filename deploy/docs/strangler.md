# Strangler routing (staging)

Until P7, staging may run the old Python API beside Go. Caddy splits by path.

| Path prefix | Target when the slice is done |
| --- | --- |
| `/v1/stats`, `/v1/search/kinds`, `/v1/site-settings/*` | Go (`site`) |
| `/v1/members/*`, `/v1/me/*`, `/v1/unlockables/*` | Go (`member`) |
| `/v1/documents/*`, `/v1/lieutenants` | Go (`document`) |
| `/v1/maps/*`, `/v1/hexes/*`, `/v1/regions/*`, `/v1/time/*`, `/v1/calendar`, `/v1/archons` | Go (`spatial`) |
| `/v1/characters/*`, `/v1/backstories`, `/v1/creation-catalog` | Go (`character`) |
| `/v1/quests/*`, `/v1/quest-*` | Go (`quest`) |
| `/v1/ingest/*`, `/v1/agent/*` | Go (`ingest` / `agent`) |
| `/v1/graphql` | Go (once all GraphQL roots for flipped slices resolve) |
| `/auth/*`, `/health` | Go |
| Everything else | Old Python image (until removed) |

A slice flips only after its unit, integration, contract, and parity gates pass in staging.
