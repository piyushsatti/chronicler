# Deployment runbook

## Release path

`main` is the trunk. Every change reaches `main` through a pull request with a squash merge; merge commits and rebase merges are disabled. Pull requests into `main` must pass the `go`, `web`, `agent`, and `tooling` checks. Nobody pushes directly to `main`, and the ruleset has no bypass. Long-lived feature work uses a branch named `integration`, which also squash-merges into `main`. Merged branches are deleted automatically.

A staging release starts from a tag in `staging-YYYY.MM.DD.N` form on a selected commit. There is no staging branch and no manual dispatch. The target staging workflow runs on a self-hosted runner on the owner's machine. It runs the backend with Docker Compose, exposes the API through Cloudflare Tunnel at `chronicler-api.piyushsatti.com`, and deploys the frontend to Vercel at `chronicler.piyushsatti.com`.

A production release starts from a CalVer tag in `YYYY.MM.DD` or `YYYY.MM.DD.N` form. The tag must point to a commit on `main`. GitHub Actions deploys the backend to one DigitalOcean droplet with [`compose.production.yaml`](/deploy/compose.production.yaml) and GHCR images, checks health, and retains an exact rollback target without deleting the database. The same release deploys the frontend to Vercel at `chronicler.smokebombstudios.com`; its API origin is `api.chronicler.smokebombstudios.com`.

Production deploy, promotion, and rollback use one admitted Actions run under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [release interface](/docs/interfaces/actions-releases.md). If a required gate or Actions run is unavailable, production change stops.

## Current implementation

These workflows are not implemented yet. The current [`deploy-api.yml`](/.github/workflows/deploy-api.yml) builds and publishes the API image (`ghcr.io/piyushsatti/chronicler/api`) and the Discord bot image (`ghcr.io/piyushsatti/chronicler/discord`). It does not deploy staging or production, migrate a database, promote Vercel, verify a release, or roll back. The current publication workflow is not a release path, and there are still no staging or release workflows.

[`deploy/compose.production.yaml`](/deploy/compose.production.yaml) now declares the full stack: `chronicler-postgres` (PostgreSQL 16 with a named volume), `chronicler-api` (the Go API with the background-job worker running in the same process), `chronicler-discord-bot`, and `chronicler-caddy` (Let's Encrypt reverse proxy for `API_DOMAIN`, only under the `tls` profile). Variables are listed in [`deploy/production.env.example`](/deploy/production.env.example). The API listens on `127.0.0.1:${API_PORT:-8080}`; the images come from `API_IMAGE` and `DISCORD_IMAGE`, or are built from the repository with `--build` when those are unset.

Migrations are not a container and never run at API boot. The API binary embeds the goose migrations and applies them on request with `docker compose -f deploy/compose.production.yaml run --rm chronicler-api migrate` (`migrate status` lists them). [`scripts/backup-db`](/scripts/backup-db) writes a `pg_dump -Fc` file from the running Postgres container. Nothing yet wires the migration, backup admission, health verification, or rollback into a GitHub Actions release workflow, so do not claim this stack is deployed or releasable through Actions today.

The staging API tunnel and staging Vercel routing also remain unimplemented. The current local Compose file does not forward `PLATFORM_OWNER_DISCORD_ID` to the API container; the staging configuration must add it. [`apps/web/vercel.json`](/apps/web/vercel.json) contains production API routing. Do not use it unchanged for staging. The later workflow/configuration change must route the staging site to `chronicler-api.piyushsatti.com` and deploy the same source revision to both services.

## Release safeguards

Before a production release, the future workflow must validate the tag and its ancestry on `main`, identify exact immutable artifacts, and use protected credentials and a serialized deployment. It must admit the D10 pre-deployment restore-point evidence before any migration, verify each deployed surface, and retain a non-secret receipt. A rollback must select a recorded compatible target and preserve PostgreSQL data.

`PLATFORM_OWNER_DISCORD_ID` comes from a GitHub secret in an Actions job or from the host environment. Never add the identifier or secret values to repository files, logs, or artifacts.

## Related guides

[Droplet target](/deploy/docs/digitalocean-droplet.md), [database backups](/deploy/docs/supabase-backups.md), [Vercel routing](/deploy/docs/vercel-frontend.md), [Vercel promotion](/deploy/docs/vercel-promotion.md), and [secrets](/deploy/docs/secrets-overview.md) describe their respective boundaries.
