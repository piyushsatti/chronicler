# GitHub workflows

| Workflow                | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `api.yml`               | Go checks, schema and code drift checks, tests, and API/worker build                                             |
| `repo.yml`              | Repository tooling and documentation verification through `scripts/verify-repo`                                  |
| `agent.yml`             | Agent lint, type checks, and tests                                                                               |
| `web.yml`               | Web type checks, lint, unit tests, and mock browser coverage                                                     |
| `deploy-api.yml`        | Current API and Discord bot image publication to GHCR                                                            |
| `deploy-staging.yml`    | Staging release on a `staging-YYYY.MM.DD.N` tag: calls `deploy-release.yml` with the staging constants           |
| `deploy-production.yml` | Production release on a `YYYY.MM.DD[.N]` tag on `main`: calls `deploy-release.yml` with the production constants |
| `deploy-release.yml`    | Reusable release pipeline: tag admission, self-hosted Compose backend, then Vercel frontend                      |

CI runs on every pull request. `main` is the trunk: changes reach it only through a pull request with a squash merge, and the `go`, `web`, `agent`, and `tooling` jobs are required checks. Keep these job names unique across workflows so each required check maps to one job. Direct pushes to `main` are blocked with no bypass.

`deploy-staging.yml` starts from a `staging-YYYY.MM.DD.N` tag. It runs the backend on the owner's self-hosted runner (label `chronicler-staging`) with Docker Compose and publishes the frontend to the Vercel staging project. `deploy-production.yml` starts from a CalVer tag that points to a commit on `main`, runs the backend on the production VM's runner (label `chronicler-production`) against Supabase PostgreSQL behind a Cloudflare Tunnel, and publishes the frontend to the Vercel production project, all in one release. Both are thin callers of `deploy-release.yml` and set their own concurrency group, environment, runner, and constants; see the [deployment runbook](/deploy/docs/deploy-runbook.md) and [D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md). Neither has been verified end to end.

`deploy-api.yml` publishes images only. It does not deploy, migrate, promote Vercel, verify a release, or roll back, and the release workflows do not use its images. Production deployment, promotion, and rollback follow [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [Actions release interface](/docs/interfaces/actions-releases.md).
