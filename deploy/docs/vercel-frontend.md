# Vercel frontend routing

The frontend is a static Vite and React application hosted on Vercel. The production site is `chronicler.smokebombstudios.com`; its API origin is `api.chronicler.smokebombstudios.com`. Staging uses `chronicler.piyushsatti.com` and `chronicler-api.piyushsatti.com`.

[`apps/web/vercel.json`](/apps/web/vercel.json) contains the production API rewrites and SPA fallback. Staging needs a separate build or deployment configuration that routes the same request paths to `https://chronicler-api.piyushsatti.com`. That configuration is deferred to the workflow round. Do not use `vercel.json` unchanged for staging.

Production frontend deployment and domain promotion must be part of the same Actions release as the backend. The staging workflow must deploy the same source revision to Vercel and the self-hosted backend. Neither workflow is implemented yet. Provider project settings, DNS, certificates, and deployed revisions have not been verified.

Keep frontend build variables public. Do not put API secrets in Vercel's client build. See [Vercel promotion](/deploy/docs/vercel-promotion.md) and the [deployment runbook](/deploy/docs/deploy-runbook.md).
