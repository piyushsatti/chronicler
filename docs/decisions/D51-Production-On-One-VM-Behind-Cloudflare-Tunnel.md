# D51: Production runs on one VM behind Cloudflare Tunnel with Supabase PostgreSQL

**Status:** decided 2026-10-31  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [actions-releases](/docs/interfaces/actions-releases.md)

## Context

The documented production target was one DigitalOcean droplet running the whole stack behind Caddy, with its own PostgreSQL and open ports 80 and 443. The owner chose a smaller footprint: one VM (2 vCPU, 2 GB) with no inbound ports and a hosted database. Staging already runs on the owner's machine behind a host-level tunnel, and two release stacks would drift.

## Decision

Patterns: **Gateway Offloading** (TLS and request filtering move to Cloudflare's edge), **Backing service as an attached resource** (the database is one URL), and D33's deployment pipeline with one control plane.

- **Production runs on one VM,** deployed only by GitHub Actions on a self-hosted runner ([D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)). This supersedes the DigitalOcean droplet target.
- **Request path:** browser, `chronicler.smokebombstudios.com` (Vercel), Vercel rewrite, `chronicler-prod-api.piyushsatti.com`, Cloudflare Tunnel, a `cloudflared` container in the same Compose stack, `chronicler-api:8080`. The VM has no inbound ports; Cloudflare provides HTTPS.
- **Production database is Supabase PostgreSQL,** reached through one `DATABASE_URL` secret (session pooler, TLS). Staging and development keep the Compose PostgreSQL.
- **One Compose file, one release workflow.** `deploy/compose.production.yaml` serves staging and production: PostgreSQL is the `local-db` profile (staging) and `cloudflared` is the `tunnel` profile (production). `deploy-release.yml` holds the release steps; `deploy-staging.yml` and `deploy-production.yml` supply their own trigger, tag rule, runner, environment and constants. This moves toward one surface.
- **Caddy is retired.** The public block on `/v1/ingest/*` becomes a Cloudflare WAF custom rule on the API hostname, configured outside the repository. Only the Discord bot calls ingest, over the container network, with the ingest secret.
- **Restore point:** before `migrate`, the workflow runs `pg_dump -Fc` of the hosted database in a pinned PostgreSQL 17 client container and writes it on the VM ([D10](/docs/decisions/D10-Backup-Location-And-Cadence.md)). The off-machine copy D10 requires is **still an open owner decision.**

**Divergence, justified:** staging keeps its host-level `cloudflared` and leaves the `tunnel` profile off. The owner set up that tunnel, and moving it into Compose needs a new owner-held token. Both reach `chronicler-api:8080`; only the connector's owner differs.

## Alternatives rejected

| Alternative                                  | Why not                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DigitalOcean droplet with Caddy and local DB | Owner chose the VM, the tunnel and the hosted database. Opens ports 80 and 443 and adds database operations. |
| Host-level tunnel for production             | Connector state outside the release; the container is pinned in the repository and ships with the stack.     |
| Keep Caddy behind the tunnel                 | A second proxy with nothing left to terminate; its only rule moves to the edge.                              |

## Consequences

The ingest block is no longer enforced in the repository: the Caddyfile and its text test are gone, and the WAF rule is a Cloudflare setting. The API still requires the ingest machine credential. A blocked request gets Cloudflare's block response (403 by default), not Caddy's 404. Production availability now depends on Cloudflare, Supabase and the VM; image builds on a 2 GB VM are unmeasured. Environment, secret, runner and project names are planned and await owner confirmation in the [runbook](/deploy/docs/deploy-runbook.md). Nothing has run: the tunnel, WAF rule, Supabase project, runner and Vercel project are unverified.

## Enforced by

Workflows `deploy-production` and `deploy-release` (jobs `admit`, `backend`, `frontend`), Compose profiles `local-db` and `tunnel`, `scripts/backup-db -u`, and the production runner's pre-job hook `deploy/runner/production-job-started.sh` (installed on the VM, outside the repository's control). The WAF rule and the Cloudflare tunnel route are **not enforced** by the repository.

## Reopen triggers

- The 2 GB VM cannot build the images or run the stack within measured limits.
- The WAF rule cannot be verified, or a public ingest request reaches the API.
- The owner decides the off-machine backup copy, which amends D10.
- Supabase limits or availability stop meeting production needs.
