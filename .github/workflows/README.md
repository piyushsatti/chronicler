# Workflows

| Workflow         | Purpose                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `api.yml`        | Go vet, test, build, schema merge drift on `apps/api` and contracts                                |
| `repo.yml`       | Docs lint, Prettier, Ruff, and Pyright for root tooling. Does not build `apps/web` or `apps/agent` |
| `agent.yml`      | uv sync, ruff, pyright, pytest for `apps/agent` |
| `web.yml`        | Web typecheck, lint, unit tests, and Playwright. Waits on the web tree                             |
| `deploy-api.yml` | Manual staging/production image build (D33: Actions-only releases)                                 |

Registry push and droplet compose update require repository secrets; until those are set, `deploy-api` builds and tags images only.
