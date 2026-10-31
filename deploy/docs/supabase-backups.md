# Production PostgreSQL backups

## Accepted policy

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) requires nightly and pre-deployment pull backups of the production PostgreSQL database. The owner's workstation is the durable backup store, outside the provider and VM failure domains. A compromised production host must not be able to reach or delete that store. The production database is Supabase PostgreSQL ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)).

This policy is separate from release execution. The workstation may pull backups and run isolated restore drills. Production deployment and rollback remain GitHub Actions operations under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md).

## Current implementation

The production release workflow takes a pre-deployment restore point before `migrate`. [`scripts/backup-db`](/scripts/backup-db) with `-u` runs `pg_dump -Fc` against `DATABASE_URL` inside a pinned PostgreSQL 17 client container and writes `chronicler-<UTC timestamp>.dump` under `~/backups/chronicler-production` on the production VM, mode 600. It removes the `pool_*` settings the API reads from the same URL, because libpq rejects them. It does not print the URL, and an empty dump fails the step. A newer client dumps older servers, so raise the pinned client image when the hosted server's major version passes 17. Whether a full-database dump runs cleanly against Supabase's managed schemas with the pooled role is unverified; restrict the dump if it fails on permissions.

This is one copy on the same VM that runs the application. It does not meet D10: no workstation pull, nightly cadence, second copy, or restore drill exists, and the off-machine copy is an open owner decision. Supabase's own backups are a separate provider feature that has not been checked, and nothing here relies on them. No current dump, restore, or Actions evidence handoff was verified.

Do not treat a non-empty dump, old transcript, or scheduled job as proof of a usable backup. The workflow admits only the dump it just took; it does not yet check current off-machine provenance. Before it can satisfy R3 of the release contract, it must receive current backup provenance and restore-point evidence and stop if that evidence is missing or stale.

Staging keeps a Compose-managed PostgreSQL. Its dump uses the same script without `-u` and writes `~/backups/chronicler-staging`.

## Backup and restore evidence

Record the source database, capture time, schema or migration identity, and dump checksum without recording credentials. Publish a dump only after the command completes successfully. Restore it to an isolated compatible database (restore with `pg_restore --no-owner` outside Supabase, using PostgreSQL 17 client tools or newer: the dumps come from the pinned `pg_dump` 17, and older `pg_restore` rejects them) and check schema, representative data, constraints, authorization, and durable work state.

Keep the restore target separate from production. A live database restore requires a separately reviewed destructive recovery plan. If it is part of release rollback, Actions owns the operation and verification. Preserve PostgreSQL data during normal deployment and rollback.

The policy currently has one workstation copy planned. A second copy and restore-drill cadence remain open. Do not claim a measured RPO or RTO. See [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md), the [release interface](/docs/interfaces/actions-releases.md), and the [deployment runbook](/deploy/docs/deploy-runbook.md).
