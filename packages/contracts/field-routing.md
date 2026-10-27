# Product field routing

Status: accepted breaking contract; runtime route removal and new GraphQL behavior remain pending. [D40](/apps/api/docs/decisions/D40-GraphQL-Versus-REST.md) replaces the old fixed-read/command REST rule. All164 business roots are declared in split SDL.

## Original operation dispositions

Every original identity remains accounted for. Retained HTTP protocol paths keep their existing authentication/error behavior. Product REST paths are removed only by their scheduled implementation owners.

| Identity            | Original operation                                  | Accepted destination                                | Criterion |
| ------------------- | --------------------------------------------------- | --------------------------------------------------- | --------- |
| current-graphql-001 | `member`                                            | GraphQL Query.member                                | OP-001    |
| current-graphql-002 | `members`                                           | GraphQL Query.members                               | OP-002    |
| current-graphql-003 | `memberActivityStats`                               | GraphQL Query.memberActivityStats                   | OP-003    |
| current-graphql-004 | `memberProfile`                                     | GraphQL Query.memberProfile                         | OP-004    |
| current-graphql-005 | `communityDirectory`                                | GraphQL Query.communityDirectory                    | OP-005    |
| current-graphql-006 | `pendingDmProfileVerifications`                     | GraphQL Query.pendingDmProfileVerifications         | OP-006    |
| current-graphql-007 | `openQuestSeats`                                    | GraphQL Query.openQuestSeats                        | OP-007    |
| current-graphql-008 | `myPersonalization`                                 | GraphQL Query.myPersonalization                     | OP-008    |
| current-graphql-009 | `document`                                          | GraphQL Query.document                              | OP-009    |
| current-graphql-010 | `documentById`                                      | GraphQL Query.documentById                          | OP-010    |
| current-graphql-011 | `documents`                                         | GraphQL Query.documents                             | OP-011    |
| current-graphql-012 | `documentBacklinks`                                 | GraphQL Query.documentBacklinks                     | OP-012    |
| current-graphql-013 | `codexDirectory`                                    | GraphQL Query.codexDirectory                        | OP-013    |
| current-graphql-014 | `codexEntry`                                        | GraphQL Query.codexEntry                            | OP-014    |
| current-graphql-015 | `codexCategories`                                   | GraphQL Query.codexCategories                       | OP-015    |
| current-graphql-016 | `map`                                               | GraphQL Query.map                                   | OP-016    |
| current-graphql-017 | `mapView`                                           | GraphQL Query.mapView                               | OP-017    |
| current-graphql-018 | `maps`                                              | GraphQL Query.maps                                  | OP-018    |
| current-graphql-019 | `hex`                                               | GraphQL Query.hex                                   | OP-019    |
| current-graphql-020 | `regions`                                           | GraphQL Query.regions                               | OP-020    |
| current-graphql-021 | `characters`                                        | GraphQL Query.characters                            | OP-021    |
| current-graphql-022 | `myCharacters`                                      | GraphQL Query.myCharacters                          | OP-022    |
| current-graphql-023 | `character`                                         | GraphQL Query.character                             | OP-023    |
| current-graphql-024 | `search`                                            | GraphQL Query.search                                | OP-024    |
| current-graphql-025 | `home`                                              | GraphQL Query.home                                  | OP-025    |
| current-graphql-026 | `quest`                                             | GraphQL Query.quest                                 | OP-026    |
| current-graphql-027 | `quests`                                            | GraphQL Query.quests                                | OP-027    |
| current-graphql-028 | `questBoard`                                        | GraphQL Query.questBoard                            | OP-028    |
| current-graphql-029 | `recentlyClosedQuests`                              | GraphQL Query.recentlyClosedQuests                  | OP-029    |
| current-graphql-030 | `questArcs`                                         | GraphQL Query.questArcs                             | OP-030    |
| current-graphql-031 | `questArc`                                          | GraphQL Query.questArc                              | OP-031    |
| current-graphql-032 | `myNotifications`                                   | GraphQL Query.myNotifications                       | OP-032    |
| current-graphql-033 | `adminCharacterDirectory`                           | GraphQL Query.adminCharacterDirectory               | OP-033    |
| current-graphql-034 | `adminOperations`                                   | GraphQL Query.adminOperations                       | OP-034    |
| mounted-http-001    | `GET /health`                                       | HTTP GET /health                                    | OP-035    |
| mounted-http-002    | `GET /auth/discord`                                 | HTTP GET /auth/discord                              | OP-036    |
| mounted-http-003    | `POST /auth/discord/callback`                       | HTTP POST /auth/discord/callback                    | OP-037    |
| mounted-http-004    | `GET /v1/members/me`                                | GraphQL Query.memberMe                              | OP-038    |
| mounted-http-005    | `POST /v1/ingest/discord-event`                     | HTTP POST /v1/ingest/discord-event                  | OP-039    |
| mounted-http-006    | `POST /v1/ingest/heartbeat`                         | HTTP POST /v1/ingest/heartbeat                      | OP-040    |
| mounted-http-007    | `POST /v1/agent/questions`                          | HTTP POST /v1/agent/questions                       | OP-041    |
| mounted-http-008    | `GET /v1/agent/questions/{id}`                      | HTTP GET /v1/agent/questions/{id}                   | OP-042    |
| mounted-http-009    | `POST /v1/agent/questions/claim`                    | HTTP POST /v1/agent/questions/claim                 | OP-043    |
| mounted-http-010    | `POST /v1/agent/questions/{id}/complete`            | HTTP POST /v1/agent/questions/{id}/complete         | OP-044    |
| mounted-http-011    | `POST /v1/agent/questions/{id}/renew`               | HTTP POST /v1/agent/questions/{id}/renew            | OP-045    |
| mounted-http-012    | `POST /v1/agent/questions/{id}/retry`               | HTTP POST /v1/agent/questions/{id}/retry            | OP-046    |
| mounted-http-013    | `POST /v1/quests`                                   | GraphQL Mutation.createQuest                        | OP-047    |
| mounted-http-014    | `POST /v1/quests/{id}/signup`                       | GraphQL Mutation.signupForQuest                     | OP-048    |
| mounted-http-015    | `POST /v1/quests/{id}/discord/sync`                 | GraphQL Mutation.syncQuestDiscord                   | OP-049    |
| mounted-http-016    | `POST /v1/quests/{id}/transition`                   | GraphQL Mutation.transitionQuestStatus              | OP-050    |
| mounted-http-017    | `POST /v1/quests/{id}/close`                        | GraphQL Mutation.closeQuest                         | OP-051    |
| mounted-http-018    | `GET /v1/me/notifications/unread-count`             | GraphQL Query.myUnreadNotificationCount             | OP-052    |
| mounted-http-019    | `POST /v1/me/notifications/read`                    | GraphQL Mutation.markNotificationsRead              | OP-053    |
| mounted-http-020    | `POST /v1/me/notifications/acknowledge-suppressed`  | GraphQL Mutation.acknowledgeSuppressedNotifications | OP-054    |
| mounted-http-021    | `POST /v1/me/personalization/reconcile`             | Retired                                             | OP-055    |
| mounted-http-022    | `GET /v1/stats`                                     | GraphQL Query.siteStats                             | OP-056    |
| mounted-http-023    | `GET /v1/search/kinds`                              | GraphQL Query.searchableKinds                       | OP-057    |
| mounted-http-024    | `GET /v1/time/game-date`                            | GraphQL Query.gameDate                              | OP-058    |
| mounted-http-025    | `GET /v1/members/by-discord/{discordId}`            | GraphQL Query.memberByDiscordId                     | OP-059    |
| mounted-http-026    | `GET /v1/members/{id}/role-history`                 | GraphQL Query.memberRoleHistory                     | OP-060    |
| mounted-http-027    | `GET /v1/members/{id}/availability`                 | GraphQL Query.memberAvailability                    | OP-061    |
| mounted-http-028    | `GET /v1/hexes/{id}/history`                        | GraphQL Query.hexHistory                            | OP-062    |
| mounted-http-029    | `GET /v1/regions/{id}/counts`                       | GraphQL Query.regionCounts                          | OP-063    |
| mounted-http-030    | `GET /v1/maps/{atlasCode}/activity`                 | GraphQL Query.regionActivity                        | OP-064    |
| mounted-http-031    | `GET /v1/characters/{id}/progression`               | GraphQL Query.characterProgression                  | OP-065    |
| mounted-http-032    | `GET /v1/characters/{id}/logs`                      | GraphQL Query.characterLogs                         | OP-066    |
| mounted-http-033    | `GET /v1/characters/{id}/verification-history`      | GraphQL Query.characterVerificationHistory          | OP-067    |
| mounted-http-034    | `GET /v1/time/real-dates`                           | GraphQL Query.realDates                             | OP-068    |
| mounted-http-035    | `POST /v1/graphql`                                  | HTTP POST /v1/graphql                               | OP-069    |
| mounted-http-036    | `GET /v1/documents/{id}/revisions`                  | GraphQL Query.documentRevisions                     | OP-070    |
| mounted-http-037    | `GET /v1/documents/trash`                           | GraphQL Query.documentsTrash                        | OP-071    |
| absent-http-001     | `DELETE /v1/archons`                                | GraphQL Mutation.revokeArchon                       | OP-072    |
| absent-http-002     | `DELETE /v1/documents/{id}`                         | GraphQL Mutation.deleteDocument                     | OP-073    |
| absent-http-003     | `DELETE /v1/hexes/{id}/links`                       | GraphQL Mutation.unlinkHexEntry                     | OP-074    |
| absent-http-004     | `DELETE /v1/lieutenants`                            | GraphQL Mutation.revokeLieutenant                   | OP-075    |
| absent-http-005     | `DELETE /v1/me/following/{id}`                      | **DROP** (N3 — no follow aggregate)                 | OP-076    |
| absent-http-006     | `GET /v1/archons`                                   | GraphQL Query.archonAssignments                     | OP-077    |
| absent-http-007     | `GET /v1/backstories`                               | GraphQL Query.backstories                           | OP-078    |
| absent-http-008     | `GET /v1/calendar`                                  | GraphQL Query.gameCalendar                          | OP-079    |
| absent-http-009     | `GET /v1/characters/pending-verifications`          | GraphQL Query.pendingCharacterVerifications         | OP-080    |
| absent-http-010     | `GET /v1/characters/{id}/co-players`                | GraphQL Query.coPlayers                             | OP-081    |
| absent-http-011     | `GET /v1/characters/{id}/downtime-projects`         | GraphQL Query.downtimeProjects                      | OP-082    |
| absent-http-012     | `GET /v1/characters/{id}/participations`            | GraphQL Query.participationsByCharacter             | OP-083    |
| absent-http-013     | `GET /v1/characters/{id}/summaries`                 | GraphQL Query.characterSummaries                    | OP-084    |
| absent-http-014     | `GET /v1/config/discord-delivery-mode`              | GraphQL Query.discordDeliveryMode                   | OP-085    |
| absent-http-015     | `GET /v1/creation-catalog`                          | GraphQL Query.creationCatalog                       | OP-086    |
| absent-http-016     | `GET /v1/dm-summaries`                              | GraphQL Query.dmSummaries                           | OP-087    |
| absent-http-017     | `GET /v1/hex-changes`                               | GraphQL Query.recentHexChanges                      | OP-088    |
| absent-http-018     | `GET /v1/hexes/{id}/pois`                           | GraphQL Query.poisForHex                            | OP-089    |
| absent-http-019     | `GET /v1/lieutenants`                               | GraphQL Query.lieutenantAssignments                 | OP-090    |
| absent-http-020     | `GET /v1/me/availability`                           | GraphQL Query.myAvailability                        | OP-091    |
| absent-http-021     | `GET /v1/me/following/{id}`                         | **DROP** (N3)                                       | OP-092    |
| absent-http-022     | `GET /v1/me/quest-signups`                          | GraphQL Query.myQuestSignups                        | OP-093    |
| absent-http-023     | `GET /v1/me/requests`                               | **DROP** (N3 — no dm_requests)                      | OP-094    |
| absent-http-024     | `GET /v1/members/{id}/dm-sessions`                  | GraphQL Query.dmSessionHistory                      | OP-095    |
| absent-http-025     | `GET /v1/members/{id}/dm-stats`                     | GraphQL Query.dmStats                               | OP-096    |
| absent-http-026     | `GET /v1/quests/genre-options`                      | GraphQL Query.questGenreOptions                     | OP-097    |
| absent-http-027     | `GET /v1/quests/state-counts`                       | GraphQL Query.questStateCounts                      | OP-098    |
| absent-http-028     | `GET /v1/quests/{id}/summaries`                     | GraphQL Query.questSummaries                        | OP-099    |
| absent-http-029     | `GET /v1/site-settings/home-banner`                 | GraphQL Query.homeBanner                            | OP-100    |
| absent-http-030     | `GET /v1/site-settings/quest-announcement-role`     | GraphQL Query.questAnnouncementRoleSetting          | OP-101    |
| absent-http-031     | `GET /v1/time/anchors`                              | GraphQL Query.timeAnchors                           | OP-102    |
| absent-http-032     | `GET /v1/unlockables`                               | GraphQL Query.unlockablesCatalog                    | OP-103    |
| absent-http-033     | `PATCH /v1/admin/backstories/{id}`                  | GraphQL Mutation.updateBackstory                    | OP-104    |
| absent-http-034     | `PATCH /v1/characters/{id}/guild`                   | GraphQL Mutation.setCharacterGuild                  | OP-105    |
| absent-http-035     | `PATCH /v1/characters/{id}/profile`                 | GraphQL Mutation.updateCharacterProfile             | OP-106    |
| absent-http-036     | `PATCH /v1/documents/{id}`                          | GraphQL Mutation.updateDocument                     | OP-107    |
| absent-http-037     | `PATCH /v1/documents/{id}/published`                | GraphQL Mutation.editPublishedDocument              | OP-108    |
| absent-http-038     | `PATCH /v1/hexes/{id}`                              | GraphQL Mutation.updateHex                          | OP-109    |
| absent-http-039     | `PATCH /v1/me/dm-profile`                           | GraphQL Mutation.updateMyDmProfile                  | OP-110    |
| absent-http-040     | `PATCH /v1/me/profile`                              | GraphQL Mutation.updateMyProfile                    | OP-111    |
| absent-http-041     | `PATCH /v1/me/settings`                             | GraphQL Mutation.updateMySettings                   | OP-112    |
| absent-http-042     | `PATCH /v1/quests/{id}`                             | GraphQL Mutation.updateQuest                        | OP-113    |
| absent-http-043     | `PATCH /v1/regions/{id}`                            | GraphQL Mutation.updateRegion                       | OP-114    |
| absent-http-044     | `PATCH /v1/time/anchors/{id}`                       | GraphQL Mutation.updateTimeAnchor                   | OP-115    |
| absent-http-045     | `PATCH /v1/unlockables/{id}/active`                 | GraphQL Mutation.setUnlockableActive                | OP-116    |
| absent-http-046     | `POST /v1/admin/backstories`                        | GraphQL Mutation.createBackstory                    | OP-117    |
| absent-http-047     | `POST /v1/admin/discord-deliveries/{jobId}/redrive` | GraphQL Mutation.redriveDiscordDelivery             | OP-118    |
| absent-http-048     | `POST /v1/archons`                                  | GraphQL Mutation.assignArchon                       | OP-119    |
| absent-http-049     | `POST /v1/characters`                               | GraphQL Mutation.createCharacter                    | OP-120    |
| absent-http-050     | `POST /v1/characters/{id}/ddb-sync`                 | GraphQL Mutation.syncCharacterDdb                   | OP-121    |
| absent-http-051     | `POST /v1/characters/{id}/decide-verification`      | GraphQL Mutation.decideVerification                 | OP-122    |
| absent-http-052     | `POST /v1/characters/{id}/logs`                     | GraphQL Mutation.logCharacterEvent                  | OP-123    |
| absent-http-053     | `POST /v1/characters/{id}/pcxp`                     | GraphQL Mutation.adjustPcxp                         | OP-124    |
| absent-http-054     | `POST /v1/characters/{id}/retire`                   | GraphQL Mutation.retireCharacter                    | OP-125    |
| absent-http-055     | `POST /v1/characters/{id}/submit-verification`      | GraphQL Mutation.submitForVerification              | OP-126    |
| absent-http-056     | `POST /v1/dm-profiles/{memberId}/decide`            | GraphQL Mutation.decideDmProfileVerification        | OP-127    |
| absent-http-057     | `POST /v1/documents`                                | GraphQL Mutation.createDocument                     | OP-128    |
| absent-http-058     | `POST /v1/documents/preview-body`                   | GraphQL Query.previewBody                           | OP-129    |
| absent-http-059     | `POST /v1/documents/{id}/publish`                   | GraphQL Mutation.publishDocument                    | OP-130    |
| absent-http-060     | `POST /v1/documents/{id}/restore`                   | GraphQL Mutation.restoreDocument                    | OP-131    |
| absent-http-061     | `POST /v1/documents/{id}/unpublish`                 | GraphQL Mutation.unpublishDocument                  | OP-132    |
| absent-http-062     | `POST /v1/hexes/{id}/links`                         | GraphQL Mutation.linkHexEntry                       | OP-133    |
| absent-http-063     | `POST /v1/lieutenants`                              | GraphQL Mutation.assignLieutenant                   | OP-134    |
| absent-http-064     | `POST /v1/maps`                                     | GraphQL Mutation.createMap                          | OP-135    |
| absent-http-065     | `POST /v1/me/cosmetics/equip`                       | Retired                                             | OP-136    |
| absent-http-066     | `POST /v1/me/dm-profile/submit`                     | GraphQL Mutation.submitDmProfileForVerification     | OP-137    |
| absent-http-067     | `POST /v1/me/requests`                              | **DROP** (N3)                                       | OP-138    |
| absent-http-068     | `POST /v1/members/roles:batch`                      | GraphQL Mutation.setMemberRolesBatch                | OP-139    |
| absent-http-069     | `POST /v1/members/{id}/unlocks`                     | GraphQL Mutation.grantUnlock                        | OP-140    |
| absent-http-070     | `POST /v1/quests/{id}/participants/attest`          | GraphQL Mutation.attestQuestParticipation           | OP-141    |
| absent-http-071     | `POST /v1/quests/{id}/participants/select`          | GraphQL Mutation.selectQuestParticipants            | OP-142    |
| absent-http-072     | `POST /v1/quests/{id}/remove-from-arc`              | GraphQL Mutation.removeQuestFromArc                 | OP-143    |
| absent-http-073     | `POST /v1/quests/{id}/withdraw`                     | GraphQL Mutation.withdrawFromQuest                  | OP-144    |
| absent-http-074     | `POST /v1/regions`                                  | GraphQL Mutation.createRegion                       | OP-145    |
| absent-http-075     | `POST /v1/regions/{id}/transition`                  | GraphQL Mutation.transitionRegion                   | OP-146    |
| absent-http-076     | `POST /v1/time/anchors`                             | GraphQL Mutation.createTimeAnchor                   | OP-147    |
| absent-http-077     | `POST /v1/unlockables`                              | GraphQL Mutation.upsertUnlockable                   | OP-148    |
| absent-http-078     | `PUT /v1/admin/creation-catalog`                    | GraphQL Mutation.upsertCreationCatalogEntry         | OP-149    |
| absent-http-079     | `PUT /v1/calendar`                                  | GraphQL Mutation.updateGameCalendar                 | OP-150    |
| absent-http-080     | `PUT /v1/characters/{id}/downtime-projects`         | GraphQL Mutation.upsertDowntimeProject              | OP-151    |
| absent-http-081     | `PUT /v1/documents/{id}/visibility`                 | GraphQL Mutation.setDocumentVisibility              | OP-152    |
| absent-http-082     | `PUT /v1/hexes/{hexId}/pois`                        | GraphQL Mutation.upsertPoi                          | OP-153    |
| absent-http-083     | `PUT /v1/maps/{mapId}/edges`                        | GraphQL Mutation.setHexEdge                         | OP-154    |
| absent-http-084     | `PUT /v1/me/availability`                           | GraphQL Mutation.setMyAvailability                  | OP-155    |
| absent-http-085     | `PUT /v1/me/following/{id}`                         | **DROP** (N3)                                       | OP-156    |
| absent-http-086     | `PUT /v1/members/{id}/roles`                        | GraphQL Mutation.setMemberRoles                     | OP-157    |
| absent-http-087     | `PUT /v1/quest-arcs`                                | GraphQL Mutation.upsertQuestArc                     | OP-158    |
| absent-http-088     | `PUT /v1/quest-summaries`                           | GraphQL Mutation.upsertQuestSummary                 | OP-159    |
| absent-http-089     | `PUT /v1/quests/{id}/hexes`                         | GraphQL Mutation.setQuestPointcrawlLinks (N5)       | OP-160    |
| absent-http-090     | `PUT /v1/site-settings/home-banner`                 | GraphQL Mutation.updateHomeBanner                   | OP-161    |
| absent-http-091     | `PUT /v1/site-settings/quest-announcement-role`     | GraphQL Mutation.updateQuestAnnouncementRoleSetting | OP-162    |

## Complete root inventory

The following164 roots are the accepted business API. Introspection fields are excluded. Each keeps the SDL argument/default/result contract.

| Operation                                   | Source                          |
| ------------------------------------------- | ------------------------------- |
| Mutation.acknowledgeSuppressedNotifications | notification-operations.graphql |
| Mutation.adjustPcxp                         | character-operations.graphql    |
| Mutation.assignArchon                       | spatial-operations.graphql      |
| Mutation.assignLieutenant                   | document-operations.graphql     |
| Mutation.attestQuestParticipation           | quest-operations.graphql        |
| ~~Mutation.claimQuestRewards~~              | **DROP** (E1)                   |
| Mutation.closeQuest                         | quest-operations.graphql        |
| Mutation.createBackstory                    | character-operations.graphql    |
| Mutation.createCharacter                    | character-operations.graphql    |
| Mutation.createDocument                     | document-operations.graphql     |
| Mutation.createMap                          | spatial-operations.graphql      |
| Mutation.createQuest                        | quest-operations.graphql        |
| Mutation.createRegion                       | spatial-operations.graphql      |
| ~~Mutation.createRequest~~                  | **DROP** (N3)                   |
| Mutation.createTimeAnchor                   | spatial-operations.graphql      |
| Mutation.decideDmProfileVerification        | member-operations.graphql       |
| ~~Mutation.decideRequest~~                  | **DROP** (N3)                   |
| Mutation.decideVerification                 | character-operations.graphql    |
| Mutation.deleteCharacter                    | character-operations.graphql    |
| Mutation.deleteCharacterLog                 | character-operations.graphql    |
| Mutation.deleteDocument                     | document-operations.graphql     |
| Mutation.deleteQuest                        | quest-operations.graphql        |
| Mutation.deleteRegion                       | spatial-operations.graphql      |
| Mutation.editPublishedDocument              | document-operations.graphql     |
| ~~Mutation.followPerson~~                   | **DROP** (N3)                   |
| Mutation.grantUnlock                        | member-operations.graphql       |
| Mutation.linkHexEntry                       | spatial-operations.graphql      |
| Mutation.linkPointcrawlEntry                | spatial-operations.graphql      |
| Mutation.logCharacterEvent                  | character-operations.graphql    |
| Mutation.markNotificationsRead              | notification-operations.graphql |
| Mutation.publishDocument                    | document-operations.graphql     |
| Mutation.redriveDiscordDelivery             | site-operations.graphql         |
| Mutation.removeQuestFromArc                 | quest-operations.graphql        |
| Mutation.restoreCharacter                   | character-operations.graphql    |
| Mutation.restoreDocument                    | document-operations.graphql     |
| Mutation.restoreQuest                       | quest-operations.graphql        |
| Mutation.restoreRegion                      | spatial-operations.graphql      |
| Mutation.retireCharacter                    | character-operations.graphql    |
| Mutation.revokeArchon                       | spatial-operations.graphql      |
| Mutation.revokeLieutenant                   | document-operations.graphql     |
| Mutation.selectQuestParticipants            | quest-operations.graphql        |
| Mutation.setCharacterGuild                  | character-operations.graphql    |
| Mutation.setDocumentVisibility              | document-operations.graphql     |
| Mutation.setHexEdge                         | spatial-operations.graphql      |
| Mutation.setMemberRoles                     | member-operations.graphql       |
| Mutation.setMemberRolesBatch                | member-operations.graphql       |
| Mutation.setMyAvailability                  | member-operations.graphql       |
| Mutation.setPointcrawlEdge                  | spatial-operations.graphql      |
| Mutation.setQuestPointcrawlLinks            | quest/operations.graphql        |
| Mutation.setUnlockableActive                | member-operations.graphql       |
| Mutation.signupForQuest                     | quest-operations.graphql        |
| Mutation.submitDmProfileForVerification     | member-operations.graphql       |
| Mutation.submitForVerification              | character-operations.graphql    |
| Mutation.syncCharacterDdb                   | character-operations.graphql    |
| Mutation.syncQuestDiscord                   | quest-operations.graphql        |
| Mutation.transitionQuestStatus              | quest-operations.graphql        |
| Mutation.transitionRegion                   | spatial-operations.graphql      |
| ~~Mutation.unfollowPerson~~                 | **DROP** (N3)                   |
| Mutation.unlinkHexEntry                     | spatial-operations.graphql      |
| Mutation.unlinkPointcrawlEntry              | spatial-operations.graphql      |
| Mutation.unpublishDocument                  | document-operations.graphql     |
| Mutation.updateBackstory                    | character-operations.graphql    |
| Mutation.updateCharacterProfile             | character-operations.graphql    |
| Mutation.updateDiscordSettings              | site-operations.graphql         |
| Mutation.updateDocument                     | document-operations.graphql     |
| Mutation.updateGameCalendar                 | spatial-operations.graphql      |
| Mutation.updateHex                          | spatial-operations.graphql      |
| Mutation.updateHomeBanner                   | site-operations.graphql         |
| Mutation.updateMap                          | spatial-operations.graphql      |
| Mutation.updateMyDmProfile                  | member-operations.graphql       |
| Mutation.updateMyProfile                    | member-operations.graphql       |
| Mutation.updateMySettings                   | member-operations.graphql       |
| Mutation.updateQuest                        | quest-operations.graphql        |
| Mutation.updateQuestAnnouncementRoleSetting | site-operations.graphql         |
| Mutation.updateRegion                       | spatial-operations.graphql      |
| Mutation.updateTimeAnchor                   | spatial-operations.graphql      |
| Mutation.upsertCreationCatalogEntry         | character-operations.graphql    |
| Mutation.upsertDowntimeProject              | character-operations.graphql    |
| Mutation.upsertPoi                          | spatial-operations.graphql      |
| Mutation.upsertPointcrawlNode               | spatial-operations.graphql      |
| Mutation.upsertQuestArc                     | quest-operations.graphql        |
| Mutation.upsertQuestSummary                 | quest-operations.graphql        |
| Mutation.upsertUnlockable                   | member-operations.graphql       |
| Mutation.withdrawFromQuest                  | quest-operations.graphql        |
| Query.adminCharacterDirectory               | character-operations.graphql    |
| Query.adminOperations                       | site-operations.graphql         |
| Query.archonAssignments                     | spatial-operations.graphql      |
| Query.backstories                           | character-operations.graphql    |
| Query.character                             | character-operations.graphql    |
| Query.characterLogs                         | character-operations.graphql    |
| Query.characterProgression                  | character-operations.graphql    |
| Query.characterSummaries                    | character-operations.graphql    |
| Query.characterVerificationHistory          | character-operations.graphql    |
| Query.characters                            | character-operations.graphql    |
| Query.coPlayers                             | character-operations.graphql    |
| Query.codexCategories                       | document-operations.graphql     |
| Query.codexDirectory                        | document-operations.graphql     |
| Query.codexEntry                            | document-operations.graphql     |
| Query.communityDirectory                    | member-operations.graphql       |
| Query.creationCatalog                       | character-operations.graphql    |
| Query.discordDeliveryMode                   | site-operations.graphql         |
| ~~Query.dmRequests~~                        | **DROP** (N3)                   |
| Query.discordSettings                       | site-operations.graphql         |
| Query.dmSessionHistory                      | quest-operations.graphql        |
| Query.dmStats                               | quest-operations.graphql        |
| Query.dmSummaries                           | quest-operations.graphql        |
| Query.document                              | document-operations.graphql     |
| Query.documentBacklinks                     | document-operations.graphql     |
| Query.documentById                          | document-operations.graphql     |
| Query.documentRevisions                     | document-operations.graphql     |
| Query.documents                             | document-operations.graphql     |
| Query.documentsTrash                        | document-operations.graphql     |
| Query.downtimeProjects                      | character-operations.graphql    |
| Query.gameCalendar                          | spatial-operations.graphql      |
| Query.gameDate                              | spatial-operations.graphql      |
| Query.hex                                   | spatial-operations.graphql      |
| Query.hexHistory                            | spatial-operations.graphql      |
| Query.home                                  | site-operations.graphql         |
| Query.homeBanner                            | site-operations.graphql         |
| ~~Query.isFollowing~~                       | **DROP** (N3)                   |
| Query.lieutenantAssignments                 | document-operations.graphql     |
| Query.map                                   | spatial-operations.graphql      |
| Query.mapView                               | spatial-operations.graphql      |
| Query.maps                                  | spatial-operations.graphql      |
| Query.member                                | member-operations.graphql       |
| Query.memberActivityStats                   | member-operations.graphql       |
| Query.memberAvailability                    | member-operations.graphql       |
| Query.memberByDiscordId                     | member-operations.graphql       |
| Query.memberMe                              | member-operations.graphql       |
| Query.memberProfile                         | member-operations.graphql       |
| Query.memberRoleHistory                     | member-operations.graphql       |
| Query.members                               | member-operations.graphql       |
| Query.myAvailability                        | member-operations.graphql       |
| Query.myCharacters                          | character-operations.graphql    |
| Query.myNotifications                       | notification-operations.graphql |
| Query.myPersonalization                     | member-operations.graphql       |
| ~~Query.myQuestRewards~~                    | **DROP** (E1)                   |
| Query.myQuestSignups                        | quest-operations.graphql        |
| ~~Query.myRequests~~                        | **DROP** (N3)                   |
| Query.myUnlocks                             | member-operations.graphql       |
| Query.myUnreadNotificationCount             | notification-operations.graphql |
| Query.openQuestSeats                        | quest-operations.graphql        |
| Query.participationsByCharacter             | character-operations.graphql    |
| Query.pendingCharacterVerifications         | character-operations.graphql    |
| Query.pendingDmProfileVerifications         | member-operations.graphql       |
| Query.poisForHex                            | spatial-operations.graphql      |
| Query.previewBody                           | document-operations.graphql     |
| Query.quest                                 | quest-operations.graphql        |
| Query.questAnnouncementRoleSetting          | site-operations.graphql         |
| Query.questArc                              | quest-operations.graphql        |
| Query.questArcs                             | quest-operations.graphql        |
| Query.questBoard                            | quest-operations.graphql        |
| Query.questGenreOptions                     | quest-operations.graphql        |
| Query.questStateCounts                      | quest-operations.graphql        |
| Query.questSummaries                        | quest-operations.graphql        |
| Query.questVoiceChannels                    | site-operations.graphql         |
| Query.quests                                | quest-operations.graphql        |
| Query.realDates                             | spatial-operations.graphql      |
| Query.recentHexChanges                      | spatial-operations.graphql      |
| Query.recentlyClosedQuests                  | quest-operations.graphql        |
| Query.regionActivity                        | spatial-operations.graphql      |
| Query.regionCounts                          | spatial-operations.graphql      |
| Query.regions                               | spatial-operations.graphql      |
| Query.search                                | site-operations.graphql         |
| Query.searchableKinds                       | site-operations.graphql         |
| Query.siteStats                             | site-operations.graphql         |
| Query.timeAnchors                           | spatial-operations.graphql      |
| Query.unlockablesCatalog                    | member-operations.graphql       |

[Breaking consumer changes](/packages/contracts/docs/product-cutover.md) record retired fields/types and unsupported old REST adapters.
