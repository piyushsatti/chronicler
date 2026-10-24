# Droplet disk maintenance

This page describes read-only diagnostics for the planned production droplet. No host measurements or maintenance settings were verified during this documentation update.

With separately authorized read access, inspect disk use and Docker state:

```bash
df -h /
docker system df -v
journalctl --disk-usage
docker info --format '{{.DriverStatus}}'
```

Record the host identity and capture time. These commands do not establish a maintenance schedule or prove that a proposed limit is active.

Preserve PostgreSQL data and the exact artifacts needed for rollback. Never use `docker system prune --volumes` or remove database directories as routine cleanup. Review any image cleanup against retained rollback targets first.

Production release and rollback remain GitHub Actions operations. The current workflow does not implement either path. Host maintenance that restarts services needs a separate reviewed scope and must not become a deployment fallback. See the [droplet target](/deploy/docs/digitalocean-droplet.md) and [release runbook](/deploy/docs/deploy-runbook.md).
