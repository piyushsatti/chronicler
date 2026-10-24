# Production Vercel promotion

Production frontend deployment and rollback are production releases. GitHub Actions must select the exact deployment built from the admitted CalVer tag and assign it to `chronicler.smokebombstudios.com` as part of the coordinated backend release.

The tag must match `YYYY.MM.DD` or `YYYY.MM.DD.N` and point to a commit on `main`. The future workflow must verify the deployed revision and API behavior, then retain the prior frontend deployment for rollback. Rollback selects that exact deployment and repeats the release checks.

No workflow currently builds or promotes the frontend. Provider project settings and automatic production-domain assignment have not been checked. Do not infer a successful promotion from a Vercel build or a `Ready` status. Stop when release admission, identity checks, or provider access fail.

Staging promotion to `chronicler.piyushsatti.com` is a separate manual workflow dispatch on the owner's self-hosted runner. It must use staging API routing to `chronicler-api.piyushsatti.com`. That workflow and its staging configuration are deferred to the next workflow round. See [frontend routing](/deploy/docs/vercel-frontend.md), the [release interface](/docs/interfaces/actions-releases.md), and the [deployment runbook](/deploy/docs/deploy-runbook.md).
