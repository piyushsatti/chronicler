# Workflows

| Workflow         | Purpose                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `api.yml`        | Go vet, generated schema/code drift, unit/contract/integration verification and API/worker build       |
| `repo.yml`       | Root tooling and documentation verification through `scripts/verify-repo`                              |
| `agent.yml`      | Frozen root/agent tool sync, Ruff, Pyright and pytest                                                  |
| `web.yml`        | Web typecheck, lint/design gates, unit tests and mock Playwright coverage                              |
| `deploy-api.yml` | Dispatch selects staging/production image tags; `build-and-push` tests and publishes API/worker images |

`deploy-api` uses `GITHUB_TOKEN` for GHCR publication. It does not deploy to a droplet, run migrations, promote frontend, roll back or retain a complete release receipt. Its printed manual Compose promotion instruction conflicts with the accepted release authority and must not be followed.

Production deployments, promotions and rollbacks are Actions-only under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). [Actions release contract](/docs/interfaces/actions-releases.md) records required admission/verification/evidence and current enforcement gaps. A workflow file or image push is not release conformance. [Deploy runbook](/deploy/docs/deploy-runbook.md) contains preparation guidance; no implemented production release operation is available to dispatch yet.
