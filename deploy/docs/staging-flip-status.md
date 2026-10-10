# Staging strangler flip status

Caddy changes on the droplet are manual; this file tracks **in-repo readiness** only.

| Slice | Go paths ready | Staging Caddy flipped |
| --- | --- | --- |
| document | Yes — `/v1/documents/*` revisions + trash; GraphQL document/codex/backlinks | Pending operator |
| quest | Yes — transition, close, signup; GraphQL quest tree + participants | Pending operator |
| member | Yes — directory REST + GQL `members`/`memberProfile`; me + reconcile/ack stubs | Pending operator |
| site | Yes — `/v1/stats`, `/v1/search/kinds`; GraphQL home/search | Pending operator |
| spatial | Yes — time + hex/region/map REST; GQL `mapView`/`hex`/maps/regions | Pending operator |
| character | Yes — GQL reads + progression/logs/verification REST | Pending operator |
| ingest/agent | Yes — persist + agent complete route; run `apps/agent` worker for async | Pending operator |

Update [strangler.md](./strangler.md) on the droplet when a row moves to flipped.
