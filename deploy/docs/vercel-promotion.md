# Production Vercel promotion

Production frontend deployment and rollback are production releases. GitHub Actions must select the exact deployment built from the admitted CalVer tag and assign it to `chronicler.smokebombstudios.com` as part of the coordinated backend release.

The tag must match `YYYY.MM.DD` or `YYYY.MM.DD.N` and point to a commit on `main`. The `frontend` job of the [production workflow](/.github/workflows/deploy-production.yml) runs after the backend deploys and passes its health check. It builds with `vercel build --prod`, checks the build output's API origin, and runs `vercel deploy --prebuilt --prod`. That command deploys to the production environment, and Vercel assigns the production domain to it.

Not implemented: the workflow does not verify the deployed revision or API behavior through the Vercel domain, does not record the prior frontend deployment, and has no frontend rollback. Rollback would select that exact earlier deployment and repeat the release checks. If `frontend` fails after a healthy `backend`, the API runs the new release behind the previous frontend.

Provider project settings and automatic production-domain assignment have not been checked. Do not infer a successful promotion from a Vercel build or a `Ready` status. Stop when release admission, identity checks, or provider access fail.

Staging promotes to `chronicler.piyushsatti.com` from its own tag through the same shared job, using staging API routing to `chronicler-api.piyushsatti.com`. See [frontend routing](/deploy/docs/vercel-frontend.md), the [release interface](/docs/interfaces/actions-releases.md), and the [deployment runbook](/deploy/docs/deploy-runbook.md).
