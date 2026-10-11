# Droplet disk hygiene

**Verdict:** retained maintenance guidance, not a production deployment fallback. Fresh read-only diagnostics precede a separately authorized maintenance plan. Any service recreation or release/rollback mutation follows [actions-releases](/docs/interfaces/actions-releases.md).

## Historical problem and current boundary

The July 2026 disk-full incident and containerd garbage-collection failures motivated prune and log-cap proposals. Their recorded host usage, freed capacity, scheduler timing and owner acknowledgements are historical; none establish current host state or applied maintenance.

Actions unavailability no longer permits manual image builds/deployments on the droplet. Current [production Compose](/deploy/compose.production.yaml) declares API/worker only; the old Caddy/scheduler/local `pgdata` inventory must not be assumed current.

## Read-only discovery

Within separately approved host access, collect capacity, image/cache inventory, log use and daemon errors without changing state:

```bash
df -h /
docker system df -v
journalctl --disk-usage
du -sh /var/lib/docker/* 2>/dev/null | sort -h | tail
du -sh /var/lib/containerd 2>/dev/null
journalctl -u containerd --since '7 days ago'
docker info --format '{{.DriverStatus}}'
```

Retain capture time, host identity, installed service inventory and results. Do not publish secrets or infer an applied fix from a reference snippet.

## Maintenance preparation

- Identify live and dormant database volumes and preserve them. Never add `--volumes` to image/cache cleanup or remove data directories as a first response to GC failure.
- Preserve the exact prior known-good artifacts/configuration needed by release rollback. Broad unused-image pruning can remove rollback targets; review explicit cleanup scope against retained release receipts before scheduling it.
- Select one maintenance schedule only after current capacity and workload measurements. The historical Sunday 04:00 UTC cadence is a proposal, not a verified running timer.
- The prior journald 500 MiB and Docker `json-file` 10 MiB × 3 caps are sizing examples, not current configuration. Merge reviewed settings without overwriting unrelated daemon configuration; account for irreversible history trimming.
- Docker daemon restart can affect all containers. Existing container log settings may require recreation; plan downtime and verified recovery through the admitted release authority where a release changes.
- Repeated GC failures or space growth require diagnosis before destructive cleanup. Do not wipe containerd storage or forcibly remove content referenced by live images.

## Apply, verify and recover

There is no installed maintenance workflow or verified host change established by this page. Obtain a concrete reviewed maintenance plan and authorization before mutation, distinguishing host maintenance from a production release. Raw SSH release/recovery commands and unavailable historical deploy helpers are not substitutes.

Record pre/post capacity, effective daemon/log settings, installed schedule identity, retained rollback artifacts and service health. Configuration recovery does not restore log history already trimmed. Any release rollback uses an exact recorded target through Actions and repeats verification.

[Droplet guidance](/deploy/docs/digitalocean-droplet.md) and [deploy runbook](/deploy/docs/deploy-runbook.md) own topology/admission; no server changes were performed for documentation consolidation.
