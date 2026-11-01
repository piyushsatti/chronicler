# VM disk maintenance

This page describes read-only diagnostics for the planned production VM and for the staging host's release directories. No host measurements or maintenance settings were verified during this documentation update.

With separately authorized read access, inspect disk use and Docker state:

```bash
df -h /
docker system df -v
journalctl --disk-usage
docker info --format '{{.DriverStatus}}'
```

Record the host identity and capture time. These commands do not establish a maintenance schedule or prove that a proposed limit is active.

After public health succeeds, `deploy-release` removes old `chronicler-api` and `chronicler-discord` tags matching that environment's release pattern. It keeps the current tag and every image matching the recorded rollback image ID, and logs `docker system df` before and after. It does not prune unrelated images or build cache.

One `pg_dump` file per deployment still accumulates in `~/backups/chronicler-production`. The workflow leaves dumps untouched until the off-machine copy decision in [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) is implemented.

Never use `docker system prune --volumes` or remove database directories as routine cleanup. Production has no database volume, but staging does.

Production release and rollback remain GitHub Actions operations. Host maintenance that restarts services needs a separate reviewed scope and must not become a deployment fallback. See the [VM target](/deploy/docs/production-vm.md) and [release runbook](/deploy/docs/deploy-runbook.md).
