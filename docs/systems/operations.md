# Operations: releases, backups, and recovery

**Map:** [systems map](/docs/systems.md)

## Release authority

GitHub Actions is the single production release authority. Feature branches squash-merge into up-to-date `staging`; a normal merge through a pull request moves `staging` to `main`. CI runs on pull requests. Direct pushes to `main` and pull requests from other branches to `main` are not part of the branch policy.

Staging deployment is planned as a manual workflow dispatch on the owner's self-hosted runner. Production deployment is planned from a CalVer tag on `main` to one DigitalOcean droplet and Vercel. These workflows are not implemented. The current image publication workflow does not deploy or roll back.

## Backups and recovery

[D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) requires nightly and pre-deployment pull backups of the droplet PostgreSQL database to the owner's workstation. Actions must receive current restore-point evidence before migrations. The database, backup mechanism, evidence handoff, and restore path are not yet implemented or verified in the current deployment files.

## Interfaces and requirements

[Actions releases](/docs/interfaces/actions-releases.md) defines admission and release evidence. [Work queue durability](/docs/interfaces/work-queue-durability.md) defines durable work and failure boundaries. [Operations requirements](/docs/requirements/by-system/operations.md) records implementation evidence and open gaps.

The [deployment guides](/deploy/docs/README.md) describe the staging and production target. No live host, provider, DNS, tunnel, or release was checked for those guides.
