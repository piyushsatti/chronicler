# Field routing (old GraphQL → Go `/v1`)

Rule: [D40](../../apps/api/docs/decisions/D40-GraphQL-Versus-REST.md).
Version lives in the path. Names drop the `V2` suffix.

Legend: **GQL** = `/v1/graphql`, **REST** = path under `/v1`, **DROP** = not ported.

## Queries

| Old field                        | New                           | Transport                                            | Notes                                     |
| -------------------------------- | ----------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| memberMe                         | memberMe                      | REST `GET /v1/members/me`                            | Fixed self lookup                         |
| member                           | member                        | GQL                                                  | Nested profile trees                      |
| members                          | members                       | GQL                                                  | Directory with filters                    |
| memberRoleHistory                | memberRoleHistory             | REST `GET /v1/members/{id}/role-history`             | Fixed ledger                              |
| memberActivityStats              | memberActivityStats           | GQL                                                  | Nested under member screens               |
| memberByDiscordId                | memberByDiscordId             | REST `GET /v1/members/by-discord/{discordId}`        | Fixed lookup                              |
| memberProfile                    | memberProfile                 | GQL                                                  | Nested community card                     |
| communityDirectory               | communityDirectory            | GQL                                                  | Nested page                               |
| pendingDmProfileVerifications    | pendingDmProfileVerifications | GQL                                                  | Nested verifier queue                     |
| myAvailability                   | myAvailability                | REST `GET /v1/me/availability`                       | Fixed                                     |
| memberAvailability               | memberAvailability            | REST `GET /v1/members/{id}/availability`             | Fixed                                     |
| openQuestSeats                   | openQuestSeats                | GQL                                                  | Nested seats + regions                    |
| myPersonalizationV2              | myPersonalization             | GQL                                                  | After `POST .../reconcile`                |
| unlockablesCatalog               | unlockablesCatalog            | REST `GET /v1/unlockables`                           | Fixed catalog                             |
| document                         | document                      | GQL                                                  | Nested body/links                         |
| documentById                     | documentById                  | GQL                                                  | Nested                                    |
| documents                        | documents                     | GQL                                                  | Nested list                               |
| documentBacklinks                | documentBacklinks             | GQL                                                  | Nested                                    |
| documentRevisions                | documentRevisions             | REST `GET /v1/documents/{id}/revisions`              | Fixed privileged                          |
| documentsTrash                   | documentsTrash                | REST `GET /v1/documents/trash`                       | Fixed admin                               |
| previewBodyAs                    | previewBody                   | REST `POST /v1/documents/preview-body`               | Stateless command-shaped                  |
| codexDirectory                   | codexDirectory                | GQL                                                  | Nested                                    |
| codexEntry                       | codexEntry                    | GQL                                                  | Nested                                    |
| codexCategories                  | codexCategories               | GQL                                                  | Nested                                    |
| lieutenantAssignments            | lieutenantAssignments         | REST `GET /v1/lieutenants`                           | Fixed                                     |
| map                              | map                           | GQL                                                  | Nested hexes/edges (SQL-paged)            |
| mapView                          | mapView                       | GQL                                                  | Nested places                             |
| maps                             | maps                          | GQL                                                  | Nested                                    |
| hex                              | hex                           | GQL                                                  | Nested links                              |
| hexHistory                       | hexHistory                    | REST `GET /v1/hexes/{id}/history`                    | Fixed                                     |
| recentHexChanges                 | recentHexChanges              | REST `GET /v1/hex-changes`                           | Fixed feed                                |
| poisForHex                       | poisForHex                    | REST `GET /v1/hexes/{id}/pois`                       | Fixed                                     |
| regionsV2                        | regions                       | GQL                                                  | Nested                                    |
| regionCounts                     | regionCounts                  | REST `GET /v1/regions/{id}/counts`                   | Fixed aggregate                           |
| regionActivity                   | regionActivity                | REST `GET /v1/maps/{atlasCode}/activity`             | Fixed aggregate                           |
| gameDate                         | gameDate                      | REST `GET /v1/time/game-date`                        | Pure lookup                               |
| realDate                         | realDate                      | REST `GET /v1/time/real-dates`                       | Pure lookup                               |
| timeAnchors                      | timeAnchors                   | REST `GET /v1/time/anchors`                          | Admin fixed                               |
| archonAssignments                | archonAssignments             | REST `GET /v1/archons`                               | Admin fixed                               |
| charactersV2                     | characters                    | GQL                                                  | Nested                                    |
| pendingCharacterVerifications    | pendingCharacterVerifications | REST `GET /v1/characters/pending-verifications`      | Fixed queue                               |
| characterVerificationHistory     | characterVerificationHistory  | REST `GET /v1/characters/{id}/verification-history`  | Fixed                                     |
| backstoriesV2                    | backstories                   | REST `GET /v1/backstories`                           | Fixed catalog                             |
| myCharactersV2                   | myCharacters                  | GQL                                                  | Nested                                    |
| characterV2                      | character                     | GQL                                                  | Nested                                    |
| creationCatalog                  | creationCatalog               | REST `GET /v1/creation-catalog`                      | Fixed                                     |
| characterProgressionV2           | —                             | DROP                                                 | Alias of ledger                           |
| characterProgressionLedger       | characterProgression          | REST `GET /v1/characters/{id}/progression`           | Sole name                                 |
| characterLogs                    | characterLogs                 | REST `GET /v1/characters/{id}/logs`                  | Fixed                                     |
| downtimeProjects                 | downtimeProjects              | REST `GET /v1/characters/{id}/downtime-projects`     | Fixed                                     |
| coPlayersV2                      | coPlayers                     | REST `GET /v1/characters/{id}/co-players`            | Fixed                                     |
| characterSummariesV2             | characterSummaries            | REST `GET /v1/characters/{id}/summaries`             | Fixed list                                |
| questParticipationsByCharacterV2 | participationsByCharacter     | REST `GET /v1/characters/{id}/participations`        | Fixed                                     |
| searchV2                         | search                        | GQL                                                  | Nested hits                               |
| searchableKinds                  | searchableKinds               | REST `GET /v1/search/kinds`                          | Static                                    |
| homeV2                           | home                          | GQL                                                  | Nested buckets; no empty questBoard field |
| siteStatsV2                      | siteStats                     | REST `GET /v1/stats`                                 | Fixed aggregate                           |
| gameCalendarV2                   | gameCalendar                  | REST `GET /v1/calendar`                              | Fixed                                     |
| questV2                          | quest                         | GQL                                                  | Nested tree                               |
| questsV2                         | quests                        | GQL                                                  | Nested                                    |
| questGenreOptions                | questGenreOptions             | REST `GET /v1/quests/genre-options`                  | Static                                    |
| questBoardV2                     | questBoard                    | GQL                                                  | Nested                                    |
| recentlyClosedQuestsV2           | recentlyClosedQuests          | GQL                                                  | Nested                                    |
| myQuestSignupsV2                 | myQuestSignups                | REST `GET /v1/me/quest-signups`                      | Fixed roster                              |
| questArcsV2                      | questArcs                     | GQL                                                  | Nested                                    |
| questArcV2                       | questArc                      | GQL                                                  | Nested                                    |
| questSummariesV2                 | questSummaries                | REST `GET /v1/quests/{id}/summaries`                 | Fixed                                     |
| questStateCountsV2               | questStateCounts              | REST `GET /v1/quests/state-counts`                   | Fixed aggregate                           |
| dmStatsV2                        | dmStats                       | REST `GET /v1/members/{id}/dm-stats`                 | Fixed                                     |
| dmSessionHistoryV2               | dmSessionHistory              | REST `GET /v1/members/{id}/dm-sessions`              | Fixed                                     |
| dmSummaries                      | dmSummaries                   | REST `GET /v1/dm-summaries`                          | Fixed                                     |
| isFollowing                      | isFollowing                   | REST `GET /v1/me/following/{id}`                     | Fixed                                     |
| myRequests                       | myRequests                    | REST `GET /v1/me/requests`                           | Fixed                                     |
| discordDeliveryMode              | discordDeliveryMode           | REST `GET /v1/config/discord-delivery-mode`          | Static                                    |
| homeBanner                       | homeBanner                    | REST `GET /v1/site-settings/home-banner`             | Static                                    |
| questAnnouncementRoleSetting     | questAnnouncementRoleSetting  | REST `GET /v1/site-settings/quest-announcement-role` | Static                                    |
| myNotifications                  | myNotifications               | GQL                                                  | After acknowledge command                 |
| myUnreadNotificationCount        | myUnreadNotificationCount     | REST `GET /v1/me/notifications/unread-count`         | Fixed                                     |
| adminCharacterDirectoryV2        | adminCharacterDirectory       | GQL                                                  | Nested admin tree                         |
| adminOperationsV2                | adminOperations               | GQL                                                  | Nested admin tree                         |

## Reads that write (become commands)

| Old field                               | Command                                                 | Then                    |
| --------------------------------------- | ------------------------------------------------------- | ----------------------- |
| myNotifications (mark suppressed read)  | REST `POST /v1/me/notifications/acknowledge-suppressed` | GQL `myNotifications`   |
| myPersonalizationV2 (reconcile unlocks) | REST `POST /v1/me/personalization/reconcile`            | GQL `myPersonalization` |

## Mutations → REST commands

| Old field                      | New path                                            |
| ------------------------------ | --------------------------------------------------- |
| setMemberRoles                 | `PUT /v1/members/{id}/roles`                        |
| setMemberRolesBatch            | `POST /v1/members/roles:batch`                      |
| updateMyProfile                | `PATCH /v1/me/profile`                              |
| updateMyDmProfile              | `PATCH /v1/me/dm-profile`                           |
| setMyAvailabilityV2            | `PUT /v1/me/availability`                           |
| submitDmProfileForVerification | `POST /v1/me/dm-profile/submit`                     |
| decideDmProfileVerification    | `POST /v1/dm-profiles/{memberId}/decide`            |
| grantUnlock                    | `POST /v1/members/{id}/unlocks`                     |
| equipCosmetic                  | `POST /v1/me/cosmetics/equip`                       |
| updateMySettings               | `PATCH /v1/me/settings`                             |
| upsertUnlockable               | `POST /v1/unlockables`                              |
| setUnlockableActive            | `PATCH /v1/unlockables/{id}/active`                 |
| createDocument                 | `POST /v1/documents`                                |
| updateDocument                 | `PATCH /v1/documents/{id}`                          |
| publishDocument                | `POST /v1/documents/{id}/publish`                   |
| unpublishDocument              | `POST /v1/documents/{id}/unpublish`                 |
| editPublishedDocument          | `PATCH /v1/documents/{id}/published`                |
| setDocumentVisibility          | `PUT /v1/documents/{id}/visibility`                 |
| deleteDocument                 | `DELETE /v1/documents/{id}`                         |
| restoreDocument                | `POST /v1/documents/{id}/restore`                   |
| assignLieutenant               | `POST /v1/lieutenants`                              |
| revokeLieutenant               | `DELETE /v1/lieutenants`                            |
| createMap                      | `POST /v1/maps`                                     |
| updateHex                      | `PATCH /v1/hexes/{id}`                              |
| upsertPoi                      | `PUT /v1/hexes/{hexId}/pois`                        |
| setHexEdge                     | `PUT /v1/maps/{mapId}/edges`                        |
| linkHexEntry                   | `POST /v1/hexes/{id}/links`                         |
| unlinkHexEntry                 | `DELETE /v1/hexes/{id}/links`                       |
| createRegion                   | `POST /v1/regions`                                  |
| updateRegion                   | `PATCH /v1/regions/{id}`                            |
| transitionRegion               | `POST /v1/regions/{id}/transition`                  |
| assignArchon                   | `POST /v1/archons`                                  |
| revokeArchon                   | `DELETE /v1/archons`                                |
| createTimeAnchor               | `POST /v1/time/anchors`                             |
| updateTimeAnchor               | `PATCH /v1/time/anchors/{id}`                       |
| updateGameCalendar             | `PUT /v1/calendar`                                  |
| createCharacterV2              | `POST /v1/characters`                               |
| adjustPcxp                     | `POST /v1/characters/{id}/pcxp`                     |
| submitForVerification          | `POST /v1/characters/{id}/submit-verification`      |
| retireCharacter                | `POST /v1/characters/{id}/retire`                   |
| decideVerification             | `POST /v1/characters/{id}/decide-verification`      |
| setCharacterGuild              | `PATCH /v1/characters/{id}/guild`                   |
| updateCharacterProfileV2       | `PATCH /v1/characters/{id}/profile`                 |
| syncCharacterDdb               | `POST /v1/characters/{id}/ddb-sync`                 |
| logCharacterEvent              | `POST /v1/characters/{id}/logs`                     |
| upsertDowntimeProject          | `PUT /v1/characters/{id}/downtime-projects`         |
| upsertCreationCatalogEntry     | `PUT /v1/admin/creation-catalog`                    |
| createBackstory                | `POST /v1/admin/backstories`                        |
| updateBackstory                | `PATCH /v1/admin/backstories/{id}`                  |
| createQuestV2                  | `POST /v1/quests`                                   |
| updateQuestV2                  | `PATCH /v1/quests/{id}`                             |
| transitionQuestStatusV2        | `POST /v1/quests/{id}/transition`                   |
| cancelQuestV2                  | DROP (use transition → cancelled)                   |
| closeQuestV2                   | `POST /v1/quests/{id}/close`                        |
| upsertQuestSummaryV2           | `PUT /v1/quest-summaries`                           |
| upsertQuestArcV2               | `PUT /v1/quest-arcs`                                |
| removeQuestFromArcV2           | `POST /v1/quests/{id}/remove-from-arc`              |
| setQuestHexesV2                | `PUT /v1/quests/{id}/hexes`                         |
| signupForQuest                 | `POST /v1/quests/{id}/signup`                       |
| withdrawFromQuest              | `POST /v1/quests/{id}/withdraw`                     |
| selectQuestParticipantV2       | `POST /v1/quests/{id}/participants/select`          |
| attestQuestParticipationV2     | `POST /v1/quests/{id}/participants/attest`          |
| announceQuestV2                | DROP (desired-state + sync)                         |
| syncQuestDiscordV2             | `POST /v1/quests/{id}/discord/sync`                 |
| followPerson                   | `PUT /v1/me/following/{id}`                         |
| unfollowPerson                 | `DELETE /v1/me/following/{id}`                      |
| createRequest                  | `POST /v1/me/requests`                              |
| upsertHomeBanner               | `PUT /v1/site-settings/home-banner`                 |
| setQuestAnnouncementRole       | `PUT /v1/site-settings/quest-announcement-role`     |
| markNotificationsRead          | `POST /v1/me/notifications/read`                    |
| redriveDiscordDeliveryV2       | `POST /v1/admin/discord-deliveries/{jobId}/redrive` |

## Machine routes (not in old GraphQL)

| Path                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `POST /v1/ingest/discord-event` | Bot activity observations |
| `POST /v1/ingest/heartbeat`     | Bot heartbeat             |
| `POST /v1/agent/questions`      | Submit agent question     |
| `GET /v1/agent/questions/{id}`  | Poll question result      |
| `GET /auth/discord`             | OAuth redirect            |
| `POST /auth/discord/callback`   | OAuth code → JWT          |
| `GET /health`                   | Liveness                  |
