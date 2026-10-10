# Workflows

| Workflow | Purpose |
| --- | --- |
| `api.yml` | Go vet, test, build, schema merge drift on `apps/api` and contracts |
| `deploy-api.yml` | Manual staging/production image build (D33: Actions-only releases) |

Registry push and droplet compose update require repository secrets; until those are set, `deploy-api` builds and tags images only.
