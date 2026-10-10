# Fresh-DB Bootstrap (local dev / QA)

See [deploy-runbook.md](/deploy/docs/deploy-runbook.md) for the production deploy
topology; this file is local-dev/QA only, not production.

One documented command chain from a fresh clone to a running stack with demo
data and a dev token per role. Written for the local Docker path only —
hosted-DB connection shapes + extension audit live in
[digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md#supabase-connection--extensions)
(the one-time provisioning project itself is retired, see
retired Supabase migration notes — not vendored in repo);
droplet deploy is [digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md); the
hosting epic itself (image packaging, #169) is out of scope here.

## Why this exists

Schema v2 is applied two different ways depending on DB state (raw SQL
out-of-band for a provisioned DB vs. an Alembic-driven bootstrap for an empty
one — see [schema-v2.md:7](/docs/interfaces/graphql-schema.md)). `mint_dev_token` needs its own
env vars pointed at the right database, which isn't obvious from a fresh
clone. This doc is the one place that chains it correctly. See "History: the
seed-CLI gap" below for how the seed step got here.

## Command chain

```bash
git clone <repo> && cd chronicler
cp .env.example .env.local
pnpm install
pnpm dev
```

`pnpm dev` runs `docker compose up --build`: `db` → `migrate` → `api` →
`frontend`. The `migrate` service runs `alembic upgrade head`, which is
self-sufficient from a genuinely empty database — it detects the empty case
and applies `002_schema_v2_init.sql` itself (migration `a319b3db4e38`; the SQL
file's own path resolution was fixed in #177). No manual `psql` step is
needed for a fresh local DB. `docker-compose.local.yml` is a separate override
that repoints `db`/`migrate`/`api` at an isolated `chronicler_test` database
on its own volume, for seeding against:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

### Seed demo data: `dev_seed_v2`

The v1-ORM `seed`/`dev_seed`/`stress_seed` CLIs wrote against the
pre-migration schema; #293 (v1 read-surface teardown) deleted all three
outright once they had zero live callers. #215 promoted the QA skill's ad
hoc seed script into the package as `chronicler.cli.dev_seed_v2`, a v2-ORM
seed (members, regions, backstories, characters, quest arcs, quests,
participants, documents, unlockables) that is the current, working
demo-data path:

```bash
cd apps/api
DATABASE_URL=postgresql+asyncpg://chronicler:chronicler@localhost:5432/chronicler_test \
    uv run python -m chronicler.cli.dev_seed_v2
```

`chronicler.cli.db_target.guard_target_db` is a fail-closed allowlist:
`DATABASE_URL`'s database name must end in `_test` (or be one of
`ALLOWED_SEED_DBS`, currently just `chronicler_test`), or the CLI refuses to
run rather than write demo data into a live database. Point `DATABASE_URL`
at the isolated `chronicler_test` database the `docker-compose.local.yml`
override brings up (or a per-campaign `chronicler_qa_<slug>_test` database),
never at the default `chronicler` database.

### Dev tokens, one per role

`mint_dev_token` mints the same hybrid v2 JWT the OAuth callback issues, from
a seeded `seed-dm-*` / `seed-player-*` discord id (creating the `members` row
on the fly if missing):

```bash
# Player
uv run python -m chronicler.cli.mint_dev_token --discord-id seed-player-1

# DM
uv run python -m chronicler.cli.mint_dev_token --discord-id seed-dm-1

# Admin — the bootstrap admin grant is env-gated, not seed-data-gated: point
# CHRONICLER_BOOTSTRAP_ADMIN_DISCORD_IDS at the discord id you mint for.
CHRONICLER_BOOTSTRAP_ADMIN_DISCORD_IDS=seed-dm-1 \
    uv run python -m chronicler.cli.mint_dev_token --discord-id seed-dm-1
```

Point `mint_dev_token` at the isolated test DB the same way as the seed CLIs
(`POSTGRES_DB=chronicler_test`), or it resolves against whatever
`DATABASE_URL` / `chronicler.config.settings.effective_database_url()`
otherwise picks (see the resolution order documented on
`mint_dev_token._resolve_database_url`).

## History: the seed-CLI gap (resolved, #215)

`seed` / `dev_seed` / `stress_seed` wrote through the **v1** ORM
(`chronicler.db.models`) against the pre-migration schema, so once schema v2
landed they didn't leave stale v1 rows behind, they simply couldn't run:
the v1 ORM's column/table definitions no longer matched the live v2-shaped
schema, so any invocation crashed (`UndefinedColumn` / `UndefinedTable`)
rather than seeding anything. #293 (v1 read-surface teardown) then deleted
all three outright once they had zero live callers, leaving a genuine gap:
no seed CLI of any kind, v1 or v2.

That gap is closed. #215 promoted a full v2-ORM seed script into the package
as `chronicler.cli.dev_seed_v2` (see "Seed demo data" above): members,
quests, characters, participants, documents, and unlocks all seed correctly
against the v2 schema today. `mint_dev_token` also still works standalone
without any seed data (it only touches `members`, and `mint_login_token`
creates that one row on the fly).

## Verify

- `docker compose ps` — `db`, `migrate` (exited 0), `api`, `frontend` all up/healthy.
- `curl http://localhost:8000/health` → 200.
- A minted token (above) authenticates against the running API for its role.
