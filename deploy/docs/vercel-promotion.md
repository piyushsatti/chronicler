# Vercel promotion admission

**Verdict:** assigning the production frontend domain, including rollback to an older deployment, is a production release operation. Only an admitted GitHub Actions run may perform it ([actions-releases](/docs/interfaces/actions-releases.md)); current workflows do not implement this promotion.

## Required gate

1. Select the exact frontend deployment/artifact corresponding to the admitted clean source revision. Record its immutable identity, source and build configuration; never resolve the newest `Ready` deployment as an implicit target.
2. Verify that provider branch builds do not automatically assign the production domain outside Actions. Historically this required disabling “Auto-assign Custom Production Domains”; the present provider setting has not been verified.
3. Complete release admission, restore-point evidence where required, coordinated backend compatibility and pre-promotion smoke checks in the same Actions run.
4. Obtain scoped provider access only after the protected mutating job is admitted. Failure to obtain credentials or verify the promotion gate stops the chain; it is not a successful `SKIPPED` check.
5. Promote the selected target, verify deployed identity and user journeys on the production surface, and retain the non-secret receipt with the prior rollback target.
6. On failure, stop and use the reviewed Actions recovery operation. Frontend rollback selects the exact prior deployment and repeats verification.

A provider's “already current” response is acceptable only after verifying the selected exact target actually serves the production domain. It cannot substitute for identity/behavior verification.

## Current implementation boundary

The legacy `scripts/deploy/promote_frontend.sh`, `check_autopromote.sh`, `all.sh` and `deploy.yml` are absent. The old workstation promotion path and missing-credential skip behavior are superseded by D33. `deploy-api` publishes API/worker images only; it has no frontend build, promotion or rollback job.

[Web Vercel configuration](/apps/web/vercel.json) declares routing but does not establish the project auto-assignment setting, source linkage, immutable build identity or an admitted promotion. No provider settings were queried or changed during documentation consolidation.

[Frontend guidance](/deploy/docs/vercel-frontend.md) owns routing/configuration. [Deploy runbook](/deploy/docs/deploy-runbook.md) owns the coordinated release sequence and current enforcement gaps.
