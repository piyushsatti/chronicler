# Supabase Backups + Restore

See [deploy-runbook.md](/deploy/docs/deploy-runbook.md) for the full deploy topology and
the end-to-end operating sequence; this file is the backup/restore detail.

Automated backups of the Chronicler Supabase Postgres, and how to restore them.
Closes issue **#78**. The database lives on Supabase (connection shapes +
extension audit in
[digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md#supabase-connection--extensions);
the one-time provisioning project is retired, see
retired Supabase migration notes — not vendored in repo);
this doc covers protecting it.

## Strategy — two lines of defence

1. **Supabase managed backups (primary).** Supabase takes its own backups on a
   cadence that depends on the project's plan:
   - **Free:** no automated backups. Do **not** rely on this tier for anything
     canonical.
   - **Pro:** daily backups, **7-day** retention.
   - **PITR add-on:** point-in-time recovery (paid), restore to any instant
     inside the window.
   Confirm the current tier and retention in Dashboard → **Database → Backups**.
   Restore is a dashboard action there.

   **Updated 2026-07-31:** the live project (ref `rcfsicokwzzctljtthrt`, region
   `ap-southeast-1`) is on the **Free** tier — no Supabase-side automated
   backups exist. Item 2 below is not a secondary line of defence on this
   project; the workstation launchd nightly (`com.chronicler.backup`, see the
   2026-07-31 note under "On-demand / droplet cron" below) is the actual
   mechanism. (The earlier Tokyo ref `zeekljdlbwewqdtopmng`
   was deleted 2026-07-27 along with its own backups and is not in use.)

2. **Self-owned logical dump (secondary — this repo).** A scheduled GitHub
   Actions job takes a portable `pg_dump` of the `public` schema (the app's
   Alembic-created tables, including `background_jobs` and `job_runs`), verifies
   it restores, and keeps it as an artifact. This is plan-independent,
   version-controlled, and downloadable — it survives even if the Supabase
   project itself is lost.

   PGMQ's `q_*` and `a_*` relations are extension members. PostgreSQL 16's
   `pg_dump` excludes them even with an explicit `--schema=pgmq` or `--table`
   selector, and PGMQ 1.5.1 does not register them as extension configuration
   tables. Chronicler therefore backs up the canonical public job/run ledger
   and reconstructs fresh PGMQ transport on restore. Raw PGMQ archive rows are
   diagnostic transport history; `job_runs` is the retained execution audit.

> During the testing window the old droplet-local `pgdata` volume is also
> retained as a cold fallback. Once the app leaves testing and holds canonical
> data, revisit retention and consider enabling the PITR add-on.

## The scheduled job

A scheduled backup workflow (when present under [`.github/workflows/`](/.github/workflows/README.md))
runs **daily at 04:23 UTC** (and on `workflow_dispatch`). Each run:

1. Dumps the live `public` schema with a backup script
   (`pg_dump -Fc --no-owner --no-privileges`).
2. **Test-restores that dump into a throwaway
   `ghcr.io/pgmq/pg17-pgmq:v1.5.1` service** with the matching restore script
   and asserts the public schema came back with at least one table. Once the
   durable migration is present, the target must make PGMQ available and the
   check must also prove one matching queue message per active ledger row, one
   dead-letter message per terminal row, no stale PGMQ receipts, no open
   restored worker attempts, and the scoped producer/worker privilege boundary.
3. Uploads the dump as a build artifact (**90-day** retention).

A **green run is the proof the backup is restorable** — the "Done when" of #78.
The restore target is always a disposable container, so the job can never touch
the live database (which OPUS may be scraping). A queue-mode green run that only
counts `public` tables is insufficient. The workflow target and the workstation
verification wrapper must both use the canonical restore script against a
PGMQ-capable disposable target before cutover.

The workstation wrapper uses `postgres:17` for the source-side dump and a
separate `ghcr.io/pgmq/pg17-pgmq:v1.5.1` target for verification. It delegates
the restore to the same canonical script as CI through a matching Postgres 17
client container. It propagates every restore error and does not treat a partial
restore or a public-table count as success.

### One-time setup: the connection secret

Add the repo secret **`SUPABASE_DATABASE_URL`** = the **IPv4 session-pooler**
connection string (GitHub runners are IPv4-only; the direct `db.<ref>.supabase.co`
host is IPv6-only without the add-on):

```bash
# paste the URL when prompted — it is never echoed or committed
gh secret set SUPABASE_DATABASE_URL --repo piyushsatti/chronicler
```

Form (from Dashboard → Project Settings → Database → Connection string → session
pooler):

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

The `postgresql+asyncpg://` form the app uses is also accepted — the scripts
normalise the driver suffix for the libpq tools.

Verify after adding: **Actions → Supabase Backup → Run workflow** (manual
dispatch) and confirm it goes green.

## Restore procedures

### A. Test restore into a scratch database (safe, repeatable)

This is what the CI job automates; run it by hand the same way. It cannot touch
prod — the restore script refuses any Supabase host unless `ALLOW_PROD_RESTORE=1`.

```bash
# 1. Start a throwaway Postgres 17 + PGMQ 1.5.1 target (Docker):
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 \
  ghcr.io/pgmq/pg17-pgmq:v1.5.1

# 2. Restore the newest dump and verify:
BACKUP_DIR=~/chronicler-backups \
TARGET_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres \
  ./scripts/deploy/supabase_restore.sh latest

# 3. Tear down:
docker rm -f pg-restore-test
```

To restore a dump downloaded from a CI run artifact, pass its path instead of
`latest`. A pre-durable dump still follows the original public-only path. A dump
that contains `public.background_jobs` is detected from the archive and fails
closed unless the target can install PGMQ and safely create or reuse the two
credential-free Chronicler group roles.

For durable dumps the restore transaction:

1. drops and recreates only the three fixed Chronicler PGMQ queues;
2. clears PGMQ receipt IDs copied from the old database;
3. recreates queued/retry messages from identifiers-only ledger payloads and
   preserves `next_attempt_at` delay;
4. closes an interrupted `running` attempt as failed and consumes one failure
   budget, matching visibility-expiry behavior; a final-attempt job becomes
   `dead`, otherwise it becomes `retry_wait`;
5. recreates dead-letter messages for `dead` and `repair_required` rows;
6. leaves `succeeded` and `cancelled` rows without a live transport receipt;
7. restores the migration's least-privilege producer/worker ACLs and removes
   ambient PGMQ/Public execution; and
8. verifies exact ledger-to-message correspondence and privilege separation.

This is at-least-once disaster recovery. A restored in-flight job can run
again, just as it can after an ordinary worker crash and visibility expiry.
Discord projection and maintenance handlers must retain their documented
idempotency and ambiguity-to-repair behavior.

### B. Restore into live Supabase ([HUMAN] — destructive)

Only for actual disaster recovery. **Prefer the Supabase dashboard restore**
(managed backup / PITR) when the data loss is recent — it is safer than a
logical reload. Use a logical dump only when the managed backup is unavailable
or too old.

This overwrites live data, so it is intentionally gated:

```bash
# Point at the live session-pooler URL and explicitly opt in.
ALLOW_PROD_RESTORE=1 \
TARGET_DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  ./scripts/deploy/supabase_restore.sh ~/chronicler-backups/chronicler-supabase-<stamp>.pgdump
```

`pg_restore --clean --if-exists` drops and reloads the `public` schema objects.
Stop the API, worker, legacy scheduler, and any enabled database cron schedule
before restoring; verify that no producer or consumer is writing. Durable
restore also replaces the three Chronicler PGMQ queues, so running it alongside
a worker can lose or duplicate work. Use the application release matching the
dump schema. The script never prints the configured target URL. Never paste the
password into git or a shared shell history.

## On-demand / droplet cron (alternative) — **NOT SANCTIONED, see 2026-07-31 note**

**Updated 2026-07-31:** `scripts/deploy/supabase_backup.sh`'s own header now
states *"Never run this from the droplet — D10 requires a pull model; a
droplet-held dump credential is the thing that ruling exists to prevent"*
(`supabase_backup.sh:11-12`). This section predates that rule. The workstation
launchd nightly (`com.chronicler.backup`, verified live via `launchctl list`)
plus the pre-deploy checkpoint are the actual mechanism; the cron entry below
is not to be configured. Not verified against the droplet this pass (no SSH
run) — recorded from the script's own guard, not from droplet inspection.

The same backup script runs anywhere pg_dump reaches the DB. On the droplet the
`DATABASE_URL` is already in `.env.prod`, so a cron entry needs no new secret:

```cron
# /etc/cron.d/chronicler-backup — daily 04:23 UTC, keep 14 days locally
23 4 * * *  deploy  cd /opt/chronicler && set -a && . .env.prod && set +a && \
  BACKUP_DIR=/opt/chronicler/backups RETENTION_DAYS=14 \
  bash scripts/deploy/supabase_backup.sh >> /var/log/chronicler-backup.log 2>&1
```

(The droplet ships PostgreSQL client tools with Docker's Postgres image; run the
dump inside a `postgres:17` container if `pg_dump` isn't on the host PATH.)

## Upgrade path (post-testing)

The CI artifact store (90-day retention) is fine for the testing window. Once the
data is canonical, push dumps to durable object storage so they outlive Actions
retention and a repo loss:

- Add an upload step (DO Spaces / S3 / a Supabase Storage bucket) after the dump.
- Consider encrypting at rest (`age`/`gpg`) before upload — a logical dump is
  plaintext data.
- Enable the Supabase **PITR** add-on for tighter RPO than daily.

## Files

| Path | Role |
|---|---|
| `.github/workflows/backup-supabase.yml` | Scheduled dump + self-verifying test restore |
| `scripts/deploy/supabase_backup.sh` | `pg_dump` the Supabase `public` schema; fail closed if the durable ledger exists without its three queues |
| `scripts/deploy/supabase_restore.sh` | `pg_restore`, reconstruct durable PGMQ transport and scoped grants, and verify; prod-guarded |
| `tests/scripts/test_supabase_backup_restore_pgmq.sh` | Disposable PGMQ 1.5.1 ledger/transport/privilege restore proof |

> Note: `scripts/backend/backup-db.sh` / `restore-db.sh` target the **old
> local-container** dev database (`docker exec chronicler-db-1`), not Supabase.
> They remain for local development; the `scripts/deploy/supabase_*` pair is the
> Supabase path.
