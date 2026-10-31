# Deploy and operations guides

These pages describe the approved deployment plan and distinguish it from the workflows and provider settings that exist today. Production deployment, promotion, and rollback belong to GitHub Actions under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md) and the [release interface](/docs/interfaces/actions-releases.md).

| Guide                                                          | Purpose                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Deployment runbook](/deploy/docs/deploy-runbook.md)           | Branch flow, staging and production releases, setup, gaps            |
| [Local stack](/deploy/docs/dev-stack.md)                       | Start the local Docker Compose stack and read its receipts           |
| [Fresh database bootstrap](/deploy/docs/fresh-db-bootstrap.md) | Start the local database and apply migrations and seed data          |
| [Production VM](/deploy/docs/production-vm.md)                 | Production backend target, host requirements, and setup gaps         |
| [VM disk maintenance](/deploy/docs/vm-disk-hygiene.md)         | Read-only disk diagnostics and maintenance boundaries                |
| [Database backups](/deploy/docs/supabase-backups.md)           | D10 backup policy and the pre-deployment dump of Supabase PostgreSQL |
| [Vercel frontend](/deploy/docs/vercel-frontend.md)             | Production and staging frontend routing                              |
| [Vercel promotion](/deploy/docs/vercel-promotion.md)           | Actions-owned production frontend deployment and its gaps            |
| [Secrets overview](/deploy/docs/secrets-overview.md)           | Secret boundaries and owner access configuration                     |
| [Discord repair](/deploy/docs/discord-repair.md)               | Discord projection repair                                            |
| [Local agent archive](/deploy/docs/agent-archive-local.md)     | Optional local agent and archive stack                               |

No live DNS, provider settings, runner, tunnel, host, or release was verified while updating these guides.
