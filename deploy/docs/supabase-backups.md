# Production PostgreSQL backups

## Accepted policy

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) requires nightly and pre-deployment pull backups of the production PostgreSQL database on the DigitalOcean droplet. The owner's workstation is the durable backup store, outside the provider and droplet failure domains. The compromised production host must not be able to reach or delete that store.

This policy is separate from release execution. The workstation may pull backups and run isolated restore drills. Production deployment and rollback remain GitHub Actions operations under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md).

## Current implementation gap

The old Supabase backup jobs and helper scripts are absent. The production Compose file currently expects an external `DATABASE_URL` and does not include PostgreSQL. No current backup cadence, droplet database, successful dump, restore, or Actions evidence handoff was verified. The approved target is droplet PostgreSQL, but the Compose and deployment workflow still need to implement it.

Do not treat a non-empty dump, old transcript, or scheduled job as proof of a usable backup. Before release migration, the future Actions workflow must receive current backup provenance and restore-point evidence. It must stop if that evidence is missing or stale.

## Backup and restore evidence

Record the source database, capture time, schema or migration identity, and dump checksum without recording credentials. Publish a dump only after the command completes successfully. Restore it to an isolated compatible database and check schema, representative data, constraints, authorization, and durable work state.

Keep the restore target separate from production. A live database restore requires a separately reviewed destructive recovery plan. If it is part of release rollback, Actions owns the operation and verification. Preserve PostgreSQL data during normal deployment and rollback.

The policy currently has one workstation copy. A second copy and restore-drill cadence remain open. Do not claim a measured RPO or RTO. See [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md), the [release interface](/docs/interfaces/actions-releases.md), and the [deployment runbook](/deploy/docs/deploy-runbook.md).
