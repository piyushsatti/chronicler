# Vercel Promotion Gating

See [deploy-runbook.md](/deploy/docs/deploy-runbook.md) for the full deploy topology and
the end-to-end operating sequence. See [vercel-frontend.md](/deploy/docs/vercel-frontend.md)
for the domain, proxy, and routing map.

## Structure

The gate depends on auto-promote ("Auto-assign Custom Production Domains")
being disabled on the Vercel dashboard for this project. That is a
precondition this repo requires, not a fact it can assert on its own: the
toggle lives in Vercel's UI. `scripts/deploy/check_autopromote.sh` verifies
it on the promote path when a `VERCEL_TOKEN` is available (see "Verifying
the toggle" below). On 2026-08-01, `promote_frontend.sh` got a `409 already the current
production deployment` on a build nobody had promoted yet, the exact
symptom of the toggle being on, silently.

When the precondition holds, a merge to `main` still builds a **production
deployment** (correct env vars, correct build config, same as a normal prod
build) but that build is not domain-assigned: it does not take over
`chronicler.smokebombstudios.com` on its own. It is a staged production
build sitting at its own deployment URL, not a preview deployment (previews
are what PRs get, with different environment variables). Production traffic
stays on whatever was last explicitly promoted until this deployment is.

## Why

Root Directory is repo root, and the root `vercel.json` is the live prod
config. That build runs on every push to `main`. Without gating, every merge
goes straight to prod with no check between "code merged" and "users see it."

## How

1. Merge to `main`. Vercel builds a staged production deployment automatically
   (not domain-assigned yet).
2. `all.sh` (workstation) and the `deploy.yml` CI job both run smoke first,
   then call `promote_frontend.sh` only if smoke passed. See "Automation"
   below for exactly where.
3. `promote_frontend.sh` promotes it onto the production domain:

```
scripts/deploy/promote_frontend.sh [deployment-url-or-id]
```

Production domain is `chronicler.smokebombstudios.com`, updated only by this
step.

**One implementation.** `scripts/deploy/promote_frontend.sh` is it: argument
optional (resolves the newest `Ready` production deployment when omitted),
and a `409 already the current production deployment` is treated as success
(exit `0`), promoting what is already live is a no-op, not an error, and a
pipeline must not fail on it. `scripts/vercel-promote.sh` is a thin delegator
onto the same script, kept only so any caller still invoking that path keeps
working; it carries no logic of its own.

## Automation

Promotion is automated, gated on a passing smoke, not a manual step:

- Workstation: `scripts/deploy/all.sh` runs `smoke.sh` then
  `promote_frontend.sh`, both `fail`-guarded, in that order.
- CI: `.github/workflows/deploy.yml`'s `promote` job has `needs: smoke`.

The dashboard auto-assign toggle itself remains an owner-only click; nothing
in this repo can flip it (see "Verifying the toggle").

## Verifying the toggle

`scripts/deploy/check_autopromote.sh` reads the project's
`autoAssignCustomDomains` setting from the Vercel REST API
(`GET /v9/projects/:id`) and fails loud if it is on, naming the dashboard
path to fix it. It runs as a preflight inside `promote_frontend.sh` (env
`PROMOTE_CHECK_AUTOPROMOTE`, default `true`). It skips, loudly, rather than
failing, whenever `VERCEL_TOKEN` is unset or `jq` is missing: a missing
credential must never break an otherwise-healthy deploy, only a confirmed
"on" reading may block one.
