# Product API breaking changes

Status: accepted contract; backend implementation and frontend migration are separate. No apps/web code is changed by backend contract publication.

All product REST reads and commands move to POST /v1/graphql. Existing REST adapters require a separate migration after the backend is verified. [Field routing](/packages/contracts/field-routing.md) names every original operation and its replacement. Authentication, health, sensor and agent protocols remain HTTP.

## Removed fields

| Field                                      | Reason                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DirectoryEntryType.lookingToPlay           | No source or accepted product meaning. Retired under breaking product cutover.                                                                                         |
| SiteStatsV2Type.totalDirectors             | No documented role/identity or producer. Retired under breaking product cutover.                                                                                       |
| SiteStatsV2Type.beginnerFriendlyQuestCount | No documented classifier or producer. Retired under breaking product cutover.                                                                                          |
| SiteStatsV2Type.monthsOfHistory            | No documented baseline/window or producer. Retired under breaking product cutover.                                                                                     |
| QuestSummaryTotalsV2Type.itemGrants        | Unsupported retained item-to-quest provenance and PCXP-only closure. This does not classify historical items as cosmetic and does not retire achievements or DM tiers. |
| DocumentDraftInput.slug                    | Canonical server title allocator owns ordinary slug; trusted Quest/summary identity slugs remain owning flows. No replacement client grammar.                          |

home.questBoard is removed; clients use the questBoard root. Read queries no longer acknowledge suppressed notifications or reconcile unlocks. Explicit commands own those effects. Notification pagination requires authenticated opaque member/filter-bound cursors.

Telemetry amount/sum fields preserve fractional stored values as Float. Genuine counts remain Int. Optional provenance and missing linked references are nullable; no fake timestamps or identities replace unknown history. Mutation calls require CommandMeta.idempotencyKey and matching replay uses the stored receipt under current authority. Patch inputs distinguish omission from explicit null. Date/Time/DateTime/JSON and UUID codecs follow the shared transport contract. Document slugs are server allocated. Cosmetic equip/reconcile endpoints retire; admin-only achievement/DM-tier grants remain.

## Retired unused types

These old unused shapes are removed from SDL; any fragment or generated type referring to them requires regeneration.

| Type                             | Reason                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QuestAnnounceOutcomeV2Type       | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| QuestBoardEntryType              | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| QuestDiscordSyncLegOutcomeV2Type | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| QuestDiscordSyncLegStateV2       | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| QuestDiscordSyncOutcomeV2Type    | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| QuestRewardV2Input               | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| RegionArchonAssignmentsType      | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
| UnknownReason                    | No reachable field references; asyncDeliveryReceipt and PCXP CloseQuestInput replace obsolete announce/sync/reward shapes; no homequestboard stub or unusedtaxonomyplaceholder exposed |
