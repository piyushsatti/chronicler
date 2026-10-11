# Interface: GitHub Actions owns production releases

**Status:** accepted  
**Provider:** `.github/workflows` (Actions)  
**Consumers:** humans, agents, release primitives and production surfaces

## Rule

Every production deployment, promotion and rollback uses one admitted GitHub Actions run. Workstation release paths are prohibited; if admission or Actions execution fails, stop. These are required controls, not a claim that the present workflow implements them.

| ID  | Required admission and execution contract                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Resolve one exact clean commit and immutable artifact set before mutation. Record artifact digests and the matching source/configuration revision; a mutable `latest` tag or newest provider deployment is not an exact target.                |
| R2  | Gate mutating jobs with the protected production environment, concurrency group and branch/tag policy. A dispatch input naming `production` alone is not protection.                                                                           |
| R3  | Prove a current restore point before migration and record the prior known-good rollback target. Honor D10's nightly and pre-deployment pull backup policy; admitting its evidence does not grant the workstation deployment authority.         |
| R4  | Coordinate frontend, API, background worker, bot, migrations, verification and rollback under one workflow run and one result. Record which production surfaces change and verification for every surface.                                     |
| R5  | Failed admission, build, credential exchange, deployment or verification stops the chain. Never continue to promotion or silently substitute a workstation route; record the failure and recover through an admitted Actions operation.        |
| R6  | Release scoped production credentials only to the exact mutating job after protection gates pass. Do not put secret values in logs, artifacts or copied workstation files.                                                                     |
| R7  | Actions rollback uses an exact previously recorded artifact/revision and configuration/schema-compatible recovery plan. Run the same post-change identity and behavior checks as forward deployment and retain the result.                     |
| R8  | Retain a non-secret receipt identifying source revision, artifact digests, target, run/approval, restore-point and rollback-target evidence, coordinated result and verification. A green build or image tag is insufficient release evidence. |

## Enforcement

| Mechanism                                          | Durable anchor                  | Current boundary                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API tests and image publication                    | `deploy-api` / `build-and-push` | `go test ./...`, API/worker builds and GHCR pushes exist; not a production deployment.                                                                                                                |
| Protected mutating jobs and exact target           | R1/R2/R6                        | **Not enforced:** no deployment job, job `environment`, concurrency group, branch/tag admission or digest-bound deployment exists in `deploy-api`. GitHub protection settings have not been verified. |
| Restore point, coordinated deploy and verification | R3/R4/R5                        | **Not enforced:** no restore-point admission, migration, production activation, frontend promotion, all-surface verification or coordinated release result exists.                                    |
| Rollback and retained receipt                      | R7/R8                           | **Not enforced:** no rollback operation or structured non-secret release-evidence artifact exists.                                                                                                    |
| Single release authority                           | D33 and runbook policy          | **Not enforced mechanically:** documentation does not revoke external host/provider access.                                                                                                           |

## Provider

The current `deploy-api` dispatch chooses `staging` or `production` for API/worker image tags and uses `github.sha`. `build-and-push` also publishes mutable environment tags and prints a manual droplet promotion instruction; that instruction is not an authorized release path. There is no deploy, promote or rollback dispatch to recommend yet. The source workflow uses major-version action tags; immutable dependency pinning and production credential exchange remain enforcement work.

Production Compose currently declares API and worker services only. Their declarations do not prove deployed identity or coordination with frontend, bot, agent, proxy or database. Operational preparation and open controls: [deploy-runbook](/deploy/docs/deploy-runbook.md).

## Consumers

Operators prepare an exact candidate and reviewable evidence, then dispatch/approve only an implemented admitted workflow. They stop while controls are missing. Scripts may implement workflow steps without becoming an operator release surface. Local development, authorized pull backup and isolated test restore are separate from production release. A live database restore used for release recovery must obey R3/R7 and needs a separately reviewed destructive recovery plan.

## Related decisions

- [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) — one production release authority.
- [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) — off-provider, off-droplet nightly and pre-deployment pull backups.

## Reopen

Reopen only through a superseding decision that preserves one release authority, or if the control-plane/provider constraints named in D33 occur. A workflow defect, emergency or billing gap is an implementation gap, not an exception.
