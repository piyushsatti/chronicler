# DigitalOcean production droplet

## Target

The approved production backend target is one DigitalOcean droplet. GitHub Actions will deploy the API and worker from GHCR with [`compose.production.yaml`](/deploy/compose.production.yaml), check health, and retain a known-good rollback target. Production changes remain under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md).

The production database target is PostgreSQL on this droplet. The current production Compose file does not define PostgreSQL, ingress, or migrations. It expects an external `DATABASE_URL`. The file therefore does not yet implement the approved complete target.

## Access and host setup

Live droplet identity, size, operating system, ingress, DNS, certificates, database state, installed services, and credentials have not been verified here. Establish them through the approved operational process before building the Actions deployment. Do not infer live state from old notes.

Production release credentials must reach only the protected Actions job that performs the change. `PLATFORM_OWNER_DISCORD_ID` is supplied through a GitHub secret or host environment. Keep its value out of repository files and logs. Do not deploy by copying files, transferring images, or running release commands over workstation SSH.

## Required deployment behavior

The Actions release must select a CalVer tag that points to `main`, deploy exact GHCR artifacts, wait for the API health check, and preserve PostgreSQL data through deploy and rollback. It must admit the current D10 backup and restore evidence before migrations. The present Compose file lacks those database and migration steps, and no release workflow performs them yet.

See the [deployment runbook](/deploy/docs/deploy-runbook.md), [backup policy](/deploy/docs/supabase-backups.md), and [disk guidance](/deploy/docs/droplet-disk-hygiene.md).
