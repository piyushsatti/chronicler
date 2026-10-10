# End to end

Whole-system checks. They start the API and the Discord bot and talk to a real Postgres. They do not run inside an app's unit or integration suite.

First cases:

- A guild message posted by the bot is stored by `POST /ingest/v2/discord-event`.
- A mention posted to `POST /agent/questions` comes back as a Discord reply.
- The bot heartbeat shows the gateway session is up.

These need the API process. There is no runner here yet.
