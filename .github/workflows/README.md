# GitHub workflows

| Workflow         | Purpose                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| `api.yml`        | Go checks, schema and code drift checks, tests, and API/worker build            |
| `repo.yml`       | Repository tooling and documentation verification through `scripts/verify-repo` |
| `agent.yml`      | Agent lint, type checks, and tests                                              |
| `web.yml`        | Web type checks, lint, unit tests, and mock browser coverage                    |
| `deploy-api.yml` | Current API and Discord bot image publication to GHCR                           |

CI runs on every pull request. `main` is the trunk: changes reach it only through a pull request with a squash merge, and the `go`, `web`, `agent`, and `tooling` jobs are required checks. Keep these job names unique across workflows so each required check maps to one job. Direct pushes to `main` are blocked with no bypass.

The planned staging workflow starts from a `staging-YYYY.MM.DD.N` tag on the owner's self-hosted machine. It will run the backend with Compose and publish the frontend to Vercel. The planned production workflow starts from a CalVer tag pointing to `main` and deploys the backend and frontend through one Actions release. These workflows are not implemented.

`deploy-api.yml` publishes images only. It does not deploy, migrate, promote Vercel, verify a release, or roll back. Its manual Compose instruction is not an authorized release path. Production deployment, promotion, and rollback follow [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [Actions release interface](/docs/interfaces/actions-releases.md).
