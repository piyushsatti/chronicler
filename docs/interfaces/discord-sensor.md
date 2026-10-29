# Interface: Discord as sensor

**Status:** accepted  
**Provider:** `apps/api` (authoritative announces and writes to Discord)  
**Consumers:** `apps/discord` (Gateway observer only)

## Rule

The Discord bot is a read-only sensor and activity forwarder. It never announces quests, never creates scheduled events, and never authors campaign facts. The API owns Discord announcement and scheduled-event creation. Authoritative records are authored on the website.

Quest cancellation and deletion use **transactional outbox** and **desired-state reconciliation** in the API. Deletion commits its desired revision, tombstone, and delivery job together. The worker sets existing announcements' Game Information status row to `Cancelled` or `Deleted`, creates no missing objects for these quests, and terminates existing events even after their start or removal of a voice channel. Scheduled events become canceled, active events become completed, and terminal events remain unchanged. Unknown or missing remote state requires repair without automatic replacement.

Announcements use the member-projected brief and preserve the complete Game Information block within the message limit. Every future quest that is neither cancelled nor deleted uses a VOICE scheduled event when a voice channel is configured, or an EXTERNAL event at its Chronicler URL otherwise. The API reconciles type, channel, and location changes on the stored event. Ordinary updates leave past-start events alone. [D49](/docs/decisions/D49-Quest-Discord-Terminal-Synchronization.md) records the field requirements and the [repair runbook](/deploy/docs/discord-repair.md#announcement-format) shows the message layout.

Message creation sends a stable quest-derived nonce with `enforce_nonce: true`. Discord's deduplication covers only the past few minutes, not durable exactly-once delivery ([Create Message](https://docs.discord.com/developers/resources/message#create-message)). Returned IDs use bounded five-second persistence after work cancellation; this does not authorize further remote work. The API and its GraphQL product commands remain the single authority. [Implementation](/apps/api/docs/background-work.md), [repair runbook](/deploy/docs/discord-repair.md).

## Enforcement

| Mechanism                                                                    | Location                                                                                                                                                                                                                                            | Status       |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| No announce, scheduled-event, GraphQL, or database client in the Discord app | [sensor.test.ts](/apps/discord/tests/unit/interface/sensor.test.ts)                                                                                                                                                                                 | **enforced** |
| Terminal Discord synchronization and repair                                  | `TestCancelledQuestUpdatesAnnouncementAndTerminatesExistingEvent`, `TestCancelledOrDeletedQuestDoesNotCreateMissingDiscordObjects`, `TestUnknownRemoteEventStatusRequiresRepairWithoutReplacement`, `TestDiscordEventStateFailureParksJobForRepair` | **enforced** |
| Atomic deletion outbox                                                       | `TestDeleteQuestEnqueuesTerminalDiscordRevisionAtomically`                                                                                                                                                                                          | **enforced** |
| Stable nonce and bounded ID persistence                                      | `TestCreateMessageSendsStableEnforcedNonceAcrossRetry`, `TestRemoteIDsPersistAfterWorkContextCancellation`                                                                                                                                          | **enforced** |
| Quest announcement format and mention scope                                  | `TestQuestAnnouncementGameInformationLayout`, `TestQuestAnnouncementStatusesAndPendingEvent`, `TestQuestAnnouncementUsesStoredAPLAndRestrictsMentions`, `TestQuestAnnouncementUnbrokenBriefKeepsEllipsisAndGameInformation`                         | **enforced** |
| EXTERNAL event creation and type changes                                     | `TestExternalQuestEventCreationAndVoiceTransitions`, `TestExternalQuestEventLocationIsAtMost100Characters`                                                                                                                                          | **enforced** |

## Provider

API announce paths and Discord webhook/outbound calls. Local design: `apps/api/docs/`.

## Consumers

Gateway observation: [activity](/apps/discord/docs/activity.md).

## Related decisions

- [D1](/docs/decisions/D1-Discord-Announce-Ownership.md)
- [D49](/docs/decisions/D49-Quest-Discord-Terminal-Synchronization.md)

## Reopen

The bot is granted a write path for announces or scheduled events, or Discord becomes a source of authoritative campaign facts.
