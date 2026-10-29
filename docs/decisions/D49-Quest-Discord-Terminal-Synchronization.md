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

Cancelled or deleted quests label existing announcements and create no missing message, event, or thread. Read a stored event before time or voice-channel guards. A scheduled event becomes canceled, an active event becomes completed, and terminal events remain unchanged. Missing, malformed, or unsupported remote status requires repair without replacing stored IDs. These transitions follow the [Discord scheduled-event reference](https://docs.discord.com/developers/resources/guild-scheduled-event).

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

## Reopen triggers

- Discord changes its event transitions or nonce contract.
- A durable provider idempotency key becomes available, or automatic identity repair is explicitly authorized.
