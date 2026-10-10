# Mentions (`apps/discord`)

**App:** `apps/discord`  
**Implements:** n/a

## Verdict

When `AGENT_ENABLED=true`, `mountAgent` accepts an allowlisted mention, posts one question to the API, and replies in Discord. The listener is off unless that flag is set. This path does not announce quests.

## How it works

`locallyAllowed` accepts a guild message only when both `AGENT_ALLOWED_GUILD_IDS` and `AGENT_ALLOWED_CHANNEL_IDS` contain the guild and the channel (a thread may use its parent channel). A DM is accepted only when `AGENT_ALLOWED_DM_USER_IDS` contains the author. Startup throws if the flag is on and neither allowlist shape is set.

`normalizeMention` ignores other bots and webhooks. A message must mention this bot, or be a direct reply to it (`fetchDirectReplyToBot`). An empty question gets a usage reply. A question longer than 600 characters (`MAX_QUESTION_CHARS`) is rejected. An accepted question is `question.requested` version 1 with a new `job_id`.

`collectReplyHistory` walks the explicit reply chain in the same channel, oldest first, at most `MAX_REPLY_HISTORY_MESSAGES` (12) and `MAX_REPLY_HISTORY_CONTENT_BYTES` (8 KiB). Messages from this bot's user id are assistant turns. Every other author is user context.

`submitQuestion` POSTs `/v1/agent/questions` with `X-Ingest-Secret`, then polls `GET /v1/agent/questions/{id}` until a result or 120 seconds (`WAIT_MS`). `renderQuestionResult` turns that result into the Discord reply. `AgentQueue` bounds concurrency (`AGENT_MAX_CONCURRENT`, default 2) and depth (`AGENT_QUEUE_CAPACITY`, default 25).

Tests: `tests/unit/agent/`.
