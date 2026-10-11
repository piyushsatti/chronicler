# Deploy runbook

**Verdict:** production deployment, promotion and rollback are Actions-only. The current `deploy-api` workflow publishes images; it does not provide an admitted production release or recovery operation. Stop before production mutation until the controls in [actions-releases](/docs/interfaces/actions-releases.md) are implemented and verified.

## Repository state and topology

- [Production Compose](/deploy/compose.production.yaml) declares Go API and worker images through `API_IMAGE` and `WORKER_IMAGE`, with an external `DATABASE_URL`. It does not declare migrations, frontend, bot, agent or Caddy.
- [Local Compose](/deploy/compose.yaml) supplies a development Postgres, migration/seed setup, API, worker and Discord gateway. Its development defaults, downloads and seed are not production admission.
- [Web Vercel configuration](/apps/web/vercel.json) declares proxy rewrites and an SPA fallback. This is repository configuration, not proof of live provider settings or deployment identity.
- The historical Vercel → Caddy/droplet → Supabase topology remains a starting point for operational discovery. Host size, provider plan, DNS, protection settings, secrets and running revisions require fresh evidence; older runbooks are not live-state verification.

## Release preparation and admission

Prepare these before an operator dispatches or approves a production-changing job:

1. Select one exact clean source revision, immutable artifact digests and matching configuration. Record affected surfaces and the prior verified target; do not choose `latest`, current host `main` or the newest provider build.
2. Confirm the workflow's protected environment, branch/tag policy, serialization and scoped credential exchange. Identify every mutating step, including migration, frontend domain assignment and rollback.
3. Verify the current pre-deployment pull backup and restore-point evidence. Before migration, prove restoreability against an isolated target and record the schema-compatible recovery plan; a non-empty file alone is insufficient.
4. Establish identity and behavior checks for frontend, API, worker, bot and other enabled production surfaces, including authorization and critical journeys. Keep verification credentials scoped and receipts free of secret values.
5. Execute only through the admitted Actions run, with one coordinated result. On any failed gate or verification, stop promotion and use the reviewed Actions recovery operation; never switch to a workstation or raw SSH release.
6. Retain the receipt required by interface R8, including actual verification results and unresolved failures. No production operation is authorized by this documentation update.

## Current enforcement gaps

`deploy-api` / `build-and-push` runs Go tests and publishes API/worker images tagged with `github.sha` and mutable environment tags. Its summary's manual Compose command is superseded by D33. It has no production-changing job, protected environment/concurrency admission, digest-bound deployment, restore-point gate, frontend promotion, schema application, full-surface verification, rollback or release receipt.

The older `deploy.yml`, `cd-deploy.yml`, `backup-supabase.yml`, `scripts/deploy/*` and workstation transport are absent from this checkout. Their old verification claims cannot certify the rebuild. Do not recreate their instructions as a fallback. Workflow YAML, host access and provider settings were not changed or live-verified during consolidation.

## Rollback and database recovery

Rollback is an Actions release operation with an exact prior target, the same post-change checks and a retained receipt. Pair artifacts with their recorded source/configuration and schema compatibility; reverting source alone does not undo database effects. Avoid ambiguous tags or relative migration offsets.

The rebuilt API uses Goose SQL migrations through `apps/api/scripts/migrate.sh`, not the legacy Alembic downgrade sequence. Existing applied-history reconciliation remains unresolved (`SCHEMA-HISTORY-01`). Do not rewrite migration history, discard data or apply the fresh initial schema to an existing database as an assumed upgrade. Review an explicit existing-data recovery plan before any production operation.

Production database restore requires a separately approved destructive plan: validate the target and dump provenance, quiesce all writers/consumers, select a schema-compatible application release, perform recovery through Actions when it is part of release rollback, verify data/authorization/work authority and retain the receipt. There is no current runnable production rollback or restore workflow to dispatch.

## Backups and non-release operations

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) retains the workstation pull backup store, nightly cadence and pre-deployment checkpoint; [backup and restore guidance](/deploy/docs/supabase-backups.md) separates policy, missing tooling and isolated recovery proof. Backing up locally does not grant local release authority. The mechanism for admitting this evidence into Actions remains work.

Read-only host diagnostics and authorized local backup/test-restore are not workstation deployments. Host maintenance still needs its own reviewed scope; using maintenance to restart/recreate a release, promote a frontend or mutate production source does not bypass D33.

## Detail guidance

- [Droplet](/deploy/docs/digitalocean-droplet.md) — repository topology and host preparation gaps.
- [Vercel frontend](/deploy/docs/vercel-frontend.md) and [promotion](/deploy/docs/vercel-promotion.md) — configuration and admission.
- [Disk hygiene](/deploy/docs/droplet-disk-hygiene.md) — diagnostics and deferred maintenance.
- [Secrets](/deploy/docs/secrets-overview.md) — credential boundaries without secret values.
- [Fresh local/QA bootstrap](/deploy/docs/fresh-db-bootstrap.md) and [Discord repair](/deploy/docs/discord-repair.md) — separate development/repair topics.
