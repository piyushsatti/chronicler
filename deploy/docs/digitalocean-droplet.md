# DigitalOcean Droplet Deploy

See [deploy-runbook.md](/deploy/docs/deploy-runbook.md) for the full deploy topology and
the end-to-end operating sequence; this file is the droplet detail.

One Ubuntu droplet runs the Chronicler **backend + Caddy** via Docker Compose. CI runs on GitHub Actions; production deploy is **manual** (`workflow_dispatch`) or over SSH.

> **Backend-only droplet.** The SPA is hosted on **Vercel** at the custom domain
> `https://chronicler.smokebombstudios.com`; Vercel reverse-proxies API paths
> server-side to this droplet's **Caddy** endpoint at
> `https://api.chronicler.smokebombstudios.com` (Caddy auto-TLS, Let's Encrypt).
> See [vercel-frontend.md](/deploy/docs/vercel-frontend.md).
>
> The droplet publishes **only** ports **80 + 443** (Caddy). `api:8000` and
> `db:5432` are **not** exposed to the public (`docker-compose.prod.yml` closes
> them with `ports: !reset []`). Set `API_DOMAIN=api.chronicler.smokebombstudios.com`
> and `PUBLIC_ORIGIN=https://chronicler.smokebombstudios.com` in `.env.prod`.
>
> The old droplet nginx frontend (`:3000`, the `frontend` compose service,
> `scripts/deploy/frontend.sh`) is **superseded by Vercel and no longer deployed**.
> Those files are kept in the repo but are not part of the production topology.

## Architecture

```
Internet ──HTTPS──► :443 caddy (auto-TLS for api.chronicler.smokebombstudios.com)
                          └──► api:8000 (GraphQL + OAuth, internal only)
                          db  (internal only, never expose :5432)
                          bot (optional, --profile bot, outbound Discord only)

# Frontend is on Vercel (chronicler.smokebombstudios.com), not on the droplet.
# api:8000 and db:5432 are NOT published to the host — only Caddy :80/:443 are.
```

## One-time droplet bootstrap

### 1. Create droplet

- **Image:** Ubuntu 24.04 LTS
- **Size:** smallest tier (~$6/mo)
- **Auth:** SSH key (no password login)

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in
docker compose version
```

**Compose version matters.** `docker-compose.prod.yml` uses the `ports: !reset []`
tag to genuinely drop the base file's published ports (plain `ports: []` would
merge-append and NOT remove them). `!reset` requires **Docker Compose v2.24+**
(the plugin shipped with modern Docker). `get.docker.com` installs a current
version; confirm `docker compose version` reports **2.24 or newer**.

### 3. Create deploy user

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/chronicler
sudo chown deploy:deploy /opt/chronicler
```

Add your SSH public key to `/home/deploy/.ssh/authorized_keys` (and a dedicated deploy key for GitHub Actions).

### 4. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp   # Caddy (HTTP-01 cert challenge + HTTPS)
sudo ufw enable
```

Open **only** 80 + 443 (plus SSH). Do **not** open `8000` or `5432` — the api and
db ports are not published to the host (`docker-compose.prod.yml` closes them),
and Caddy on :443 is the only public entrypoint. Port **80** must stay open too:
Caddy needs it for the Let's Encrypt HTTP-01 challenge.

### 5. Clone repo

As `deploy`:

```bash
cd /opt/chronicler
git clone https://github.com/piyushsatti/chronicler.git .
git checkout main
```

### 6. Production env file

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Edit `.env.prod` on the droplet (never commit):

| Variable | Value |
|---|---|
| `API_DOMAIN` | `api.chronicler.smokebombstudios.com` — Caddy fetches the Let's Encrypt cert for this host (see `Caddyfile`) |
| `PUBLIC_ORIGIN` | `https://chronicler.smokebombstudios.com` — the Vercel frontend origin; drives OAuth redirect + CORS |
| `JWT_SECRET` | long random hex |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord Developer Portal |
| `POSTGRES_PASSWORD` | strong password (match `DATABASE_URL`) |
| `DATABASE_URL` | `postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`, points at the managed **Supabase** DB (cutover complete). See [Supabase connection & extensions](#supabase-connection--extensions) below |

Do **not** set `VITE_API_URL` — it is a frontend build var, unused by the droplet
backend, and the Vercel build must leave it unset (same-origin proxy). See
[vercel-frontend.md](/deploy/docs/vercel-frontend.md).

> **Supabase cutover (done):** `DATABASE_URL` points at the managed Supabase DB
> (epic #2, issues #71/#72 closed). The local `db:5432` service is no longer in the
> prod path, it remains only for local dev / decommissioned fallback. Schema v2
> migration (epic #83) has since closed too; remaining backend work is the v1
> GraphQL read-surface teardown tracked in epic #280.

Optional overrides (normally leave unset — derived from `PUBLIC_ORIGIN`):

| Variable | When needed |
|---|---|
| `DISCORD_OAUTH_REDIRECT_URI` | Custom callback path |
| `ALLOWED_ORIGINS` | Multiple browser origins |

Register `https://chronicler.smokebombstudios.com/auth/callback` as an OAuth2
redirect URI in the [Discord Developer Portal](https://discord.com/developers/applications).
It must match `PUBLIC_ORIGIN` + `/auth/callback` character-for-character. Because
the frontend serves a real HTTPS domain, Discord accepts the redirect (it rejects
raw-IP redirects).

### 7. First boot

The droplet runs **backend + Caddy** only (frontend is on Vercel). The deploy
scripts bring up individual services (`api`, `db`, `bot`) with `--no-deps`, so
they do **not** start Caddy for you — bring Caddy up explicitly on first boot.

**Recommended (CI-built images):** push this repo to `main`, wait for **Build
container images** in Actions, add GitHub secrets (`GHCR_READ_TOKEN`, droplet SSH
secrets), then run **Deploy to Droplet** with target `api`. Then bring up Caddy
(see below).

**Manual on droplet:**

```bash
cd /opt/chronicler
export ENV_FILE=.env.prod

# REQUIRED on the droplet: it runs GHCR images, not a local build. Without these
# the scripts fall back to building `chronicler-api:local` (which doesn't exist
# here) and fail. CD sets them automatically; for a manual run set them yourself:
export CHRONICLER_USE_REGISTRY=1
export CHRONICLER_API_IMAGE=ghcr.io/YOUR_GITHUB_USER/chronicler-api:latest

# db + migrate + api + Caddy. Uses base + prod compose via _common.sh, so
# api:8000 and db:5432 are NOT published — only reachable inside Docker. api.sh
# now also brings up Caddy (ensure_caddy), which auto-issues the Let's Encrypt
# cert for API_DOMAIN once the api.chronicler A record resolves and 80/443 are open.
bash scripts/deploy/api.sh
```

Or bring the whole backend + Caddy stack up in one shot with plain compose:

```bash
cd /opt/chronicler
ENV_FILE=.env.prod docker compose --env-file .env.prod \
  -f deploy/compose files -f docker-compose.prod.yml up -d
```

Verify (once DNS has propagated and Caddy has issued the cert):

- `https://api.chronicler.smokebombstudios.com/health` — API health JSON with a
  valid cert.
- On the droplet, `curl -sf http://localhost:8000/health` still works from inside
  the host network for local checks, but `:8000` is not reachable from the public
  internet.

---

## Supabase connection & extensions

Folded forward from the retired hosting-cutover doc (issue #284; history in
retired Supabase migration notes — not vendored in repo).
Still-true facts about the live Supabase connection:

**Connection string shapes**: Supabase gives three, use the right one.

| Mode | Host / port | Use for |
|---|---|---|
| **Direct** | `db.<ref>.supabase.co:5432` | Migrations (Alembic). IPv6-only unless the IPv4 add-on is on. |
| **Session pooler** (Supavisor) | `aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>` | The **app** (persistent FastAPI). IPv4, one conn per client, supports prepared statements. |
| **Transaction pooler** (Supavisor) | `aws-0-<region>.pooler.supabase.com:6543` | Serverless only. **Avoid here**, breaks asyncpg prepared statements. |

Notes that bite:

- The Supabase database name is **`postgres`**, not a project-specific name. The
  path segment of the URL is `/postgres`.
- The pooler **username includes the project ref**: `postgres.<ref>`.
- **Migrations (Alembic) must use a direct or session connection, never the
  transaction pooler (6543)**. Migrations run DDL in real transactions, which a
  transaction-mode pooler will corrupt.
- If a transaction pooler is ever used for the app, asyncpg needs
  `statement_cache_size=0` (pgbouncer transaction mode has no prepared-statement
  support).

**Extension audit**: every Alembic migration and every ORM model was audited for
`CREATE EXTENSION`, PostGIS/`geoalchemy`, `citext`, `hstore`, `uuid-ossp`,
`pgcrypto`, and server-side UUID defaults. **None found.** Hexes use plain axial
int columns (`atlas_id`, `q`, `r`), and every UUID primary key is generated
app-side (`mapped_column(UUID(as_uuid=True), default=uuid.uuid4)`, a Python-side
default, not `server_default`). **Required extension set: none.** The schema
runs on stock Supabase Postgres with nothing enabled beyond the defaults.

---

## Env file convention

| File | Where | Committed? |
|---|---|---|
| `.env.example` | Laptop template | Yes |
| `.env.local` | Laptop (`pnpm dev`) | No |
| `.env.prod.example` | Droplet template | Yes |
| `.env.prod` | Droplet secrets | No |

Compose reads `${ENV_FILE:-.env.local}`. Deploy scripts (`scripts/deploy/_common.sh`) set `ENV_FILE=.env.prod` and add `docker-compose.prod.yml` on top of `deploy/compose files`. The prod override closes the host `:8000` and `:5432` publishes (`ports: !reset []`) and adds the `caddy` service on :80/:443.

Local dev:

```bash
cp .env.example .env.local
pnpm dev
```

---

## Manual deploy (GitHub Actions)

### 1. Container images (manual CI)

Image build/push lives under [`.github/workflows/`](/.github/workflows/README.md) (see `api.yml` / `deploy-api.yml`). Production releases stay Actions-only ([D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)).

> The **frontend** image is no longer deployed on the droplet (frontend is on
> Vercel). CI may still build it, but the production topology only uses the **api**
> and **bot** images. Caddy uses the upstream `caddy:2-alpine` image (no build).

```
ghcr.io/<owner>/chronicler-api:<sha>
ghcr.io/<owner>/chronicler-frontend:<sha>
ghcr.io/<owner>/chronicler-bot:<sha>
```

Each image is also tagged `:latest`.

**Order:** **Build container images** (wait for green) → **Deploy to Droplet**.

### 2. Repository secrets

**Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | Droplet IP or hostname |
| `DROPLET_SSH_KEY` | Private key for `deploy` user |
| `DROPLET_APP_DIR` | `/opt/chronicler` (optional) |
| `GHCR_READ_TOKEN` | Optional — CD uses `GITHUB_TOKEN` for droplet pulls |

`VITE_API_URL` is no longer needed as a droplet/CI secret — the frontend builds on
Vercel with it unset (same-origin proxy). It only mattered for the retired droplet
frontend image.

Create the PAT under **Settings → Developer settings → Personal access tokens**. Classic token scope: `read:packages`.

After the first CI image push, link packages to this repo under **Packages** if GitHub prompts for access.

### 3. Deploy (CD)

**Actions → Deploy API → Run workflow** ([`deploy-api.yml`](/.github/workflows/deploy-api.yml))

| Input | Use when |
|---|---|
| `api` | Backend change (the normal path); runs migrate by default |
| `frontend` | **Retired** — the droplet frontend is superseded by Vercel; deploy the UI by pushing to the Vercel-connected branch instead |
| `bot` | Bot-only change (stops old bot first) |
| `full` | Schema/contracts change or first deploy — runs db → migrate → api → Caddy (bot only if `DEPLOY_BOT=true`; CD sets it false). No longer touches the retired frontend. `api` is preferred for backend-only refreshes |
| `image_tag` | Leave empty to deploy images built for the current commit SHA; use `latest` to pull the most recent main build |

**Order:** run **Build container images** → wait for green → run **Deploy to Droplet**.

Uncheck **run_migrate** only for api redeploys with no migration.

**Caddy is not restarted by these deploy scripts** (they target individual
services with `--no-deps`). It rarely needs redeploying; when it does (Caddyfile
or `API_DOMAIN` change), run
`docker compose --env-file .env.prod -f deploy/compose files -f docker-compose.prod.yml up -d caddy`.

---

## SSH hotfix (urgent)

**Prefer `bash scripts/deploy/all.sh` from your workstation.** It does
everything below plus the restore point, the disk guard, the stack
verification, the public smoke test, and the Vercel promotion, in one command.
See [deploy-runbook.md](/deploy/docs/deploy-runbook.md#deploying-one-entry-point-two-triggers).

Use the raw SSH route only when `all.sh` itself is what is broken.

```bash
ssh deploy@YOUR_DROPLET_IP
cd /opt/chronicler
git pull --ff-only
export ENV_FILE=.env.prod
# If using GHCR (same as CD):
export CHRONICLER_USE_REGISTRY=1
export CHRONICLER_API_IMAGE=ghcr.io/YOUR_GITHUB_USER/chronicler-api:latest
export CHRONICLER_FRONTEND_IMAGE=ghcr.io/YOUR_GITHUB_USER/chronicler-frontend:latest
export CHRONICLER_BOT_IMAGE=ghcr.io/YOUR_GITHUB_USER/chronicler-bot:latest
docker login ghcr.io -u YOUR_GITHUB_USER   # paste GHCR_READ_TOKEN
bash scripts/deploy/api.sh      # or bot.sh / full.sh (frontend.sh is retired — UI is on Vercel)
```

**This route has no restore point, by design.** The pre-deploy `pg_dump` runs on
the workstation or the CI runner, never on the droplet, because a droplet-held
dump credential is what D10's pull model exists to prevent. If the command above
runs a migration (`api.sh` and `full.sh` migrate by default), **there is no
checkpoint in front of it**. Take one first from your workstation:

```bash
BACKUP_TAG=predeploy bash scripts/deploy/supabase_backup.sh
```

---

## Selective restarts

Deploy scripts use `docker compose pull` + `up --no-build` when `CHRONICLER_USE_REGISTRY=1` (CD sets this). After each registry deploy, `prune_after_deploy` removes dangling layers, build cache, and old GHCR tags not in use.

| Script | Restarts |
|---|---|
| `scripts/deploy/api.sh` | migrate (optional) + api + caddy + scheduler |
| `scripts/deploy/frontend.sh` | frontend (**retired** — UI is on Vercel; not used in prod) |
| `scripts/deploy/bot.sh` | bot (singleton-safe) |
| `scripts/deploy/full.sh` | migrate + api + caddy + scheduler (+ bot if `DEPLOY_BOT=true`); no longer touches the retired frontend |

`api.sh` and `full.sh` bring up Caddy via `ensure_caddy()` and the scheduler via
`ensure_scheduler()` (both prod only). Because the API host port is closed,
`wait_api_healthy` waits on the api container's own Docker HEALTHCHECK rather than
curling `localhost:8000`.

---

## Scheduler (nightly ops crons)

The `scheduler` service runs the nightly ops jobs. It is **prod-only** (defined in
`docker-compose.prod.yml`), reuses the **same image as `api`**, and reaches the
external Supabase DB through the **same `env_file` / `DATABASE_URL`** as api and
migrate. It publishes no host ports and does not depend on the local `db`
container.

Inside the container, [supercronic](https://github.com/aptible/supercronic) (a
container-friendly cron runner, pinned + SHA-256 verified in `apps/api/Dockerfile`)
reads the committed crontab at `/app/deploy/ops.crontab` (source:
`apps/api/deploy/ops.crontab`):

| Time | Job | What it does |
|---|---|---|
| 03:00 | `python -m chronicler.cli.reconcile` | Cache-vs-ledger drift audit (#96). Exits nonzero on drift; supercronic logs the failed run and keeps scheduling. |
| 03:30 | `python -m chronicler.cli.gametime_fill` | `game_time_map` fill-ahead (#97). Idempotent, safe to re-run. |

**Timezone.** Cron times are interpreted in the container's `TZ`, default `UTC`
(so 03:00 / 03:30 UTC). Override by setting `SCHEDULER_TZ` in `.env.prod` (a
non-UTC zone like `America/Toronto` needs tzdata installed in the api image).

**Change the schedule.** Edit `apps/api/deploy/ops.crontab`, rebuild the api
image (CI), then redeploy. Every backend deploy (`api.sh` / `full.sh`) re-runs
`ensure_scheduler()`, which pulls the fresh image and restarts the service.

**Logs.** `docker compose --env-file .env.prod -f deploy/compose files -f docker-compose.prod.yml logs scheduler`
(or `docker compose logs scheduler` from the app dir with `ENV_FILE` set). Each
run logs start, per-job stdout/stderr, and exit status.

Prod runs against **Supabase** (external `DATABASE_URL`), so `ensure_db` skips the
local `db` container and `run_migrate` uses `--no-deps` (migrate connects straight
to Supabase). The local `db` service + `pgdata` volume remain only for local dev
and as a decommissioned fallback; nothing in the prod path starts them.

---

## CI (automatic on PR)

CI/CD workflows: [`.github/workflows/`](/.github/workflows/README.md) (`api.yml`, `deploy-api.yml`).

Deploy is **not** automatic on push to `main`. Manual release workflow: [`deploy-api.yml`](/.github/workflows/deploy-api.yml).

---

## Follow-ups (not in initial setup)

- ~~**TLS + domain**~~ — **done**: Caddy on :443 auto-TLS for `api.chronicler.smokebombstudios.com`.
- ~~**`docker-compose.prod.yml`**~~ — **done**: db/api host ports closed (`ports: !reset []`), `caddy` added with `restart: unless-stopped`, api fronted by Caddy.
- ~~**Supabase DATABASE_URL cutover**~~, **done**: `DATABASE_URL` now points at hosted Supabase (#71/#72 closed). ~~**Schema-v2 migration**~~, **done**: epic #83 closed 2026-07-18. Remaining backend work is the v1 GraphQL read-surface teardown (epic #280).
- **Backups** — cron `pg_dump` to DO Spaces.
- **Container registry** — already in use via GHCR.
- ~~**Root disk hygiene**~~ — plan documented (#279):
  [droplet-disk-hygiene.md](/deploy/docs/droplet-disk-hygiene.md) covers the weekly
  `docker system prune -af` cron and journald/docker log-rotation caps.
  Applying it on the droplet is owner-ack-gated and still pending.
