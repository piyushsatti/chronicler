# D49: Quest Discord terminal synchronization

**Status:** decided 2026-10-29  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [discord-sensor](/docs/interfaces/discord-sensor.md)

## Context

Cancelling or deleting a quest must update its existing Discord announcement and event. Remote creation can succeed even when the worker loses the response or its work context is cancelled.

## Decision

Use **transactional outbox**, **desired-state reconciliation**, and **idempotent message creation**. The API and GraphQL product commands remain the single authority; Discord reflects quest state.

Quest deletion increments the desired revision, tombstones the row, and admits delivery in one command transaction. Delivery retains access to tombstoned snapshots and stored remote IDs.

Cancelled or deleted quests show `Cancelled` or `Deleted` in the announcement's Game Information status row and create no missing message, event, or thread. Read a stored event before the start-time guard. A scheduled event becomes canceled, an active event becomes completed, and terminal events remain unchanged. Missing, malformed, or unsupported remote status requires repair without replacing stored IDs. These transitions follow the [Discord scheduled-event reference](https://docs.discord.com/developers/resources/guild-scheduled-event).

The 2026-10-29 D8 amendment restores the masked quest-title link, member-projected brief, optional role line, and Game Information block. The block lists schedule and duration, DM, stored status in title case, stored average party level or `Any`, quest link, and event link or `Pending`. Tombstones show `Deleted`. Only the configured role may notify through `allowed_mentions`. Truncate the brief first with an ellipsis to retain the entire block within Discord's 2,000-character content limit. The implementation counts UTF-16 code units conservatively ([Create Message](https://docs.discord.com/developers/resources/message#create-message)). The [repair runbook](/deploy/docs/discord-repair.md) shows the layout.

The D9 amendment creates an event for every future quest that is neither cancelled nor deleted. A configured voice channel uses `VOICE` (`2`), its channel ID, and null entity metadata. Without one, use `EXTERNAL` (`3`), a null channel, and `entity_metadata.location` containing the quest URL, capped at 100 characters. The end is the start plus duration. Reconcile both type changes on the stored event. Keep ordinary events whose start is in the past unchanged.

Discord requires `EXTERNAL` events to have a null channel, location of 1–100 characters, and an end timestamp. PATCH conversion to `EXTERNAL` must send all three explicitly. `VOICE` requires a non-null channel and null metadata. Both use `GUILD_ONLY` privacy (`2`), ISO8601 timestamps, a name of 1–100 characters, and an optional description of 1–1000 characters ([event fields and types](https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object), [create](https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event), [modify](https://docs.discord.com/developers/resources/guild-scheduled-event#modify-guild-scheduled-event)).

Message creation alone sends a stable quest-derived nonce of at most 25 characters with `enforce_nonce: true`. Revisions do not change the nonce. Discord checks uniqueness within the past few minutes, so this is not durable exactly-once delivery ([Create Message](https://docs.discord.com/developers/resources/message#create-message)).

Persist each returned message, event, or thread ID under `context.WithoutCancel` with a five-second timeout. Later remote work still honors cancellation and the existing lease/effect fence.

## Alternatives rejected

- Creating replacements during terminal cleanup can duplicate remote objects and conceal stale IDs.
- Cancelling an active event violates Discord's permitted transition to completed.
- Using the cancelled work context for returned IDs loses the identity needed by retries.
- Treating a nonce as permanent deduplication exceeds Discord's documented window.

## Consequences

Terminal cleanup can require operator repair. A lost creation response remains ambiguous, and a retry outside the nonce window can duplicate a message. Neither IDs nor authoritative quest state move to the bot. Repair follows [discord-repair](/deploy/docs/discord-repair.md).

## Enforced by

`TestCancelledQuestUpdatesAnnouncementAndTerminatesExistingEvent`, `TestCancelledOrDeletedQuestDoesNotCreateMissingDiscordObjects`, `TestUnknownRemoteEventStatusRequiresRepairWithoutReplacement`, and `TestDiscordEventStateFailureParksJobForRepair` cover terminal reconciliation and repair.

`TestDeleteQuestEnqueuesTerminalDiscordRevisionAtomically`, `TestCreateMessageSendsStableEnforcedNonceAcrossRetry`, and `TestRemoteIDsPersistAfterWorkContextCancellation` cover atomic enqueue, nonce construction, and ID persistence. Local fixtures do not establish live Discord behavior.

`TestQuestAnnouncementGameInformationLayout`, `TestQuestAnnouncementStatusesAndPendingEvent`, `TestQuestAnnouncementUsesStoredAPLAndRestrictsMentions`, and `TestQuestAnnouncementUnbrokenBriefKeepsEllipsisAndGameInformation` cover D8. `TestExternalQuestEventCreationAndVoiceTransitions` and `TestExternalQuestEventLocationIsAtMost100Characters` cover D9 through the fake Discord transport.

## Reopen triggers

- Discord changes its event transitions or nonce contract.
- A durable provider idempotency key becomes available, or automatic identity repair is explicitly authorized.
