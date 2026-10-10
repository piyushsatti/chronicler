# Deploy Runbook

Entry point for deploying and operating Chronicler in production. Start here;
follow the links out for exact commands and full detail.

## Topology

| Piece | Where | Why |
|---|---|---|
| Backend (FastAPI + GraphQL, bot, nightly scheduler) | One DigitalOcean droplet, Docker Compose, behind **Caddy** (auto-TLS) at `api.chronicler.smokebombstudios.com` | A single always-on process needs a persistent DB connection pool and runs the nightly ops cron (`reconcile`, `gametime_fill`) and the Discord bot, none of which fits a serverless/edge model. |
| Frontend (SPA) | **Vercel**, custom domain `chronicler.smokebombstudios.com` | Static build + edge delivery is exactly what Vercel is for; no reason to serve it off the droplet. |
| Database | Managed **Supabase Postgres** | Connection pooling (Supavisor), and it decouples DB lifecycle from the droplet. **Not chosen for managed backups: the project is on Free, which has none.** See [Backups](#backups). |

The browser only ever talks to `https://chronicler.smokebombstudios.com`.
Vercel's edge rewrites `/graphql`, `/auth/discord/*`, and `/health`
server-side over HTTPS to the droplet's Caddy endpoint; everything else falls
through to the SPA. Full routing map and DNS:
[vercel-frontend.md](/deploy/docs/vercel-frontend.md).

```
browser ──HTTPS──► chronicler.smokebombstudios.com (Vercel)
                          └──HTTPS──► api.chronicler.smokebombstudios.com (Caddy) ──► api:8000 ──► Supabase Postgres
```

Detail files, each owning one slice:

| File | Covers |
|---|---|
| [digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md) | Droplet bootstrap, env file, CI image build, CD deploy, Supabase connection shapes, scheduler |
| [fresh-db-bootstrap.md](/deploy/docs/fresh-db-bootstrap.md) | Local dev stack + seed data + dev tokens (not production) |
| [vercel-frontend.md](/deploy/docs/vercel-frontend.md) | Proxy/routing map, DNS records, first-time Vercel import checklist |
| [vercel-promotion.md](/deploy/docs/vercel-promotion.md) | The promotion gate and how it is verified, the promote command |
| [supabase-backups.md](/deploy/docs/supabase-backups.md) | Backup job, restore procedures |
| [discord-repair.md](/deploy/docs/discord-repair.md) | Quest message/event partial failure and owner-authorized repair |

## First-time bootstrap

Do these once, in order:

1. **DNS (Namecheap):** add the `chronicler` CNAME and `api.chronicler` A
   record. Both cert issuances below are gated on this propagating. See
   [vercel-frontend.md § DNS](/deploy/docs/vercel-frontend.md#dns-namecheap).
2. **Droplet:** create it, install Docker, create the `deploy` user, open
   only 80/443, clone the repo, write `.env.prod`. See
   [digitalocean-droplet.md § One-time droplet bootstrap](/deploy/docs/digitalocean-droplet.md#one-time-droplet-bootstrap).
3. **Droplet first boot:** bring up db + migrate + api + Caddy (`bash
   scripts/deploy/api.sh` or plain `docker compose ... up -d`, both documented
   in the same section). Caddy auto-issues its Let's Encrypt cert once DNS
   resolves.
4. **Vercel:** import the repo (root directory = repo root), add the custom
   domain, leave `VITE_API_URL` unset. See
   [vercel-frontend.md § Human deploy checklist](/deploy/docs/vercel-frontend.md#human-deploy-checklist).
5. **Discord Developer Portal:** register
   `https://chronicler.smokebombstudios.com/auth/callback` as the OAuth
   redirect URI.
6. **Verify:** both certs issued, `/health` on each origin, GraphQL round
   trip, Discord login end-to-end. Checklist:
   [vercel-frontend.md § Verify](/deploy/docs/vercel-frontend.md#verify).

## Deploying

Build release images on the workstation and stream them over SSH to the Droplet.
The workstation image procedure (see deploy scripts in-repo) owns the commands,
capacity allowance, exact image/revision checks, and failure boundaries.

| Trigger | Behavior | Current verification |
|---|---|---|
| `python3 scripts/deploy/workstation.py deploy api --host chronicler --receipt /private/tmp/chronicler-release.json` | Build committed source locally, stream missing images, then invoke the shared restore/deploy/smoke chain in loaded-image mode | Real API build and transfer verified on 2026-09-07; retain a separate receipt for each service restart |
| Actions deployment (`deploy.yml` / `cd-deploy.yml`) | Existing registry image path | Current quota/registry credentials were not revalidated by the workstation transport change |

`all.sh` is the shared workstation orchestrator. It now requires either loaded
images or registry mode; its former implicit remote-build behavior is rejected.
Direct droplet `api.sh`/`bot.sh` calls without a mode retain historical behavior,
so do not use them for routine releases.

Loaded-image releases extract the selected commit into the read-only directory
`/opt/chronicler/deploy-state/releases/<commit>`. The API, scheduler, Caddy and
Compose commands run from that tree with the existing absolute `.env.prod` and
stable `chronicler` Compose project. After health verification,
`deploy-state/current-release` points to the active tree. Rollback receipts name
the prior image IDs, source revision, release root, and Compose project so an old
image is never paired with an unrelated current checkout.

Normal releases require SSH/Docker access and a clean source checkout on
`origin/main`. Database-changing releases also require the approved local backup
and strict restore proof. The workstation entrypoint does not promote Vercel;
frontend promotion remains a separate explicit operation below.

### The restore point, and which routes are gated

A deploy that runs migrations takes a `pg_dump` **first**, on the machine that
already holds the credential, never on the droplet. `scripts/deploy/restore_point.sh`
answers whether a fresh enough dump exists; if not, one is taken before the
droplet is contacted at all.

| Route to a migration | Restore-point gated? |
|---|---|
| Workstation image deployment through `scripts/deploy/all.sh` with migrations enabled | **Yes**, on the workstation before migration/activation. Building/loading images can precede this gate without changing the running service. |
| `deploy.yml` | **Yes**, the `restore_point` job, which `deploy` needs. |
| `cd-deploy.yml` dispatched on its own | **No.** It SSHes straight to the scripts. |
| A human's `ssh` + `bash scripts/deploy/api.sh` | **No, by design.** The checkpoint is deliberately off-droplet. |

R4 is satisfied for the deploy paths this project owns. It does **not** mean
every migration has a restore point. Closing the bottom two rows would need a
dump credential on the droplet, which is exactly what D10's pull model forbids:
a compromised droplet must not be able to reach the backups.

### Not a recovery route: raw `docker compose up`

Do not recover a broken deploy with `docker compose up -d api`. It walks past
`ensure_db` (`scripts`deploy` shared scripts), the guard that decides
whether a local `db` container is needed at all by inspecting `DATABASE_URL`.
In production `DATABASE_URL` points at Supabase and `ensure_db` correctly does
nothing; bypassing it is how a local Postgres gets started next to an external
one. Use `bash scripts/deploy/api.sh`, which sources the guard.

### Migrate runs against the freshly built image, not the stale one

`migrate` shares the api image (`docker-compose.yml`), so it carries
whatever tree was built last. `run_migrate` (`scripts/deploy/_common.sh`)
now builds or pulls that image itself, immediately before running it,
instead of trusting a prior step to have done so: under a constant local
tag, `compose run` alone never rebuilds an image that already exists, so
migrate previously ran the OLD tree's alembic head check and exited 0
without applying anything (#440). Every caller (`api.sh`, `full.sh`) gets
this at the one place `run_migrate` is defined.

### Frontend promotion

A merge to `main` makes Vercel **build** a production deployment; it does not go
live on its own, **provided** auto-assign to the production domain stays
disabled for this project. That is a dashboard setting this repo cannot flip;
`scripts/deploy/check_autopromote.sh` verifies it via the Vercel API on the
promote path whenever `VERCEL_TOKEN` is set (the CI path always is; a
workstation run using local CLI auth is not, and the check says `SKIPPED`
out loud rather than failing). It never asserts the toggle silently. See
[vercel-promotion.md](/deploy/docs/vercel-promotion.md) for the full mechanism and the
2026-08-01 counter-evidence that prompted the check. Until verified, the
build sits at its own deployment URL: a real production build, not a PR
preview.

Legacy `all.sh` callers and `deploy.yml` finish by running
`scripts/deploy/promote_frontend.sh`, which resolves the newest `Ready`
production deployment and promotes it. To promote a specific deployment by hand:

```bash
scripts/deploy/promote_frontend.sh <deployment-url-or-id>
```

Rationale and the dashboard toggle: [vercel-promotion.md](/deploy/docs/vercel-promotion.md).

## Backups

**One line of defence, not two.** This section claimed two until 2026-08-09;
both were already gone and it had not been updated to match
[supabase-backups.md](/deploy/docs/supabase-backups.md), which was corrected 2026-07-31.

| Was claimed | Actual |
|---|---|
| Supabase managed backups, dashboard restore | **Do not exist.** Free tier has no automated backups; PITR is a paid add-on on a paid tier. Ref `rcfsicokwzzctljtthrt` is on Free |
| Daily CI `pg_dump`, 90-day artifact (`.github/workflows/backup-supabase.yml`) | **Has not run since 2026-07-21**, when GitHub Actions billing failed. The workflow file is still present, which is why it reads as live |

The real mechanism is the workstation launchd nightly `com.chronicler.backup`
(`scripts/backup/mac_backup.sh`), writing to `~/chronicler-backups`, which
dumps the `public` schema and then test-restores it. It runs only when that
workstation is awake.

**It used to fail silently and leave a 0-byte file that looked like a backup.
Fixed 2026-08-09; the three failure modes and why none of them alerted are
worth keeping, because each was a different bug.**

| Failed | Why it was silent | Fix |
|---|---|---|
| The dump itself, 3 of the 6 nights to 2026-08-09 (Aug 4, 5, 7), every one `pg_dump: error: query failed: SSL error: unexpected eof while reading` | `supabase_backup.sh`'s empty-dump check ran **after** `pg_dump` under `set -e`, so a failing `pg_dump` killed the script before the check that was written to delete the 0-byte file | `pg_dump` now writes `.partial` and is renamed to `.pgdump` only on success (atomic publish), so nothing bearing the dump name is ever incomplete |
| The alert | Every `alert_failure` call sat on a pre-flight or post-restore path. The dump step was a bare `docker run` under `set -e`, so the one failure that actually occurs exited before alerting | The `docker run` exit code is handled explicitly and alerts |
| The alert, again | `ALERT_WEBHOOK_URL` points at a **throwaway test channel**, not an ops channel | **Not fixed.** Needs a real webhook from the owner |

Verified 2026-08-09 end to end: a forced dump failure now leaves no `.pgdump`
and no `.partial`, and posts to the webhook (HTTP 204). A clean run still
restore-verifies at 58 tables.

The restore-verify step still runs only after a dump succeeds. That is correct
now that a failed dump cannot produce a file, but it means verify is not a
second line of defence against dump failure, only against dump corruption.

**Take a fresh `predeploy` dump before any migration** rather than assuming
last night's worked:

```bash
ls -lht ~/chronicler-backups | head
```

Setup, restore procedures (test restore vs. live disaster recovery), and the
droplet-cron alternative: [supabase-backups.md](/deploy/docs/supabase-backups.md).

## Rollback

**Backend:** redeploy the previous image tag. Run **Deploy to Droplet**
again with `image_tag` set to the last-known-good commit SHA (leave it
empty to redeploy `HEAD` of `main`, use `latest` for the newest `main`
build). See the `image_tag` row in
[digitalocean-droplet.md § Manual deploy](/deploy/docs/digitalocean-droplet.md#manual-deploy-github-actions).

For workstation loaded-image releases, use the prior rollback receipt to select
both the retained image tag and its matching immutable release tree. Registry
workflow rollbacks still follow their own checked-out-tree behavior and must not
be represented as this stronger paired rollback.

**Frontend:** promote an earlier deployment the same way as a forward
promotion:

```bash
scripts/deploy/promote_frontend.sh <previous-deployment-url-or-id>
```

**Database:** the logical-dump restore is the only path. There is no
dashboard restore to prefer over it: see [Backups](#backups) above.
Procedure: [supabase-backups.md § Restore
procedures](/deploy/docs/supabase-backups.md#restore-procedures).

**A schema migration does not roll back by reverting the commit, and the
order is not optional.** Alembic records the applied revision in the database,
not in git. Reverting a migration commit deletes the file the database still
names as its head, and every subsequent `alembic upgrade head` then fails
against a revision it cannot find, breaking all future deploys rather than
the current one.

| Step | Command | Why this order |
|---|---|---|
| 1 | Fresh `predeploy` dump, and check it is not 0 bytes | The only route back if step 2 misbehaves |
| 2 | `alembic downgrade <parent-revision>` against production | Must happen **while the migration file still exists** in the deployed tree |
| 3 | `git revert` the migration commit, redeploy | Safe only once the database no longer names that revision |

Name the parent revision explicitly. Do not use a relative `downgrade -1`:
what `-1` resolves to depends on the head at the moment it runs, so the same
command means different things before and after any later migration lands.
Older history also contains merge nodes, where relative offsets stop being
well defined at all.

## Local dev / QA

Not production. Fresh clone → running stack with seed data and a dev token
per role: [fresh-db-bootstrap.md](/deploy/docs/fresh-db-bootstrap.md).
