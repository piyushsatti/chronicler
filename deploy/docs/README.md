# Deploy runbooks

How Chronicler **ships, backs up, and recovers**. Lives next to Compose files in `deploy/`.

- Product ops system (intent): [docs/systems/operations.md](/docs/systems/operations.md) (after systems lift)
- Release policy: [actions-releases](/docs/interfaces/actions-releases.md) · [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)

## Runbooks

| Doc | Use |
| --- | --- |
| [deploy-runbook.md](/deploy/docs/deploy-runbook.md) | Topology, bootstrap, routine deploy, rollback |
| [fresh-db-bootstrap.md](/deploy/docs/fresh-db-bootstrap.md) | Local/QA seed and role tokens |
| [digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md) | Droplet host notes |
| [droplet-disk-hygiene.md](/deploy/docs/droplet-disk-hygiene.md) | Disk prune |
| [supabase-backups.md](/deploy/docs/supabase-backups.md) | Database backups |
| [vercel-frontend.md](/deploy/docs/vercel-frontend.md) | Frontend hosting |
| [vercel-promotion.md](/deploy/docs/vercel-promotion.md) | Frontend promotion |
| [discord-repair.md](/deploy/docs/discord-repair.md) | Discord projection repair |
| [secrets-overview.md](/deploy/docs/secrets-overview.md) | Where secrets live (no secret values) |
| [agent-archive-local.md](/deploy/docs/agent-archive-local.md) | Agent + Archive local stack (HTTP; no Rabbit) |

**Rule:** production deploy/promote/rollback is GitHub Actions only.
