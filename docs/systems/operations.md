# Operations: releases, backups, and recovery

**Map:** [systems map](/docs/systems.md)

## Release authority

GitHub Actions is the single production release authority. `main` is the trunk: every change reaches it through a squash-merged pull request that passes the required CI checks. Direct pushes to `main` are blocked with no bypass.

Staging deployment runs from a `staging-YYYY.MM.DD.N` tag on the owner's self-hosted runner; there is no staging branch. Production deployment runs from a CalVer tag on `main` to one VM behind Cloudflare Tunnel, with Supabase PostgreSQL, and to Vercel ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)). Both call one reusable workflow and neither has been verified end to end. The image publication workflow does not deploy or roll back.

## Backups and recovery

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) requires nightly and pre-deployment pull backups of the production PostgreSQL database to the owner's workstation. The production workflow dumps the Supabase database on the VM before migrations; the workstation copy, the evidence handoff, and the restore path are not implemented or verified, and the off-machine copy is an open owner decision.

## Interfaces and requirements

[Actions releases](/docs/interfaces/actions-releases.md) defines admission and release evidence. [Work queue durability](/docs/interfaces/work-queue-durability.md) defines durable work and failure boundaries. [Operations requirements](/docs/requirements/by-system/operations.md) records implementation evidence and open gaps.

The [deployment guides](/deploy/docs/README.md) describe the staging and production target. No live host, provider, DNS, tunnel, Cloudflare WAF rule, or release was checked for those guides.
