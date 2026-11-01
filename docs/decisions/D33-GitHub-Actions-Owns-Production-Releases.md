# D33: GitHub Actions Owns Production Releases

**Status:** decided 2026-09-19
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [actions-releases](/docs/interfaces/actions-releases.md)

## Context

Workstation deployment and workflow deployment created two release authorities. This ruling supersedes the earlier local production fallback, including fallbacks during Actions billing or availability failures. The governing pattern is a deployment pipeline with one control plane.

## Decision

- **Every production deployment, promotion, and rollback runs through GitHub Actions.** Humans and agents may dispatch or approve an admitted workflow; production mutation belongs to that workflow.
- Actions owns admission, sequencing, concurrency, credentials, verification and the retained release receipt. One exact clean source revision and immutable artifact set must be selected before mutation; protected mutating jobs obey environment and branch/tag policy.
- Prove a current restore point before migrations and record the prior known-good rollback target. Coordinate frontend, API, worker, bot, migrations and verification under one run and one result; preserve required backup policy in [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md).
- Stop on admission, build, credential, deployment or verification failure. **If GitHub Actions cannot execute the admitted workflow, production change is blocked.** An outage, quota limit or emergency grants no workstation fallback.
- Obtain production credentials only at the admitted mutating job, with scoped runtime access. Keep secret values out of logs and artifacts; this ruling does not select the complete credential architecture.
- Rollback selects an exact recorded target through Actions, repeats post-change verification for every production surface and retains non-secret evidence. Detailed admission and receipt requirements live in the interface.
- Repository scripts may be workflow primitives, including SSH/provider operations inside an admitted job. Manual SCP/rsync, image transfer, SSH deployment and workstation deploy scripts are not production release paths. Ordinary local development, pull backups and isolated restore drills remain separate activities.

## Alternatives rejected

| Alternative                                                     | Why not                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Keep a laptop deployment fallback                               | Creates a second release authority and bypasses admission and provenance. |
| Actions forward deploy; manual emergency rollback               | Gives the riskiest release operation weaker verification.                 |
| Copy long-lived production credentials into source or artifacts | Turns source/artifact access into production authority.                   |

## Consequences

Historical workstation release instructions are superseded. A workflow's existence or successful image publication does not establish release conformance. Runbooks must distinguish implemented controls from target obligations; missing controls block release admission.

## Enforced by

**Not fully enforced.** `deploy-staging` and `deploy-production` call `deploy-release` for releases. Protection, restore-point, coordinated verification, credential and receipt gaps are recorded in [actions-releases](/docs/interfaces/actions-releases.md).

## Reopen triggers

- Actions cannot provide an auditable protected control plane at acceptable cost and a named replacement is proposed.
- A provider or regulatory constraint prevents access to a required production surface; the replacement must preserve one release authority.
- A native platform reconciler becomes the sole deployment authority, with Actions submitting desired state.
