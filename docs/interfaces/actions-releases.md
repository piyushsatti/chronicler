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

| Mechanism                                          | Durable anchor         | Current boundary                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API tests and builds                               | `api.yml` / `go`       | `go test ./...` and API/worker builds run in CI; not a production deployment.                                                                                                                                                                                                                                                                                            |
| Protected mutating jobs and exact target           | R1/R2/R6               | **Partial, never verified:** `deploy-production` serializes in the `production` concurrency group, its mutating jobs name the `production` environment, and job `admit` accepts only CalVer tags reachable from `main`. Images are built on the VM and tagged with the release tag; no digest is recorded. GitHub environment and tag protection have not been verified. |
| Restore point, coordinated deploy and verification | R3/R4/R5               | **Partial:** job `backend` dumps the hosted database before `migrate`, activates the stack, and checks `/health`; job `frontend` deploys after it and checks the build's API origin. No off-machine restore-point admission, frontend verification or coordinated result exists.                                                                                         |
| Rollback and retained receipt                      | R7/R8                  | **Partial:** `backend` redeploys the previous API and bot images on failure. No frontend rollback or structured non-secret release-evidence artifact exists.                                                                                                                                                                                                             |
| Single release authority                           | D33 and runbook policy | **Not enforced mechanically:** documentation does not revoke external host/provider access.                                                                                                                                                                                                                                                                              |

## Provider

Releases run from tags: `deploy-staging` and `deploy-production` call the reusable `deploy-release` workflow, which builds the images on the target runner. There is no promote or rollback dispatch to recommend yet. Third-party actions in the release workflows are pinned to commit SHAs. Production credential exchange remains enforcement work.

The release Compose file declares the API with its worker, the bot, and optional PostgreSQL and `cloudflared` services chosen by profile ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)); the agent is not part of it. Declarations do not prove deployed identity. Operational preparation and open controls: [deploy-runbook](/deploy/docs/deploy-runbook.md).

## Consumers

Operators prepare an exact candidate and reviewable evidence, then dispatch/approve only an implemented admitted workflow. They stop while controls are missing. Scripts may implement workflow steps without becoming an operator release surface. Local development, authorized pull backup and isolated test restore are separate from production release. A live database restore used for release recovery must obey R3/R7 and needs a separately reviewed destructive recovery plan.

## Related decisions

- [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) — one production release authority.
- [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) — off-provider, off-VM nightly and pre-deployment pull backups.
- [D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md) — production target: one VM, Cloudflare Tunnel, Supabase PostgreSQL.

## Reopen

Reopen only through a superseding decision that preserves one release authority, or if the control-plane/provider constraints named in D33 occur. A workflow defect, emergency or billing gap is an implementation gap, not an exception.
