# Map, location and region admission

**Status:** accepted design. Published schema/config and comment scaffolds do not implement these contracts. Runtime enforcement remains pending the owning implementation tasks and their tests.

**Superseded by owner-decisions C3 / N5 (2026-10-18):** Squashed product schema is **pointcrawl-only**. No `hexes`, `hex_edges`, `hex_entry_links`, `pois`, `hex_changes`, `HexEditInput`, `mapView`, or `quest_hexes`. Quest↔map association uses pointcrawl junction rows (**N5**). See [migrations.md](/apps/api/docs/design/graphql-product/migrations.md).

Pattern is aggregate commands with consumer-owned admission interfaces. One shared Document location predicate; Spatial does not reinterpret Document policy.

## Map create and geometry (C3)

`MapCreate` for pointcrawl permits null `regionId`. Optional `cols` and `rows` are metadata only (1..1000 when supplied); **no hex grid or synthesized tiles** are created. A regionless map admits only admin/configured-owner writes. When `regionId` is supplied, the region must be current and live. `assetPath` is nullable, at most 2048 characters; supplied paths are root-relative single-slash or HTTPS URL. Reject userinfo, `javascript:` schemes, backslashes, and `..` path segments. The API never fetches asset URLs.

Pointcrawl node coordinates accept every finite `float64` representable by PostgreSQL. Pointcrawl edge `kind` is trimmed nonempty text up to 64 characters; `label` is nullable up to 200. Undirected endpoint order for storage is public UUID ascending; directed order is the exact input.

## Submap containment

A submap must be an existing distinct map. Actor stewardship applies to both maps. One Map-owned containment lock guards all **pointcrawl node** submap mutations and cycle checks. SPA04 `ContainmentWriter.LockContainment(ctx)` takes the transaction advisory lock for `hashtextextended('chronicler:map-containment',0)`. Every node submap mutation takes this lock before Document or Map row locks, reads the current directed containment graph through set SQL, and rejects a new cycle. Source/target UUIDs are locked in ascending order after admission. SPA06 invokes this provider in the same business transaction.

## Document location admission

Document `LocationAdmissionReader.AdmitLocationLink(ctx, actor, documentID, targetRegionID)` locks the Document before the Map row for location links and returns the exact existing linked-region set plus the admitted target. W01 binds it to the same transaction. DOC04 owns the query and canonical location policy; DOC06 uses the same admission for Document location mutations. The document must be a non-deleted Locations entry. If unlinked, target-region stewardship admits an assigned archon. If already linked, its owning region must equal the target; D7's declared admin/configured-owner bypass remains explicit and audited. An author alone is insufficient. Location region derives from existing owning links, not a new `Document.region` column. Pointcrawl link commands call this provider before locking their target Map.

Pointcrawl `relation` for entry links is exactly `location` or `subject` per the typed link model; `location` retains strict one-to-one through partial unique indexes. Duplicate exact link with a new command key is CONFLICT. Unlink of an absent exact identity is a no-op plus receipt.

## Regions and assignments

RegionInput is full replacement, but `updateRegion` requires `kind` equal to the stored kind. `transitionRegion` owns lifecycle changes. `charterDeadline` may be null or supplied for any existing kind. Delete soft-tombstones only when no active referencing map, Character, or quest-region relationship exists; otherwise CONFLICT without moving foreign data. Inactive references remain. Repeated deletion and restore of active rows are no-ops.

Archon assignment requires admin or configured owner and a current active archon target, otherwise INVALID. New-key duplicate assign returns original immutable assignment plus a new receipt, zero duplicate rows. Revoke absent is a no-op plus receipt. Character ownership exceptions remain unchanged.

## Ownership

P04 owns schema/index additions for pointcrawl and region/map columns at squash time. SPA04 owns containment and assignment persistence. DOC04 owns location admission. SPA06 and DOC06 own validation/application. S04 must add exact cases for null/supplied pointcrawl metadata, regionless authority, path rejection, finite coordinate extremes, cycle A→B→C→A under concurrency, category Lore denial versus Locations overlay, kind-edit rejection, assignment duplicate/no-op, and active-reference deletion.

---

## Legacy hex grid (not squashed authority)

Pre-cutover mounted schema and QA fixtures may still contain hexgrid maps and `HexEditInput`-era prose in older acceptance JSON. **Do not treat hex terrain/edge/POI DDL or `ResolveQuestHexIDs` → `quest_hexes` as product authority.** Implement **A1** from [migrations.md](/apps/api/docs/design/graphql-product/migrations.md) inventory only.
