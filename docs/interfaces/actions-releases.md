# Interface: GitHub Actions owns production releases

**Status:** accepted  
**Provider:** `.github/workflows` (Actions)  
**Consumers:** humans, agents, workstation scripts (must not be the production release path)

## Rule

Every production deployment, promotion, and rollback runs through GitHub Actions. Manual SCP/rsync, SSH mutation, or workstation deploy scripts are not a production release path. Repo scripts may be workflow primitives only. If Actions cannot run, stop.

## Enforcement

| Mechanism | Location | Status |
| --- | --- | --- |
| Workflow ownership + D33 | `.github/workflows`, [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) | **not enforced** (policy) |

## Provider

GitHub Actions workflows under `.github/workflows`.

## Consumers

Runbook steps in `deploy/` (and historically `deploy/docs/`) describe Actions-driven flows only.

## Related decisions

- [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)

## Reopen

A documented exception allows a human SSH production release path.
