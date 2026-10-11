# Database backup and restore guidance

**Verdict:** preserve the accepted pull backup policy; the old scheduled jobs and helper scripts are absent from this rebuild. No current backup cadence, provider plan, successful restore or production recovery is established by historical transcripts.

## Accepted policy and current boundary

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) keeps backups durably on the owner's workstation, pulled off-provider and off-droplet nightly and before every deployment. The compromised production host must not be able to reach/destroy that backup store. A workflow backup may provide a redundant copy; it does not replace the accepted primary store without a new decision.

The older `mac_backup.sh`, `supabase_backup.sh`, `supabase_restore.sh`, `backup-supabase.yml` and their test harness are absent here. A historical launchd registration, backup artifact or non-empty dump is not evidence of the rebuilt mechanism's current operation. Reconfirm the actual database target, provider backup/PITR entitlement, retention, latest successful dump and independent recovery evidence before relying on them.

[D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) supersedes workstation releases, not authorized workstation pull backups or isolated restore drills. Actions must admit current backup/restore-point evidence before its migration job. The handoff and validation mechanism between the pull store and Actions remains unimplemented.

## Backup and evidence requirements

- Publish a dump only after successful completion; incomplete output must not masquerade as a recoverable backup. Propagate failure and record it through the accepted operational alert boundary.
- Bind evidence to the source database, capture time, schema/migration identity and dump checksum; retain it securely without connection secrets in public receipts.
- Prove the dump can restore into an isolated, explicitly identified compatible target. Verify schema, representative data, constraints, authorization and durable work state rather than accepting a public-table count alone.
- Establish that every required canonical store is covered; a PostgreSQL dump does not establish recovery of a separate archive/provider store.
- Preserve off-host storage isolation and the accepted retention boundary. The current single-site risk, second-copy strategy and recovery-drill cadence remain open; do not claim 3-2-1 or a measured RPO/RTO.
- Revalidate backup freshness before each deployment and restoreability before migration admission. Do not rely on a scheduled job's presence or last night's assumed success.

## Isolated restore drills

Local/scratch restore is a separate authorized operation, not a production release. Declare the disposable target and its isolation before running a restore; never default to a production connection. Retain the dump's provenance, tool/database versions, full error outcome and post-restore checks. A failed or partial restore remains a failed recovery proof.

The rebuild uses Goose/Postgres and fenced leases, not the legacy Alembic/PGMQ restore algorithm. Review current work-ledger and lease recovery against their owning contracts before testing; an old queue reconstruction receipt cannot certify current work authority. Existing applied migration-history reconciliation remains open (`SCHEMA-HISTORY-01`).

## Production recovery

A live restore needs a separately reviewed destructive recovery plan and authorization. When it is part of release rollback, Actions owns execution and verification under [actions-releases](/docs/interfaces/actions-releases.md). There is no current production restore workflow to recommend.

Before mutation, select an exact proven dump and schema-compatible application/artifact target; quiesce all producers and consumers; account for interrupted work, leases, idempotency and external side effects. After recovery, verify schema/data, current authority, work consistency and every enabled production surface, and retain a non-secret receipt. A source revert or image restart alone does not reverse database effects.

[Deploy runbook](/deploy/docs/deploy-runbook.md) owns release recovery. Local backup remains permitted within its own scope; this page does not authorize production restore, provider-plan changes, installation, credential changes or archive deletion.
