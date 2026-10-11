# Operations: release authority, backups and recovery

**Map:** [systems.md](/docs/systems.md)

## What it is

Operations releases accepted revisions, protects recoverable data and exposes failure. GitHub Actions is the sole production deployment, promotion and rollback authority; missing workflow controls or Actions unavailability block production change.

The accepted backup policy remains nightly and pre-deployment pull backups to the owner's workstation, separate from release execution. The historical droplet/Caddy, Vercel and Supabase topology needs current evidence; old host capacity, expired billing limits and manual interim releases are not current authority.

## Interfaces

| Interface                                                          | Role                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [actions-releases](/docs/interfaces/actions-releases.md)           | Release admission, coordinated verification and recovery evidence |
| [work-queue-durability](/docs/interfaces/work-queue-durability.md) | Durable work and failure boundary                                 |

## Implemented by

[Deploy guidance](/deploy/docs/README.md) separates required controls from available tooling. `deploy-api` currently publishes API/worker images only; production activation, rollback, receipt retention and backup integration remain incomplete.

## Requirements

[Operations requirements](/docs/requirements/by-system/operations.md) preserve R-ids and remaining evidence gaps. [Requirements index](/docs/requirements/index.md) tracks their disposition.
