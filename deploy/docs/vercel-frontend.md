# Vercel frontend configuration

**Verdict:** repository configuration and historical hosting are distinct from verified live deployment. Production frontend assignment and rollback follow [promotion admission](/deploy/docs/vercel-promotion.md) and [actions-releases](/docs/interfaces/actions-releases.md).

## Repository configuration

The current configuration is [apps/web/vercel.json](/apps/web/vercel.json), not a root-level `vercel.json`. It declares these rewrites in order:

| Source         | Destination                                               |
| -------------- | --------------------------------------------------------- |
| `/v1/:path*`   | `https://api.chronicler.smokebombstudios.com/v1/:path*`   |
| `/auth/:path*` | `https://api.chronicler.smokebombstudios.com/auth/:path*` |
| `/health`      | `https://api.chronicler.smokebombstudios.com/health`      |
| `/(.*)`        | `/index.html`                                             |

The SPA fallback is last. This configuration has no legacy `/graphql` rewrite. Deployment admission must verify that the provider uses this config and the rebuilt app's actual build/output paths, API contract and OAuth routes; historical root-directory/build/client-path instructions do not establish them.

## Hosting and identity checks

The recorded product URL is `https://chronicler.smokebombstudios.com`; the configured backend rewrite origin is `https://api.chronicler.smokebombstudios.com`. Their current DNS, certificates, provider project and deployed source identities require evidence. Do not create or rebind project, domain, DNS or OAuth identifiers as part of documentation consolidation.

Before an admitted promotion, verify:

- Provider project/root/build configuration and the exact staged artifact's source revision and public configuration.
- Production domain assignment remains under Actions control; an automatic assignment from a branch push is not an admitted release.
- HTTPS, same-origin API forwarding, API identity and OAuth start/callback compatibility under the actual current wire contracts.
- Authentication, authority-sensitive reads, critical navigation and error recovery against the selected backend.
- Absence of secret values in SPA configuration, logs and release receipts.

Record actual results rather than inferring success from a successful build, a 200 response or the configuration file's existence. No live/provider verification was performed for this consolidation.

## Remaining implementation

There is no frontend promotion/rollback workflow in this checkout. Integrate the exact frontend target with the coordinated Actions release and its restore-point, backend compatibility, verification and receipt requirements. [Deploy runbook](/deploy/docs/deploy-runbook.md) owns the operation; [droplet guidance](/deploy/docs/digitalocean-droplet.md) owns the backend preparation boundary.
