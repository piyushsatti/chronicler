#!/usr/bin/env bash
# Pre-job hook for the production runner (ACTIONS_RUNNER_HOOK_JOB_STARTED, D51).
# Runner labels route jobs but do not authorize them, so this refuses every job
# except the production release workflow started by a CalVer tag push.
# GITHUB_WORKFLOW_REF names the calling workflow, also for jobs that run inside
# deploy-release.yml. Limit: it trusts the tag; who may push one is still the
# repository's write access.
set -euo pipefail

prefix='piyushsatti/chronicler/.github/workflows/deploy-production.yml@refs/tags/'
ref="${GITHUB_WORKFLOW_REF:-}"
tag="${ref#"$prefix"}"
if [[ "${GITHUB_EVENT_NAME:-}" == push && "$ref" == "$prefix"* &&
  "$tag" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[0-9]+)?$ ]]; then
  exit 0
fi
echo "production runner: refusing ${ref:-an unknown workflow} (event ${GITHUB_EVENT_NAME:-unknown})" >&2
exit 1
