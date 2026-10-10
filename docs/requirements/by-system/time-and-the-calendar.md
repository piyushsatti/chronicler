# Requirements — The game clock is a table the cron fills, never math run live

System: [time-and-the-calendar.md](/docs/systems/time-and-the-calendar.md)

## Requirements

| # | Requirement | Because |
|---|---|---|
| R1 | Exactly one authority may advance the game clock, and that authority is a property of the CODE PATH, not a count of how many callers happen to exist today. | Today it holds because only 2 functions call `regenerate_future`. Nothing enforces that a 3rd can't be added; the guarantee is accidental, not structural. |
| R2 | Game time and wall time are never confusable, in the schema, the API, AND every surface a human reads either from. | True in schema/API today. Untested at the one place a human actually reads a date, because no route renders a game date to anyone. |
| R3 | Advancing time is idempotent: replaying the same advancement twice produces the same result, with no partial state possible in between. | Already true and tested for the fill job (`regenerate_future`'s upsert). This requirement generalizes it to every future writer of `game_time_map`, not just this one. |
| R4 | Every change to the clock's trajectory (an anchor create or edit) is durably recorded with its prior value, who made it, and when: recoverable after the fact, not just inferable from the current row. | `update_anchor` overwrites in place today; the previous trajectory is unrecoverable once a new anchor is saved. |
| R5 | No consumer computes a real-to-game or game-to-real conversion itself. Every consumer asks `time_v2` (or its read-model wrapper) and renders what comes back. | Already fully met everywhere checked (`calendar_v2`, `quests`, `home_v2` all delegate). This requirement is the one to actively protect, not to build. |
| R6 | The game calendar has exactly one rendering surface, reachable by a route. | Two half-built surfaces exist today (an unrouted grid, an admin raw-JSON editor) and the public route is a placeholder. Maintaining both is waste; the target is one. |
