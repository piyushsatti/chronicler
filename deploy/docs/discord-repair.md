# Discord quest repair

Use this runbook when `Quest.announceError` or `syncQuestDiscordV2` reports a
stale message or scheduled-event leg. Chronicler remains authoritative. Do not
change quest state in Discord and then assume the site followed it.

## Required quest-role configuration

Set `DISCORD_QUEST_ANNOUNCE_ROLE_ID` to the exact snowflake of the existing
Discord quest announcement role. Obtain that value from the Discord operator;
do not infer it from a display name or create a replacement role. The bot must
be permitted to mention that role in the configured quest channel.

When the value is absent or invalid, Chronicler still creates the announcement
and scheduled event, but returns and persists
`message:CREATED;role:NOT_NOTIFIED;event:<state>`. Configure the authorized
role before creating another quest. Retrying an already stored message updates
it without sending a backfill ping and retains the historical warning for
operator review.

## First response

1. Record the Chronicler quest ID, short code, current status, build ID, stored
   Discord message/event IDs, and the deterministic leg states. Do not record
   the bot token or Discord response bodies.
2. Confirm the effective guild and quest-board channel IDs from the running
   service configuration without printing credentials.
3. Inspect each stored remote ID with a Discord GET. For an event without a
   stored ID, list current guild events and search for the exact Chronicler
   marker and website backlink.
4. Use Retry only for `FAILED`, or after the reported `RATE_LIMITED` delay.
   Stop automatic/user retries for `REPAIR_REQUIRED`.

## Meaning and recovery

| State                               | Meaning                                                                                                                                  | Recovery                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FAILED`                            | Discord rejected or could not complete a bounded operation with no known identity ambiguity.                                             | Correct availability/configuration, then use one manual retry.                                                                                                |
| `RATE_LIMITED`                      | The local retry budget or Discord `429` delayed the operation.                                                                           | Wait at least `retryAfterSeconds`; do not loop.                                                                                                               |
| `REPAIR_REQUIRED` with stored ID    | The stored object is missing/inaccessible, a thread failed after message creation, or an event cannot enter the required terminal state. | Inspect the exact object and permissions. An owner authorizes any remote deletion, replacement, or stored-ID repair.                                          |
| `REPAIR_REQUIRED` without stored ID | Creation may have succeeded without a response, or multiple marker matches exist.                                                        | Search Discord by quest marker/backlink and creation time. Adopt one unambiguous object through an owner-reviewed repair; resolve duplicates before retrying. |

A message creation timeout is ambiguous because Discord may have accepted the
request. The bridge does not guess. The stable nonce protects only Discord's
recent nonce window. After that window, operator inspection is required before
any replacement.

Cancellation does not create a new scheduled event when no event can be found.
A referenced scheduled event becomes canceled; an active event becomes
completed, which is Discord's only valid terminal transition from active. An
already terminal event is unchanged. A missing, malformed, or unsupported
remote status retains the ID and requires repair; do not create a second event.

## Verification after repair

- Fresh-read the quest from GraphQL and confirm its `announceError` and stored
  IDs.
- GET the message and event from Discord and compare title, description,
  website backlink, schedule, location, and cancelled state to Chronicler.
- Confirm there is at most one message, one event, and one discussion thread for
  the quest marker.
- Search structured logs by `quest_id` and verify the latest message/event
  action, outcome, status class, duration, rate-limit delay, and stale-error age.

The selected ELK failure query is:

```text
service.name:chronicler-api AND event.action:quest_discord_sync AND
(discord.message.outcome:(FAILED OR RATE_LIMITED OR REPAIR_REQUIRED) OR
 discord.event.outcome:(FAILED OR RATE_LIMITED OR REPAIR_REQUIRED) OR
 db.pool.outcome:timeout)
```

Automated background retries and new alert delivery are outside this release.
