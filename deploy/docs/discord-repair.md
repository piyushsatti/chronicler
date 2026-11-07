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

## Required bot permissions

The delivery worker ([discord_sync.go](/apps/api/internal/delivery/discord_sync.go))
needs these permissions. Check the effective permissions on each channel, not
only the bot's role. A channel overwrite can deny a permission that the role
allows, and a denied View Channel implicitly denies everything else on that
channel.

| Where                  | Permission                                                                                                     | Used for                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quest announce channel | View Channel, Send Messages                                                                                    | Posting the announcement. Editing the bot's own post needs nothing more.                                                                                   |
| Quest announce channel | Create Public Threads                                                                                          | Opening the discussion thread on the first post. This step is best effort: a refusal is logged, the delivery still succeeds and the thread is not retried. |
| Quest announce channel | Send Messages in Threads                                                                                       | Posting the seated player list into the quest thread.                                                                                                      |
| Quest announce channel | Read Message History                                                                                           | Listing recent thread messages so a retry adopts an existing roster post instead of creating a second one.                                                 |
| Guild                  | Create Events                                                                                                  | Creating an EXTERNAL scheduled event when the quest has no voice channel.                                                                                  |
| Quest voice channel    | Create Events, View Channel, Connect                                                                           | Creating a VOICE scheduled event when the quest has a voice channel.                                                                                       |
| Quest role or bot role | The role allows "Allow anyone to @mention this role", or the bot has "Mention @everyone, @here, and All Roles" | Pinging the quest announcement role. Without either, the post goes out but the role is not notified.                                                       |

The worker posts plain message content without embeds, so it does not need
Embed Links. It writes the seated player list in the quest thread and reads
recent messages there, so the announce channel needs Send Messages in Threads
and Read Message History.

Updating or terminating the bot's own events requires either Create Events or
Manage Events. VOICE events also require View Channel and Connect on the voice
channel ([Discord event permissions](https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-permissions-requirements)).

New events require a future start and a quest that is neither cancelled nor
deleted. Without a voice channel, the worker uses an EXTERNAL event with a null
channel and the Chronicler quest URL as its location, capped at 100 characters.
With a voice channel, it uses a VOICE event and clears the external metadata.
Both end at the quest start plus duration. Changing the quest's voice channel
updates the existing event's type, channel, and location. Ordinary event updates
leave past-start quests alone. Terminal synchronization still handles their
existing events. Field requirements are recorded in [D49](/docs/decisions/D49-Quest-Discord-Terminal-Synchronization.md).

## Announcement format

The announcement uses this layout. Angle brackets around the title's URL are
literal. Braced values and other angle-bracketed values are placeholders.

```text
# [<Title>](<https://{public-origin}/quests/{short-code}>)

<member-projected brief body>

-# <@&<role id>>

## Game Information
- **Scheduling & Duration** - <t:<start unix>:f> · <hours>h
- **DM** - <@<dm discord id>>
- **Status** - <Status>
- **APL** - <average party level, or Any when unset>
- **Quest Link** - https://{public-origin}/quests/{short-code}
- **Event Link** - <event url, or Pending>
```

The title and Quest Link use the same Chronicler quest URL. The role line is
omitted when no role is configured. Only that role may notify through
`allowed_mentions`. Status is `Open`, `Full`, `Played`, `Closed`, or `Cancelled`.
A tombstone shows `Deleted`. Duration uses hours without trailing zeroes, such
as `4h` or `2.5h`. The brief is projected for an ordinary member and shortened
with an ellipsis before any Game Information line is cut. The post stays within
2,000 UTF-16 code units. Event Link shows `Pending` until an event ID is stored.

A Discord `403` (for example `50013 Missing Permissions` or `50001 Missing
Access`) on the message or event step is not retried. The worker parks the job
as `repair_required` with safe error code `DISCORD_PERMISSION` on the first
attempt. The admin delivery panel shows it as **Needs repair** with a
missing-permission reason. Grant the missing permission, then click **Retry
delivery** on that row. Other failures still retry with backoff and end as
`dead` (**Gave up**) after the attempt limit; the same button requeues those.

`ErrDiscordEventState` also parks delivery as `repair_required` immediately.
Inspect the stored event when its GET returns `404`, its status is absent or
malformed, or its status is unsupported. A retry cannot resolve that identity
or state ambiguity by creating a replacement.

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
request. Creation sends a stable quest-derived nonce of at most 25 characters
with `enforce_nonce: true`; edits omit these fields. Discord checks uniqueness
only within the past few minutes ([Create Message](https://docs.discord.com/developers/resources/message#create-message)).
A retry after that window can create a duplicate if an earlier response was
lost. This is not durable exactly-once delivery. Inspect Discord before any
owner-authorized replacement.

After a successful creation response, the worker persists each returned message,
event, or thread ID with a detached five-second context. This permits ID storage
after work cancellation; subsequent remote operations still stop on cancellation.

Cancellation and deletion edit the Game Information status row to `Cancelled`
or `Deleted`. They create no missing message, scheduled event, or thread.
The worker reads a stored event before checking start time.
A scheduled event becomes canceled; an active event becomes completed, which is
Discord's valid terminal transition from active. An already terminal event is
unchanged ([scheduled-event status transitions](https://docs.discord.com/developers/resources/guild-scheduled-event)).
A missing, malformed, or unsupported remote status retains the ID and requires
repair; do not create a second event. Quest deletion commits its tombstone,
desired revision, and cleanup job atomically. See [discord-sensor](/docs/interfaces/discord-sensor.md).

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

The delivery worker retries ordinary failures with bounded backoff. Repair
disposition and provider-side behavior require separate operational verification.
