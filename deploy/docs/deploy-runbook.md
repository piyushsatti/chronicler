# Deployment runbook

## Release path

`main` is the trunk. Every change reaches `main` through a pull request with a squash merge; merge commits and rebase merges are disabled. Pull requests into `main` must pass the `go`, `web`, `agent`, and `tooling` checks. Nobody pushes directly to `main`, and the ruleset has no bypass. Long-lived feature work uses a branch named `integration`, which also squash-merges into `main`. Merged branches are deleted automatically.

A staging release starts from a tag in `staging-YYYY.MM.DD.N` form on a selected commit. There is no staging branch and no manual dispatch. [`deploy-staging.yml`](/.github/workflows/deploy-staging.yml) runs on a self-hosted runner on the owner's machine. It runs the backend with Docker Compose and its own PostgreSQL, exposes the API through a Cloudflare Tunnel on that host at `chronicler-api.piyushsatti.com`, and deploys the frontend to Vercel at `chronicler.piyushsatti.com`.

A production release starts from a CalVer tag in `YYYY.MM.DD` or `YYYY.MM.DD.N` form. The tag must point to a commit on `main`. [`deploy-production.yml`](/.github/workflows/deploy-production.yml) runs the backend on one VM with [`compose.production.yaml`](/deploy/compose.production.yaml): the API and bot use Supabase PostgreSQL through `DATABASE_URL`, and a `cloudflared` container in the same stack publishes the API at `chronicler-prod-api.piyushsatti.com`. It then deploys the frontend to Vercel at `chronicler.smokebombstudios.com`, which rewrites API paths to that origin. The target is recorded in [D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md).

Production deploy, promotion, and rollback use one admitted Actions run under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [release interface](/docs/interfaces/actions-releases.md). If a required gate or Actions run is unavailable, production change stops.

## Current implementation

Both release workflows are thin callers of [`deploy-release.yml`](/.github/workflows/deploy-release.yml), a reusable workflow (`workflow_call`) that holds the steps. Each caller supplies its trigger, tag rule, runner labels, GitHub environment, concurrency group, constants, and which optional Compose pieces run. The caller passes `secrets: inherit`: a job that calls a reusable workflow cannot set `environment`, so the called jobs name it, and environment secrets reach them only through the caller's inherited secrets. A secret that is not passed resolves to an empty string without an error, so the workflow's missing-value check is the gate. The caller's `env` is not propagated, and a concurrency group shared by caller and called workflow would cancel the run, so concurrency is set only in the callers. See GitHub's [reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) and [reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations) references.

[`deploy-api.yml`](/.github/workflows/deploy-api.yml) still only publishes images (`ghcr.io/piyushsatti/chronicler/api` and `.../discord`). It does not deploy, migrate, promote Vercel, verify a release, or roll back, and it is not a release path.

[`deploy/compose.production.yaml`](/deploy/compose.production.yaml) serves both environments. `chronicler-api` (the Go API with the background-job worker in the same process) and `chronicler-discord-bot` always run. Two optional pieces are Compose profiles, selected by `COMPOSE_PROFILES`, which the workflow sets: `local-db` adds `chronicler-postgres` (PostgreSQL 16 with a named volume; staging), and `tunnel` adds `chronicler-cloudflared` (the pinned Cloudflare connector; production). The API uses `DATABASE_URL` when it is set and otherwise builds the local URL from `POSTGRES_*`. Variables are listed in [`deploy/production.env.example`](/deploy/production.env.example). The API listens on `127.0.0.1:${API_PORT:-8080}`; images come from `API_IMAGE` and `DISCORD_IMAGE`, or are built from the repository with `--build` when those are unset.

Compose interpolates every service, including those in inactive profiles, so a `:?` check cannot guard a variable only one mode needs. Compose keeps `:?` for what both modes need (`JWT_SECRET`, `INGEST_SECRET`, the bot values). The workflow checks each mode's own values before it deploys anything.

Migrations are not a container and never run at API boot. The API binary embeds the goose migrations and applies them on request with `docker compose -f deploy/compose.production.yaml run --rm chronicler-api migrate` (`migrate status` lists them). `migrate` strips the `pool_*` settings that the API's pgxpool reads from the same `DATABASE_URL`. [`scripts/backup-db`](/scripts/backup-db) writes a `pg_dump -Fc` file, from the running Postgres container, or with `-u` from the hosted database named by `DATABASE_URL`.

## Staging release

Cut a staging release by tagging the chosen commit and pushing the tag; there is no other trigger:

```bash
git tag staging-2026.10.25.1 <sha>
git push origin staging-2026.10.25.1
```

[`deploy-staging.yml`](/.github/workflows/deploy-staging.yml) serializes runs in the `staging` concurrency group (GitHub keeps only the newest pending run; older queued runs are cancelled, while a running deployment is never cancelled). It runs three jobs; the last two use the GitHub environment `staging`. `admit` runs on a GitHub-hosted runner and rejects any tag that does not match `staging-YYYY.MM.DD.N`.

The `backend` job runs on the self-hosted runner labelled `chronicler-staging`. It writes the Compose env file to `~/.config/chronicler-staging/staging.env` (mode 600, outside the workspace, rewritten every run), builds the API and bot images locally tagged with the release tag, and records the currently running image IDs as the rollback target. It then dumps the database with `scripts/backup-db` into `~/backups/chronicler-staging` (skipped only when the `chronicler-staging_chronicler_pg_data` volume does not exist, i.e. the first deploy; otherwise Postgres is started first), runs `chronicler-api migrate`, and starts Postgres, API and bot with `up -d --wait` under Compose project `chronicler-staging` (API on `127.0.0.1:8081`, profile `local-db`, no `tunnel` profile). It then requires `https://chronicler-api.piyushsatti.com/health` to return 204. If anything fails after the services start, it redeploys the previous image tags and the job still fails. Rollback does not restore the database; migrations are forward-only, so restore from the backup by hand only after review. The workflow never runs `down -v` or removes volumes. Missing secrets fail the job before deployment; the Discord bot is never started with defaults.

The `frontend` job runs after `backend` succeeds. It pulls the Vercel project settings, runs `vercel build --prod` and `vercel deploy --prebuilt --prod` with [`apps/web/vercel.staging.json`](/apps/web/vercel.staging.json) (API rewrites to `https://chronicler-api.piyushsatti.com`), and fails if the build output lacks that origin or contains the production API origin `chronicler-prod-api.piyushsatti.com`. The Vercel CLI version is pinned in the workflow. Vercel references: [`--local-config`](https://vercel.com/docs/cli/global-options#local-config), [`vercel build`](https://vercel.com/docs/cli/build), [`vercel deploy --prebuilt`](https://vercel.com/docs/cli/deploy#prebuilt), and the [GitHub Actions guide](https://vercel.com/guides/how-can-i-use-github-actions-with-vercel).

Environment `staging` secrets: `POSTGRES_PASSWORD` (URL-safe characters only), `JWT_SECRET`, `INGEST_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` (API worker REST token), `BOT_DISCORD_TOKEN` (gateway bot token), `BOT_CLIENT_ID`, `GUILD_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `DISCORD_ANNOUNCE_CHANNEL_ID` (secret or variable). Admins paste the announce channel ID, the quest role ID and the voice channel list under Admin, Delivery, Discord settings; `DISCORD_ANNOUNCE_CHANNEL_ID` is read only while that announce channel setting is empty. The API worker also reads `GUILD_ID` (event and message links) and `DISCORD_BOT_TOKEN`, which stay deploy secrets. Optional variables `POSTGRES_USER` and `POSTGRES_DB` default to `chronicler`. `PLATFORM_OWNER_DISCORD_ID` is an optional secret: the API refuses to start when the configured owner has no member record, and members are created only by signing in. On a new database, deploy without it, sign in once as the owner, then add the secret and push a new staging tag. The domains, CORS origin, redirect URI and port are constants in the caller. Secret values never appear in the repository, logs or artifacts.

One-time setup the owner performs:

- Install a GitHub Actions runner on the staging host with label `chronicler-staging`; the runner user must be able to use Docker.
- Run a Cloudflare Tunnel on the host that maps `chronicler-api.piyushsatti.com` to `http://127.0.0.1:8081`. Staging keeps this host-level tunnel on purpose ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)).
- Create the Vercel staging project with Root Directory `apps/web` (include source files outside the root directory), attach `chronicler.piyushsatti.com` as its production domain, and disable its Git auto-deploy.
- Register `https://chronicler.piyushsatti.com/auth/callback` (the web callback page) as a redirect URI on the Discord application.
- Create the `staging` environment and its secrets.

Provider settings, the tunnel, and the Vercel project are unverified, and no end-to-end staging release has been verified for these docs.

## Production release

Cut a production release by tagging a commit that is on `main` and pushing the tag:

```bash
git tag 2026.10.31 <sha>   # or 2026.10.31.1 for a second release that day
git push origin 2026.10.31
```

[`deploy-production.yml`](/.github/workflows/deploy-production.yml) serializes runs in the `production` concurrency group and runs three jobs:

1. `admit` (GitHub-hosted, no environment, no secrets) rejects a tag that does not match `YYYY.MM.DD` or `YYYY.MM.DD.N`, then fetches full history and fails unless the tagged commit is reachable from `origin/main`. It runs before any job names the `production` environment, so a protected-environment reviewer is never asked to approve a tag that cannot deploy.
2. `backend` runs on the self-hosted runner labelled `chronicler-production`, in the GitHub environment `production` and Compose project `chronicler-production`, in the same steps as staging with these differences. It writes `~/.config/chronicler-production/production.env`. It takes the restore point with `scripts/backup-db -u` before `migrate`: `pg_dump -Fc` of `DATABASE_URL` in a pinned PostgreSQL 17 client container, with the `pool_*` settings removed, into `~/backups/chronicler-production`. The URL is never printed. There is no first-deploy skip, because dumping an empty database is valid and a missing restore point must stop the release. It starts `chronicler-api`, `chronicler-discord-bot` and `chronicler-cloudflared` (profile `tunnel`, no `local-db`), and requires `https://chronicler-prod-api.piyushsatti.com/health` to return 204 with the same retry loop as staging. A later failure redeploys the previous API and bot images; the database is not restored.
3. `frontend` runs after `backend` on a GitHub-hosted runner with the same steps as staging, using [`apps/web/vercel.json`](/apps/web/vercel.json) and the Vercel production project. It fails if the build output lacks `chronicler-prod-api.piyushsatti.com` or contains the staging origin `chronicler-api.piyushsatti.com`.

Gaps against the [release contract](/docs/interfaces/actions-releases.md): images are built on the VM and tagged with the release tag, with no recorded registry digest (R1). If `frontend` fails after a healthy `backend`, the new API runs behind the previous frontend, and no frontend rollback target is recorded (R4, R7). No structured receipt is retained (R8). The restore point is a file on the VM, not the off-machine copy D10 requires (R3).

Environment `production` secrets are those of `staging` except `POSTGRES_PASSWORD` (and the `POSTGRES_*` variables), plus two:

- `DATABASE_URL`: the Supabase session pooler URI, `postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require`. Percent-encode reserved characters in the password. An optional `&pool_max_conns=N` caps the API's pool; without it pgxpool uses the greater of 4 and the CPU count, which is 4 on the 2 vCPU VM. `migrate` and `scripts/backup-db` strip it because libpq rejects it. The workflow rejects a value that is not a `postgres://` or `postgresql://` URL and one containing a single quote or newline.
- `CLOUDFLARE_TUNNEL_TOKEN`: the token of the remotely managed tunnel, passed to the connector as `TUNNEL_TOKEN`.

The domains, CORS origin (`https://chronicler.smokebombstudios.com`), redirect URI (`https://chronicler.smokebombstudios.com/auth/callback`) and port are constants in the caller. As on staging, deploy the first release without `PLATFORM_OWNER_DISCORD_ID`, sign in once as the owner, then add the secret and tag again.

Planned names, pending owner confirmation: GitHub environment `production`; secrets `DATABASE_URL` and `CLOUDFLARE_TUNNEL_TOKEN`; runner label `chronicler-production`; Compose project `chronicler-production`; Compose profiles `local-db` and `tunnel`. Renaming any of them means changing the caller and this page together.

One-time setup the owner performs, none of it verified:

- Prepare the VM and install the runner as described in [Production VM](/deploy/docs/production-vm.md).
- Create the Supabase project and copy its session pooler URI into the `DATABASE_URL` secret.
- In Cloudflare, create a remotely managed tunnel, store its token as `CLOUDFLARE_TUNNEL_TOKEN`, and add the public hostname `chronicler-prod-api.piyushsatti.com` with service `http://chronicler-api:8080` ([create a remote tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)).
- In the same zone, add the WAF custom rule that replaces Caddy's ingest block ([create a custom rule](https://developers.cloudflare.com/waf/custom-rules/create-dashboard/)): expression `(http.host eq "chronicler-prod-api.piyushsatti.com" and starts_with(http.request.uri.path, "/v1/ingest/"))`, action Block. Keep [URL normalization](https://developers.cloudflare.com/rules/normalization/) on so encoded paths match. The bot reaches ingest over the container network, so the rule affects only public traffic. After the first release, confirm a public `POST` without the secret to an ingest path is blocked by Cloudflare (403) rather than answered by the API (401, since it still requires the machine credential).
- Create the Vercel production project with Root Directory `apps/web` (include source files outside the root directory), attach `chronicler.smokebombstudios.com`, and disable its Git auto-deploy. `vercel.json` carries the same monorepo install and build commands as `vercel.staging.json`.
- Register `https://chronicler.smokebombstudios.com/auth/callback` as a redirect URI on the Discord application.
- Create the `production` environment and its secrets. Restricting its deployment tags to the CalVer pattern and requiring a reviewer are recommended protections; whether they are set is unverified.

## Release safeguards

Before a production release, the workflow validates the tag and its ancestry on `main`, serializes deployment, and takes a restore point before any migration. It does not yet admit a current off-machine restore point, record immutable artifact digests, verify the frontend revision, or retain a receipt; those remain required by the release contract. A rollback selects the recorded previous API and bot images and preserves PostgreSQL data.

`PLATFORM_OWNER_DISCORD_ID` comes from a GitHub secret in an Actions job or from the host environment. Never add the identifier or secret values to repository files, logs, or artifacts.

## Related guides

[Production VM](/deploy/docs/production-vm.md), [database backups](/deploy/docs/supabase-backups.md), [Vercel routing](/deploy/docs/vercel-frontend.md), [Vercel promotion](/deploy/docs/vercel-promotion.md), and [secrets](/deploy/docs/secrets-overview.md) describe their respective boundaries.
