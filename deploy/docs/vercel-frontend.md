# Vercel frontend routing

The frontend is a static Vite and React application hosted on Vercel. The production site is `chronicler.smokebombstudios.com`; its API origin is `chronicler-prod-api.piyushsatti.com`, a Cloudflare Tunnel hostname ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)). Staging uses `chronicler.piyushsatti.com` and `chronicler-api.piyushsatti.com`.

[`apps/web/vercel.json`](/apps/web/vercel.json) contains the production API rewrites, the SPA fallback, and the install and build commands for the monorepo. [`apps/web/vercel.staging.json`](/apps/web/vercel.staging.json) has the same commands, with the rewrites pointed at `https://chronicler-api.piyushsatti.com`. Each release workflow selects its file with `--local-config`. Do not use `vercel.json` unchanged for staging.

The [staging](/.github/workflows/deploy-staging.yml) and [production](/.github/workflows/deploy-production.yml) workflows share one frontend job in [`deploy-release.yml`](/.github/workflows/deploy-release.yml). Each builds from the tagged revision, then fails if its build output lacks its own API origin or contains the other environment's origin, so a staging build cannot ship production routing or the reverse. Provider project settings, DNS, certificates, and deployed revisions have not been verified.

Keep frontend build variables public. Do not put API secrets in Vercel's client build. See [Vercel promotion](/deploy/docs/vercel-promotion.md) and the [deployment runbook](/deploy/docs/deploy-runbook.md).
