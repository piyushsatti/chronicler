# Staging strangler flip status

This file lists registered Go surfaces, not proven capability parity or a verified live flip. Existing staging/proxy state remains unverified. Update the repository routing record after an authorized staging change; any production activation or rollback follows [actions-releases](/docs/interfaces/actions-releases.md). Current `deploy-api` only publishes images and is not a route-activation workflow.

| Slice        | Registered Go paths                                                                                                                | Staging flip evidence |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| document     | Present — `/v1/documents/*` revisions + trash; GraphQL document/codex/backlinks                                                    | Unverified            |
| quest        | Present — transition, close, signup; GraphQL quest tree + participants                                                             | Unverified            |
| member       | Present — directory REST + GQL `members`/`memberProfile`; me + reconcile/ack stubs                                                 | Unverified            |
| site         | Present — `/v1/stats`, `/v1/search/kinds`; GraphQL home/search                                                                     | Unverified            |
| spatial      | Present — time + hex/region/map REST; GQL `mapView`/`hex`/maps/regions                                                             | Unverified            |
| character    | Present — GQL reads + progression/logs/verification REST                                                                           | Unverified            |
| ingest/agent | Present — submit/claim/complete HTTP path; run `apps/agent` + Archive compose ([agent-qa-http](/docs/interfaces/agent-qa-http.md)) | Unverified            |

Record unit, integration, contract and staging parity evidence before declaring a slice ready. Keep [strangler routing](/deploy/docs/strangler.md) updated in this repository; a route file or registered endpoint alone does not prove functional completeness. This record authorizes no host edits or production changes.
