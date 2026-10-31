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

Two things grow on the production VM with every release: locally built `chronicler-api` and `chronicler-discord` images tagged with the release tag, and one `pg_dump` file per deployment in `~/backups/chronicler-production`. No workflow removes either. Review image cleanup against the retained rollback target first, and delete dumps only after the off-machine copy decision in [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) is implemented.

Never use `docker system prune --volumes` or remove database directories as routine cleanup. Production has no database volume, but staging does.

Production release and rollback remain GitHub Actions operations. Host maintenance that restarts services needs a separate reviewed scope and must not become a deployment fallback. See the [VM target](/deploy/docs/production-vm.md) and [release runbook](/deploy/docs/deploy-runbook.md).
