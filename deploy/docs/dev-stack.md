# Local test stack and logs

## Verdict

The fixed-command **facade** in `scripts/dev-stack` starts PostgreSQL, migrations,
API and the delivery worker for local testing. It converges on the canonical
Compose definition plus one synthetic test override. It is a local development
path; production releases remain owned by GitHub Actions.

Run this exact command on Triton, without arguments:

```bash
scripts/dev-stack
```

The facade pins the local Unix socket, `chronicler-dev` project and
[Compose override](/deploy/compose.dev-tests.yaml). It discards caller Docker,
Compose, proxy and credential settings, and supplies an empty environment file.
API and PostgreSQL publish only on loopback ports 8080 and 5432. Synthetic secrets,
`REQUIRE_DATABASE=1` prevents API in-memory fallback; disabled inline agent
completion and the worker's Discord dry-run keep the test settings synthetic.
The worker can still fall back to an in-memory job store on a connection failure;
the facade rejects that log message and requires its PostgreSQL startup message
before reporting success. The Gateway bot is not started.

The project owns its separate persistent `chronicler-dev_chronicler_pg` volume.
Startup preserves data. It does not reset volumes, reconcile changed seeds or load
the QA fixture; migrations load the canonical small local seed.

## Read receipts without Docker access

The facade maintains user-owned, mode-0700 `/tmp/chronicler-dev`. Startup output
and timestamped service logs append across runs. Read them with ordinary commands:

```bash
cat /tmp/chronicler-dev/latest-status
tail -n 80 /tmp/chronicler-dev/startup.log
tail -n 80 /tmp/chronicler-dev/services.log
```

`latest-status` records UTC time, exit code and last startup step.
`worker-startup.log` holds the worker snapshot used to reject in-memory fallback;
startup also requires PostgreSQL, API and worker to be running. `health.json`
is the last successful liveness response, not database readiness or endpoint
behavior evidence. A previous successful response may remain after a failed run;
use `latest-status` to assess the latest attempt.

Startup uses a bounded serialization lock and bounded configuration, daemon,
Compose build/start and liveness waits. One detached log follower owns a lifetime
lock, retries after container replacement or daemon interruption, and writes its
PID to `follower.pid`. Subsequent startups reuse that follower. It intentionally
continues collecting logs after startup finishes; stopping that exact PID ends
collection until the next facade run. `/tmp` receipts are operational scratch,
not durable review records.

## Permissions and failures

The project command rule should allow only the absolute facade. Prefix rules also
match trailing tokens; the executable therefore rejects all arguments before
Docker access. Raw Docker, relative invocations, sudo, sg and shell wrappers have
no allowance in that rule. The project profile must not grant general socket
access. The facade itself is editable repository code, so this convention is not
a security boundary against someone who can modify the checkout.

On Triton the account already belongs to the Docker group. A session with stale
groups may need a narrowly authorized refresh that reruns this exact facade;
never broaden it into arbitrary Docker or root access. Saved project permissions
load in a new trusted session and do not alter an already running sandbox.

A daemon denial or timeout is a failed receipt, not a successful database run.
Resolve the reported environment issue and rerun the same facade. Review
[deployment release ownership](/docs/interfaces/actions-releases.md) before any
production work.
