# Deployment runbook

## Release path

`main` is the trunk. Every change reaches `main` through a pull request with a squash merge; merge commits and rebase merges are disabled. Pull requests into `main` must pass the `go`, `web`, `agent`, and `tooling` checks. Nobody pushes directly to `main`, and the ruleset has no bypass. Long-lived feature work uses a branch named `integration`, which also squash-merges into `main`. Merged branches are deleted automatically.

A staging release starts from a tag in `staging-YYYY.MM.DD.N` form on a selected commit. There is no staging branch and no manual dispatch. [`deploy-staging.yml`](/.github/workflows/deploy-staging.yml) runs on a self-hosted runner on the owner's machine. It runs the backend with Docker Compose, exposes the API through Cloudflare Tunnel at `chronicler-api.piyushsatti.com`, and deploys the frontend to Vercel at `chronicler.piyushsatti.com`.

A production release starts from a CalVer tag in `YYYY.MM.DD` or `YYYY.MM.DD.N` form. The tag must point to a commit on `main`. GitHub Actions deploys the backend to one DigitalOcean droplet with [`compose.production.yaml`](/deploy/compose.production.yaml) and GHCR images, checks health, and retains an exact rollback target without deleting the database. The same release deploys the frontend to Vercel at `chronicler.smokebombstudios.com`; its API origin is `api.chronicler.smokebombstudios.com`.

Production deploy, promotion, and rollback use one admitted Actions run under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [release interface](/docs/interfaces/actions-releases.md). If a required gate or Actions run is unavailable, production change stops.

## Current implementation

These workflows are not implemented yet. The current [`deploy-api.yml`](/.github/workflows/deploy-api.yml) builds and publishes the API image (`ghcr.io/piyushsatti/chronicler/api`) and the Discord bot image (`ghcr.io/piyushsatti/chronicler/discord`). It does not deploy staging or production, migrate a database, promote Vercel, verify a release, or roll back. The current publication workflow is not a release path, and there are still no staging or release workflows.

[`deploy/compose.production.yaml`](/deploy/compose.production.yaml) now declares the full stack: `chronicler-postgres` (PostgreSQL 16 with a named volume), `chronicler-api` (the Go API with the background-job worker running in the same process), `chronicler-discord-bot`, and `chronicler-caddy` (Let's Encrypt reverse proxy for `API_DOMAIN`, only under the `tls` profile). Variables are listed in [`deploy/production.env.example`](/deploy/production.env.example). The API listens on `127.0.0.1:${API_PORT:-8080}`; the images come from `API_IMAGE` and `DISCORD_IMAGE`, or are built from the repository with `--build` when those are unset.

Migrations are not a container and never run at API boot. The API binary embeds the goose migrations and applies them on request with `docker compose -f deploy/compose.production.yaml run --rm chronicler-api migrate` (`migrate status` lists them). [`scripts/backup-db`](/scripts/backup-db) writes a `pg_dump -Fc` file from the running Postgres container. Nothing yet wires the migration, backup admission, health verification, or rollback into a GitHub Actions release workflow, so do not claim this stack is deployed or releasable through Actions today.

## Staging release

Cut a staging release by tagging the chosen commit and pushing the tag; there is no other trigger:

```bash
git tag staging-2026.10.25.1 <sha>
git push origin staging-2026.10.25.1
```

[`deploy-staging.yml`](/.github/workflows/deploy-staging.yml) rejects any tag that does not match `staging-YYYY.MM.DD.N`, serializes runs in the `staging` concurrency group, and runs two jobs against the GitHub environment `staging`.

The `backend` job runs on the self-hosted runner labelled `chronicler-staging`. It writes the Compose env file to `~/.config/chronicler-staging/staging.env` (mode 600, outside the workspace, rewritten every run), builds the API and bot images locally tagged with the release tag, and records the currently running image tags as the rollback target. It then dumps the database with `scripts/backup-db` into `~/backups/chronicler-staging` (skipped only when Postgres is not yet running), runs `chronicler-api migrate`, and starts Postgres, API and bot with `up -d --wait` under Compose project `chronicler-staging` (API on `127.0.0.1:8081`, no `tls` profile). It then requires `https://chronicler-api.piyushsatti.com/health` to return 204. If anything fails after the services start, it redeploys the previous image tags and the job still fails. Rollback does not restore the database; migrations are forward-only, so restore from the backup by hand only after review. The workflow never runs `down -v` or removes volumes. Missing secrets fail the job before deployment; the Discord bot is never started with defaults.

The `frontend` job runs after `backend` succeeds. It pulls the Vercel project settings, runs `vercel build --prod` and `vercel deploy --prebuilt --prod` with [`apps/web/vercel.staging.json`](/apps/web/vercel.staging.json) (API rewrites to `https://chronicler-api.piyushsatti.com`), and fails if the build output contains the production API origin. The Vercel CLI version is pinned in the workflow. Vercel references: [`--local-config`](https://vercel.com/docs/cli/global-options#local-config), [`vercel build`](https://vercel.com/docs/cli/build), [`vercel deploy --prebuilt`](https://vercel.com/docs/cli/deploy#prebuilt), and the [GitHub Actions guide](https://vercel.com/guides/how-can-i-use-github-actions-with-vercel).

Environment `staging` secrets: `POSTGRES_PASSWORD` (URL-safe characters only), `JWT_SECRET`, `INGEST_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PLATFORM_OWNER_DISCORD_ID`, `DISCORD_BOT_TOKEN` (API worker REST token), `BOT_DISCORD_TOKEN` (gateway bot token), `BOT_CLIENT_ID`, `GUILD_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `DISCORD_ANNOUNCE_CHANNEL_ID` (secret or variable). Optional variables `POSTGRES_USER` and `POSTGRES_DB` default to `chronicler`. The domains, CORS origin, redirect URI and port are constants in the workflow. Secret values never appear in the repository, logs or artifacts.

One-time setup the owner performs:

- Install a GitHub Actions runner on the staging host with label `chronicler-staging`; the runner user must be able to use Docker.
- Run a Cloudflare Tunnel that maps `chronicler-api.piyushsatti.com` to `http://127.0.0.1:8081`.
- Create the Vercel staging project with Root Directory `apps/web` (include source files outside the root directory), attach `chronicler.piyushsatti.com` as its production domain, and disable its Git auto-deploy.
- Register `https://chronicler.piyushsatti.com/auth/discord/callback` as a redirect URI on the Discord application.
- Create the `staging` environment and its secrets.

The workflow has not run yet; provider settings, the tunnel, and the Vercel project are unverified.

## Release safeguards

Before a production release, the future workflow must validate the tag and its ancestry on `main`, identify exact immutable artifacts, and use protected credentials and a serialized deployment. It must admit the D10 pre-deployment restore-point evidence before any migration, verify each deployed surface, and retain a non-secret receipt. A rollback must select a recorded compatible target and preserve PostgreSQL data.

`PLATFORM_OWNER_DISCORD_ID` comes from a GitHub secret in an Actions job or from the host environment. Never add the identifier or secret values to repository files, logs, or artifacts.

## Related guides

[Droplet target](/deploy/docs/digitalocean-droplet.md), [database backups](/deploy/docs/supabase-backups.md), [Vercel routing](/deploy/docs/vercel-frontend.md), [Vercel promotion](/deploy/docs/vercel-promotion.md), and [secrets](/deploy/docs/secrets-overview.md) describe their respective boundaries.
