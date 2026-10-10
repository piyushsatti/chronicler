# Wire by page — backend readiness (skeleton)

Status values: `go-ready` | `msw-only` | `blocked`.

| Route | Status | Notes |
| --- | --- | --- |
| `/` | msw-only | `GET /v1/stats` + GraphQL home buckets in MSW |
| `/quests`, `/quests/:code` | msw-only | Quest REST signup/transition wired in MSW |
| `/characters/:code` | msw-only | Progression REST stub |
| `/codex`, typed codex paths | msw-only | GraphQL directory + entry fixtures |
| `/chronicles`, `/chronicles/:id` | msw-only | List/detail adapters on fixtures |
| `/rules`, guide/ruling detail | msw-only | Rules list fixture |
| `/community`, directories | msw-only | Community directory fixture |
| `/search` | msw-only | Search + kinds REST |
| `/me`, auth | partial | `GET /v1/members/me` live when API up; MSW fallback |
| `/admin`, `/admin/review` | msw-only | Admin GraphQL + pending verifications REST |
| Editor routes | blocked | Awaiting T510+ and Go document routes audit |
| `/gallery` | blocked | Admin-only; no public API slice in seedqa walkthrough yet |

Update this table each wave; link blocked rows to `backend-gap.md` tickets when opened.
