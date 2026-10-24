# Vercel frontend routing

The frontend is a static Vite and React application hosted on Vercel. The production site is `chronicler.smokebombstudios.com`; its API origin is `api.chronicler.smokebombstudios.com`. Staging uses `chronicler.piyushsatti.com` and `chronicler-api.piyushsatti.com`.

[`apps/web/vercel.json`](/apps/web/vercel.json) contains the production API rewrites and SPA fallback. [`apps/web/vercel.staging.json`](/apps/web/vercel.staging.json) has the same rewrites pointed at `https://chronicler-api.piyushsatti.com`, plus the install and build commands for the monorepo; the staging workflow selects it with `--local-config`. Do not use `vercel.json` unchanged for staging.

The [staging workflow](/.github/workflows/deploy-staging.yml) deploys the same source revision to Vercel and the self-hosted backend. The production workflow is not implemented. Provider project settings, DNS, certificates, and deployed revisions have not been verified.

Keep frontend build variables public. Do not put API secrets in Vercel's client build. See [Vercel promotion](/deploy/docs/vercel-promotion.md) and the [deployment runbook](/deploy/docs/deploy-runbook.md).
