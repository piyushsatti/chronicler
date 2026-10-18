# GraphQL M1 cutover notes

**Date:** 2026-10-18  
**Decision:** [owner-decisions.md](../../../docs/audits/owner-decisions.md) **M1**, **C3**, **N5**, **E1**, **N3**, **N6**

## File mapping (legacy flat → domain)

| Legacy                                               | Domain                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `member.graphql`                                     | `member/types.graphql` (notification types → `notification/types.graphql`) |
| `member-operations.graphql`                          | `member/operations.graphql` (`extend type Query/Mutation`)                 |
| `document.graphql` / `document-operations.graphql`   | `document/`                                                                |
| `quest.graphql` / `quest-operations.graphql`         | `quest/`                                                                   |
| `spatial.graphql` / `spatial-operations.graphql`     | `spatial/` (hex SDL omitted; see below)                                    |
| `character.graphql` / `character-operations.graphql` | `character/`                                                               |
| `site.graphql` / `site-operations.graphql`           | `site/`                                                                    |
| `notification-operations.graphql`                    | `notification/operations.graphql`                                          |

Roots: `_roots.graphql` replaces `type Query` / `type Mutation` formerly in `member-operations.graphql`.

Shared unchanged at repo root of `graphql/`: `scalars.graphql`, `commands.graphql`, `product-reads.graphql`.

## C3 hex omissions in `spatial/`

Removed from contract SDL (backend/web must drop usage separately):

- Types: `HexType`, `HexEdgeType`, `HexChangeType`, `HexEntryLinkType`, `MapPlaceType`, `MapViewType`, `PoiType`
- Map fields: `cols`, `rows`, `hexes`, `edges` on `MapType`
- Queries: `mapView`, `hex`, `hexHistory`, `recentHexChanges`, `poisForHex`
- Mutations: `updateHex`, `upsertPoi`, `setHexEdge`, `linkHexEntry`, `unlinkHexEntry`
- Pages: `HexChangePage`, `PoiPage` in `product-reads.graphql`
- `RegionCountsType.hexCount` → `pointcrawlNodeCount`
- Shared `commands.graphql` hex/map-grid inputs (`HexEditInput`, `HexEdgeInput`, `PoiInput`, map `cols`/`rows`)

## N5 quest ↔ pointcrawl (2026-10-18)

Replaced quest hex SDL:

- `QuestHexType` / `QuestHexInput` / `setQuestHexes` / `Quest.hexes` → `QuestPointcrawlLinkType`, `QuestPointcrawlLinkInput`, `setQuestPointcrawlLinks`, `Quest.pointcrawlLinks`
- Summary derived `hexes` → `pointcrawlNodes` (`SummaryPointcrawlNodeType`)

## E1 / N3 contract cuts (2026-10-18)

- **E1:** Removed entitlement bank SDL (`QuestRewardEntitlementType`, `myQuestRewards`, `claimQuestRewards`, `rewardEntitlements`, claim enums/receipts). Quest close uses progression ledger only.
- **N3:** Removed follow/request SDL (`isFollowing`, `myRequests`, `dmRequests`, `followPerson`, `unfollowPerson`, `createRequest`, `decideRequest`, `RequestType`, `RequestPage`, `notifyDmRequestDecided` setting).
- **N6:** `SiteStatsType.totalHexes` removed (prior 9B pass).

## gqlgen (apps/api)

After M1 SDL, `gqlgen generate` (v0.17.78) runs clean with `follow-schema` layout: `operations.resolvers.go`, `types.resolvers.go`, and `_roots.resolvers.go` (artifact from `_roots.graphql`).

Go **ignores** `_*.go`. Compiled root wiring and `_contractLayoutStub` live in **`apps/api/internal/graph/roots.resolvers.go`** (hand-maintained; re-check after each `gqlgen generate`).

Spatial hex/mapView resolvers removed from config; pointcrawl nested field resolvers still stub/panic until backend plan 03.

## Follow-ups

- **Pointcrawl** nested field resolvers still stub/panic until backend plan 03.
- **gqlgen regen** when generation-order prerequisites exist (do not hand-edit `generated.go`).
- **Endpoint review baseline** — bulk fingerprint drift (~293 inputs); refresh when re-running [endpoint-review.md](../../../apps/api/docs/endpoint-review.md), not graphql-only.
- **Web** adapter query strings (L1) when adopting `@pi/contracts`.
- **field-routing.md** REST identity rows toward **D40** DROP for retired product commands.
