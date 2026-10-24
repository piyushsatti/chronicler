# Knowledge map

Use this page to find the current architecture authority. Repository intent, implementation, and evidence have different owners. A dated observation does not prove current behavior.

## Product intent

- [Systems map](/docs/systems.md) routes to product system pages.
- [Interfaces](/docs/interfaces/README.md) records rules shared across components.
- [Requirements](/docs/requirements/README.md) tracks requirement status and evidence boundaries.
- [Decisions](/docs/decisions/README.md) records accepted owner decisions.
- [Semantics](/docs/semantics/README.md) defines product terms.

## Implementation

- `apps/api` owns the Go API, worker, and database integration.
- `apps/web` owns the React and Vite frontend.
- `apps/discord` owns the Discord gateway integration.
- `apps/agent` owns the agent service and archive tools.
- `packages/contracts` owns the shared GraphQL and OpenAPI contracts.

App implementation notes live in each app's `docs/` directory. Deployment targets and missing controls live in the [operations system](/docs/systems/operations.md) and [deployment guides](/deploy/docs/README.md).

## Deployment plan and evidence boundary

The target staging site is `chronicler.piyushsatti.com`; its API is `chronicler-api.piyushsatti.com` through Cloudflare Tunnel. Production targets `chronicler.smokebombstudios.com` and `api.chronicler.smokebombstudios.com`, with backend services and PostgreSQL on one DigitalOcean droplet.

The single production release authority is GitHub Actions. The staging and production deployment workflows are not implemented. Production Compose does not define PostgreSQL, ingress, or migrations. No provider, DNS, tunnel, runner, or live deployment was verified while updating these docs.

## Historical evidence

Older architecture notes and release receipts describe earlier revisions and topology. Consult them only with their date and source revision. Do not use them as proof of current provider settings, service inventory, or release behavior.
