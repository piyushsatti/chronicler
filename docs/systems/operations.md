# One droplet ships everything, one laptop is the backup, and nothing watches production yet

**Map:** [systems.md](/docs/systems.md)

## What it is

Ships. One droplet, 458 MB of RAM (unsourced on this page; verify live with `ssh deploy@<droplet-host> free -m` and record the output where this figure is next touched), runs `api`, `bot`, `scheduler` and `caddy`. Postgres is external, on Supabase; the frontend is static, on Vercel. GitHub Actions has no minutes until roughly 2026-08-01, so deploys are local and manual in the interim, a current co

## Interfaces

| Interface | Role |
| --- | --- |
| [actions-releases](/docs/interfaces/actions-releases.md) | Production release path |

## Implemented by

| App | Local docs |
| --- | --- |
| `deploy/docs` | [deploy/docs/](/deploy/docs/) |

## Requirements

R-ids for this system: [../requirements/by-system/operations.md](/docs/requirements/by-system/operations.md) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).

Long-form historical system essay: `.local/docs-quarry/systems-longform/operations.md` (gitignored).
