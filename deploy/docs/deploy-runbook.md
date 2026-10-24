# Deployment runbook

## Release path

Feature branches enter `staging` through an up-to-date pull request with a squash merge. A pull request from `staging` to `main` uses a normal merge. CI runs on pull requests. Do not push directly to `main` or open a `main` pull request from another branch.

The target staging release is a manual `workflow_dispatch` on a self-hosted runner on the owner's machine. It runs the backend with Docker Compose, exposes the API through Cloudflare Tunnel at `chronicler-api.piyushsatti.com`, and deploys the frontend to Vercel at `chronicler.piyushsatti.com`.

A production release starts from a CalVer tag in `YYYY.MM.DD` or `YYYY.MM.DD.N` form. The tag must point to a commit on `main`. GitHub Actions deploys the backend to one DigitalOcean droplet with [`compose.production.yaml`](/deploy/compose.production.yaml) and GHCR images, checks health, and retains an exact rollback target without deleting the database. The same release deploys the frontend to Vercel at `chronicler.smokebombstudios.com`; its API origin is `api.chronicler.smokebombstudios.com`.

Production deploy, promotion, and rollback use one admitted Actions run under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [release interface](/docs/interfaces/actions-releases.md). If a required gate or Actions run is unavailable, production change stops.

## Current implementation

These workflows are not implemented yet. The current [`deploy-api.yml`](/.github/workflows/deploy-api.yml) builds and publishes API and worker images. It does not deploy staging or production, migrate a database, promote Vercel, verify a release, or roll back. The current publication workflow is not a release path.

The production Compose file declares API and worker services with an external `DATABASE_URL`. It does not include PostgreSQL, an ingress service, or a migration command. The target production database is PostgreSQL on the droplet, so Compose and the release workflow still need the database, migration, backup admission, health, and rollback behavior. Do not claim this stack is deployable today.

The staging API tunnel and staging Vercel routing also remain unimplemented. The current local Compose file does not forward `PLATFORM_OWNER_DISCORD_ID` to the API container; the staging configuration must add it. [`apps/web/vercel.json`](/apps/web/vercel.json) contains production API routing. Do not use it unchanged for staging. The later workflow/configuration change must route the staging site to `chronicler-api.piyushsatti.com` and deploy the same source revision to both services.

## Release safeguards

Before a production release, the future workflow must validate the tag and its ancestry on `main`, identify exact immutable artifacts, and use protected credentials and a serialized deployment. It must admit the D10 pre-deployment restore-point evidence before any migration, verify each deployed surface, and retain a non-secret receipt. A rollback must select a recorded compatible target and preserve PostgreSQL data.

`PLATFORM_OWNER_DISCORD_ID` comes from a GitHub secret in an Actions job or from the host environment. Never add the identifier or secret values to repository files, logs, or artifacts.

## Related guides

[Droplet target](/deploy/docs/digitalocean-droplet.md), [database backups](/deploy/docs/supabase-backups.md), [Vercel routing](/deploy/docs/vercel-frontend.md), [Vercel promotion](/deploy/docs/vercel-promotion.md), and [secrets](/deploy/docs/secrets-overview.md) describe their respective boundaries.
