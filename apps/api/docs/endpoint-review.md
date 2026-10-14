# API endpoint review baseline

## Verdict

Reviewed on 2026-10-13. The Go API, database fixtures and Discord consumer tests do **not** provide complete endpoint behavior coverage. Registration checks pass, but some operations are placeholders and most planned REST commands are absent. A success status alone cannot prove data accuracy.

This is the canonical API-owned coverage assessment. The [review snapshot](/apps/api/docs/endpoint-review-baseline.json) records the checked Git revision, source fingerprints, full operation inventories, tool versions and dated execution receipts. It is project memory, not a second API contract. Reuse unchanged source findings; rerun execution checks when fresh evidence is requested or the environment changes.

The governing patterns are **CQRS**, **transactional outbox**, **contract testing** and, for the proposed sequential review, **golden fixtures** and **consumer-driven contract testing**. The proposed harness converges on the API boundary: schema-derived operation identities and one scenario source drive API and bot consumer checks. Database inspections corroborate persistence and atomicity; consumers must not implement another copy of API business rules.

## Available surfaces

- [OpenAPI](/packages/contracts/openapi.yaml) declares 34 HTTP operations: 18 GET and 16 POST. `TestOpenAPIMatchesMux` passes. The reverse check covers versioned routes and explicitly allows GraphQL transport, document revisions and document trash outside OpenAPI. Together there are 37 logical HTTP operations including GraphQL transport, or 36 REST operations. The member dispatcher's internal wildcard is not another product endpoint.
- [GraphQL roots](/packages/contracts/graphql/roots.graphql) declare 34 queries and no mutations. `TestGraphQLRootsMatchExecutableSchema` and `TestGraphQLQueryResolverImplementsRoots` check presence, not complete data, nested fields or argument semantics.
- [Field routing](/packages/contracts/field-routing.md) contains 123 distinct REST operation identities. Source comparison finds 91 without mounted implementations: 27 GET, 32 POST, 14 PUT, 13 PATCH and five DELETE. This migration inventory is broader than current OpenAPI. These are implementation gaps, not merely missing tests. No PUT, PATCH or DELETE is currently mounted.
- Every mounted HTTP operation, every GraphQL root and every absent routing operation is enumerated separately in the snapshot. No behavioral-coverage percentage is claimed: there is no operation-by-scenario accounting system.

## Database and seed

The authoritative Go schema is Goose SQL in `apps/api/db/migrations`. Two migrations are available: initialization and quest display status. Historical Python/Alembic references in `schema-v2.md` do not describe this schema. The live applied version was not checked in this review.

`local.sql` seeds seven tables. Integration tests apply migrations and this small seed through `dbtest`, then add scenario rows. `qa.jsonl` has 637 insert specifications across all 45 application tables, including 140 documents, 17 members, 12 characters, 20 quests and 49 participants. Table presence does not prove lifecycle, permission or endpoint coverage.

**QA seed repair, checked on 2026-10-13:** `jobsAndSite` and the regenerated JSONL omit question-owned state. The six delivery job IDs are preserved; a seventh dedicated `agent_question` job owns the succeeded lifecycle, fencing token and completion receipt. Question history/request/result use the current version-one wire shapes, with coherent timestamps and a 100-second deadline. Sorted category traversal makes document revisions and links reproducible. No live database load has passed yet: the current sandbox denies Docker socket access.

`TestGenerateQACoversTheWorld` checks syntax, selected population sizes and uniqueness. New passing unit checks `TestCheckedInQAMatchesGenerator`, `TestQAColumnsMatchInitialDDL` and `TestQAQuestionUsesCurrentAdapters` check exact regeneration, schema columns, population and current submit/claim/complete/poll shapes. `TestQAFreshPostgresDoubleLoad` rejects external `DATABASE_URL`, owns a fresh Postgres container, applies current migrations, compares every table population, explicit typed value and resolved foreign key across two loads, and polls/replays the seeded answered question through the Postgres-backed HTTP adapter. Its database setup failed here; these assertions are source evidence until executed successfully. `ON CONFLICT DO NOTHING` avoids duplicate inserts but neither resets changed rows nor reconciles old fixture versions. The loader's printed count is processed specifications, not necessarily new inserts. Fixed November 2026 quest dates make display expectations time-dependent.

Use an explicitly disposable database. The loader checks connectivity and the maximum applied migration version, not an isolated-database allowlist or full schema fingerprint. `dbtest` can migrate and seed any supplied `DATABASE_URL`; production-chain fixtures reject that override. Keep the integration suite's URL unset and use its own containers. Shared overrides also undermine per-process isolation.

## Coverage findings

**Bounded strong source coverage:** mounted API/PostgreSQL fixtures cover current authority, member-me wire shape, document audience/body projections, revisions/trash, notification unread counts and mark-read atomicity. Quest fixtures cover signup ownership/capacity, display projections and desired revisions with jobs. Job and question fixtures cover contention, fencing, expiry, replay and terminal projection rollback. Database execution failed at setup here; these assertions are source evidence, not new passing receipts.

**Twelve hard-coded GraphQL roots:** `memberActivityStats`, `communityDirectory`, `pendingDmProfileVerifications`, `openQuestSeats`, `myPersonalization`, `codexEntry`, `codexCategories`, `questArcs`, `questArc`, `myNotifications`, `adminCharacterDirectory` and `adminOperations`. They return null or empty results independently of seeded data. The other 22 roots call services but are not all complete or behaviorally verified.

**Two REST no-ops:** personalization reconciliation and suppressed-notification acknowledgement return 204 without executing a command or repository call. Implemented notification unread-count and mark-read routes do not prove the GraphQL inbox or acknowledgement behavior.

**CRUD gaps:** document create/update/publish/delete/restore, character writes, spatial writes, profile/settings/roles changes, quest update and withdrawal are absent. The snapshot retains each absent operation explicitly.

**Field accuracy gaps:** `toDocumentType` sets category from kind, emits empty frontmatter and synthetic updatedAt. Quest mapping fixes kinds to standard, empties tags/genres, synthesizes timestamps and always labels delivery pending. Character mapping uses empty region/backstory IDs and synthetic timestamps; maps have empty hex/edge trees; home content buckets are empty. Character totals equal page length. Several detail roots suppress service errors as null. Members ignore sorting and most filters; search ignores kinds and returns documents only; quest-board region and recently-closed region/date filters are ignored. The quest README records additional generic filter gaps. These are source findings, not independent probes of every selected field.

**Gate gaps:** root `scripts/verify` does not run Go tests. API CI calls `verify-loop.sh`, whose tagged lane includes `test/integration`, `internal/quest` and `internal/document`, but omits `cmd/api`. Thus the mounted production-chain fixtures are outside this CI lane. `go test -tags=integration ./...` includes them. The parity runner only checks a fixture's transition path; it does not replay and compare responses.

## Bot boundary

The bot consumes Discord Gateway events and has no inbound HTTP endpoint server. Its API interactions are event ingest, heartbeat, question submission and polling. The question worker additionally claims, renews, retries and completes questions. The API worker owns outbound quest announcements through Discord REST.

Bot tests cover message/reaction/voice normalization, filtering, forwarding errors, heartbeat, mentions/reply ancestry, polling, rendering and shutdown. Integration/session tests use a local fixture HTTP server and scripted Discord client. `tests/e2e/README.md` explicitly says there is no whole-system runner; its unversioned ingest/question paths are historical. Compose disables mentions, does not enable activity sniffing and defaults to a placeholder Gateway token, so bring-up alone does not prove these flows.

`TestQuestCommandJobAndMockDiscord` tests ingest/heartbeat persistence and mock delivery, but invokes stores/domain code directly for parts of the flow. It does not connect the actual bot through mounted API middleware into PostgreSQL and back. Activity statistics are a placeholder, so persistence and visible rollup/readback must remain separate claims.

## Sequential acceptance review

The all-endpoint runner remains proposed work. The QA golden-fixture acceptance test now exists; it has not passed database setup here.

1. **Prerequisites:** the QA seed source repair is applied; run its fresh-database double-load acceptance test against current migrations. Restore Docker access and missing tools. Run root `scripts/verify`, Go `go test ./...` and the complete tagged suite. Include tagged `cmd/api` fixtures in API CI.
2. **Phase one, individual operations:** start the actual API with a separate seeded disposable DB, `REQUIRE_DATABASE=1`, synthetic secrets and dev OAuth identities. Development `Wire` otherwise allows an in-memory fallback, and `/health` checks liveness only. Walk each REST method/path and each GraphQL root sequentially. Keep absent and no-op cases visible. Exercise anonymous, owner, other member, approved DM, archon, admin and inactive callers where applicable.
3. **Command/readback scenarios:** compare exact UUIDs, values, relationships and error codes. Follow writes with canonical API reads, then corroborate rows, histories and jobs. Check invalid payloads, not-found versus forbidden, retry/replay, rollback and read-only behavior. GraphQL 200 can contain errors or placeholders; assert selected values as well as errors. A 204 must demonstrate the intended effect. Reset fixtures and make clock-dependent expectations explicit.
4. **Bot proof:** drive scripted Gateway events through actual forwarding code, real API and DB; verify values, duplicates and heartbeat payloads. Submit a mention, claim/renew/retry/complete through the worker API with a deterministic answer, poll and capture the reply. Cover failures and shutdown. Target announcement delivery at a local Discord REST fixture and verify desired/applied revisions and jobs. Live provider credentials and proof form a separate lane.
5. **Phase two:** after correctness, exercise aliases, variables, fragments, nested quest/DM/brief/participant and document/author trees, pagination and contrasting permissions. Measure SQL count/growth, response bytes, errors, cold/warm p50/p95/p99 latency, throughput and connection use with declared population/concurrency. Record hardware, fixture, revision and query set. The capacity note's old Python load scripts are absent from this tree and cannot certify Go performance.

Phase-two guard gap: `DefaultLimits` declares depth 12 and complexity 250, but `NewHandler` installs `FixedComplexityLimit` twice rather than implementing a depth check. Add an actual depth assertion before relying on it. A per-request loader registry exists, but nested resolvers perform per-object lookups; registry presence is not batching or an N+1 bound.

## Dated execution receipts

Observed on 2026-10-13, before saving these review artifacts:

- `go test ./...` in `apps/api`: passed. Integration-tagged tests are excluded.
- `bun run --filter @pi/discord test`: passed, 114 tests in 21 files; fixture servers/scripted clients are used.
- `go test -tags=integration ./...`: failed at PostgreSQL setup. The fixture reported Docker unavailable; `docker info` was denied OS socket access even outside the session sandbox. No successful DB lane or seed load is claimed.
- `scripts/verify`: incomplete, failed at `uv run pyright` because Pyright was missing. Earlier lint, formatting and JS type checks passed; subsequent tests/pre-commit did not run in that invocation.
- Codex `--strict-config doctor`: configuration section accepted the scoped profile and approval Never. Aggregate exit was nonzero for other state/connectivity diagnostics; this is not an endpoint-access receipt.

The workspace [Codex configuration](/.codex/config.toml) enables a workspace-derived test profile, loopback hosts, explicit dependency hosts, tool caches and the Docker socket, with approvals disabled. Host permissions cover all ports, not selected HTTP paths/methods. Local user settings mark this project trusted. This cannot fix OS Docker permissions or prove activation in an existing session.

## Project-memory invalidation

The snapshot is derived evidence. OpenAPI, SDL, field routing, migrations and implementation remain authoritative. Compare the saved input file set and SHA-256 values before reusing conclusions. Added, removed or changed inputs require revisiting affected findings. Dated execution receipts never substitute for a fresh requested run.

A cheap comparison avoids repeating the inventory investigation:

```bash
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path.cwd()
b = json.loads((root / 'apps/api/docs/endpoint-review-baseline.json').read_text())
paths = {str(p.relative_to(root)) for pattern in b['input_patterns']
         for p in root.glob(pattern) if p.is_file()}
current = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths}
changed = sorted(p for p in set(current) | set(b['input_sha256'])
                 if current.get(p) != b['input_sha256'].get(p))
print('Inputs unchanged' if not changed else 'Recheck: ' + ', '.join(changed))
PY
```

Update this same note and snapshot as reviews advance. Retain failed, unavailable and not-implemented outcomes rather than treating HTTP success or fixture population as complete interface coverage.

## Knowledge CLI setup on Triton

Heptabase desktop 1.112.3, Notion CLI 0.23.19 and both official CLI skills are installed. The owner permits all Heptabase and Notion CLI commands, withdrawing the parent-scope restriction. User-layer rules in `~/.codex/rules/knowledge-cli.rules` were checked for matching CLI commands and nonmatching Docker/Python commands. They load at Codex startup; this does not prove the current session has reloaded them. Heptabase access remains CLI-only.

Pending setup: sign into Heptabase and enable/register the CLI, connect Notion CLI, retrieve the Heptabase account ID later, and create the new Chronicler parents and domain coverage boards. Full GraphQL CRUD remains an option pending review, not an accepted architecture change.

## Continuation receipts: 2026-10-13

- Source fingerprints matched before implementation. Revisited seed generator/fixture/tests and local Compose startup inputs; the remaining transport inventories and coverage findings are reused unchanged. GraphQL CRUD is still an option pending owner review.
- `go test ./...` passed after the seed repair. Targeted `TestQAFreshPostgresDoubleLoad` and the full `go test -tags=integration ./...`, with `DATABASE_URL` unset, failed during Docker setup (`socket: operation not permitted`). An external sentinel URL was rejected before database access. No live seed load or database behavior is claimed.
- `scripts/dev-stack` now rejects arguments, pins the local daemon/project/Compose inputs, uses loopback/synthetic settings, preserves its own volume and appends startup/service logs under mode-0700 `/tmp/chronicler-dev`. Bash syntax, Compose configuration and staged execpolicy examples passed. Actual startup exited at the daemon step; the authorized fixed `sg` refresh failed at `setgid`. Startup, liveness and repeated log-follower behavior remain unverified.
- Managed protection rejected writes to `.codex/config.toml` and the project rule directory. Desired socket removal, loopback access, exact Notion hosts and the absolute facade rule are staged in `/tmp/chronicler-dev-stack-config.toml` and `/tmp/chronicler-dev-stack.rules`; actual project configuration remains unchanged. Saved drafts are not active permissions.
- Reinstalled the agent's locked development environment to repair launchers pointing at the former clone path. Root `scripts/verify` now passes lint, formatting and both language type checks, then fails at Discord fixture HTTP tests: 102 passed, 12 failed, one unhandled error. An independent local fixture through the active proxy returned HTTP 502 `upstream failure`; this is environment evidence, not a passing bot receipt.
- Separate web tests passed: 440 tests in 91 files. The agent's normal test command failed 16 cases because the proxy environment requires optional `socksio`; `uv run --directory apps/agent --with socksio pytest` passed all 363 tests. This supplemental invocation does not certify the normal root gate.
- Agent Ruff formatting passed. Pre-commit passed with a scratch cache and a temporary `bunx` shim forwarding to installed `bun x`; the default cache was read-only and `bunx` was absent. No source dependency or hook change was made for these environment workarounds.
- Nine domain-board inventories and proposed placement inputs are prepared in `/tmp/chronicler-boards`: all 34 GraphQL roots, 36 REST routes plus GraphQL transport, and 91 absent REST identities, with separate implementation/test evidence. Exact-set and semantic classification checks passed. No remote board/page was created and no layout lint/screenshot is claimed: Heptabase CLI is not registered, Notion is unauthenticated, and its login request was denied access to `app.notion.com`.
