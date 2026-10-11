# DigitalOcean droplet guidance

**Verdict:** historical host notes are not an executable release runbook. Production changes follow [actions-releases](/docs/interfaces/actions-releases.md); [deploy-runbook](/deploy/docs/deploy-runbook.md) owns admission and recovery. There is no workstation or urgent SSH deployment exception.

## Current repository boundary

[Production Compose](/deploy/compose.production.yaml) defines `api` and `worker`, immutable image selection to be supplied through `API_IMAGE` and `WORKER_IMAGE`, and external database/secret configuration. The file does not deploy itself and currently has no Actions activation job. It does not declare Caddy, a scheduler, Discord gateway, agent, frontend or migration service.

[Local Compose](/deploy/compose.yaml) is development setup, including local Postgres, seed and permissive development defaults; do not treat it as a production override. The current Go containers listen on API port 8080, not the historical Python port 8000.

The legacy backend/Caddy droplet, Vercel SPA and Supabase database topology is historical evidence. Reconfirm host identity, capacity, ingress/TLS, database target, service inventory and running source/artifact identities before admitting a rebuilt production release. The older `docker-compose.prod.yml`, `scripts/deploy/*`, `deploy.yml` and `cd-deploy.yml` are absent here.

## Host and credential preparation

An operational plan must identify the existing host, required ingress, service/worker identities, database connectivity, private credential delivery and least-privilege workflow access. Do not infer live DNS, SSH access, sudo policy, provider tier or secret placement from archived setup instructions. Registered identifiers and configuration changes require their own authorization.

Actions may invoke scoped host/provider primitives inside its admitted mutating job; operators must not clone/pull production `main`, load images, recreate services or run migration commands over raw SSH as a release path. Host/bootstrap maintenance is separately scoped; any resulting production deployment still follows D33.

Database migration connectivity must support the selected Goose transaction/DDL requirements. Verify the actual target, TLS/pooler mode and privileges without logging credentials. Historical asyncpg, Alembic and PGMQ recipes do not establish the rebuilt Go database contract.

## Verification and gaps

The current `deploy-api` / `build-and-push` job builds and publishes API/worker images. Its `environment` dispatch input only selects tags. There are no `api`, `bot`, `full`, `image_tag` or `run_migrate` dispatch inputs, no host promotion job and no rollback operation.

Host activation, protected-job admission, restore-point integration, precise artifact/configuration binding, all-surface identity/behavior verification and rollback remain work. Until implemented, stop before production mutation.

## Supporting guidance

- [Backups and restore](/deploy/docs/supabase-backups.md) — required pull policy and recovery proof.
- [Frontend configuration](/deploy/docs/vercel-frontend.md) and [promotion](/deploy/docs/vercel-promotion.md).
- [Disk hygiene](/deploy/docs/droplet-disk-hygiene.md) — read-only discovery and separately scoped maintenance.
- [Secrets](/deploy/docs/secrets-overview.md) — no secret values in docs or receipts.
