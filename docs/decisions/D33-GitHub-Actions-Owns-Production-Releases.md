# D33: GitHub Actions Owns Production Releases

**Status:** decided 2026-09-19
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [actions-releases](/docs/interfaces/actions-releases.md)

## Context

· **Supersedes:** the local production fallback in Deployment-and-cicd R3

## Decision

- **Every production deployment, promotion, and rollback runs through GitHub Actions.**

- **Rollback is a release operation and follows the same rule.**The workflow selects an exact

- **If GitHub Actions cannot execute the admitted workflow, production change is blocked.**

- **Development remains local on Mercury.**This ruling governs the boundary crossing from an

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Keep `scripts/deploy/all.sh` as an equivalent laptop fallback | It creates two release authorities, repeatedly requires rediscovery of live state and credentials, and makes deploy/rollback depend on high-token interactive operation. |
| Manual SCP or image transfer when Actions is inconvenient | It bypasses the workflow's admission, audit, concurrency, credential, and verification boundaries and recreates the exact operational cost this ruling removes. |
| Actions for forward deploys, manual rollback for emergencies | Rollback is the highest-risk release path; giving it weaker provenance and verification inverts the safety model. |
| Store long-lived production credentials directly in workflow YAML or repository files | Source access would become production credential access and rotation would remain manual. The credential architecture must provide scoped runtime access instead. |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- GitHub Actions can no longer provide an auditable, protected production control plane at an
- A regulatory or provider constraint prohibits Actions from reaching one required production
- Production moves to a platform whose native reconciler becomes the sole deployment authority;
