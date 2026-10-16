# Contributing

Thank you for helping improve Chronicler. This document covers **how we work in this repository**. Product intent: [docs/systems.md](/docs/systems.md), [docs/interfaces/](/docs/interfaces/README.md). Documentation routing: [docs/start-here.md](/docs/start-here.md).

New packages and Python modules should use the PI namespace (`@pi/<app>`, `pi.chronicler.<area>`) as described in [README.md](/README.md).

By contributing, you agree that your contributions are licensed under the same terms as the project: the [GNU General Public License version 2](/LICENSE).

## Before you open a pull request

1. **Scope:** Match the current monorepo scaffold. Large features or boundary changes should align with [docs/interfaces/](/docs/interfaces/README.md) and [docs/systems.md](/docs/systems.md) (or an explicit issue) before substantial code lands.
2. **Discuss early** if the change alters public GraphQL schema, auth boundaries, or deployment shape.
3. **Run the quality gate** locally (see below) and fix failures in the same PR.
4. **Describe verification** in the PR: commands run, apps affected, and any gaps (e.g. app not yet wired in `scripts/verify`).

Agents: also read [AGENTS.md](/AGENTS.md).

## Development setup

**Prerequisites**

- [Bun](https://bun.sh) 1.3.14 (`packageManager` in `package.json`)
- [Go](https://go.dev) 1.26+ for the API
- [uv](https://docs.astral.sh/uv/) for Python tooling and the agent service

**One-time setup**

```bash
scripts/setup
```

Installs JavaScript workspaces, syncs the root Python dev dependency group (`ruff`, `pyright`, `pre-commit`), and syncs all agent dependency groups.

**Optional git hooks**

```bash
uv run pre-commit install
```

## Quality gate

Run before pushing:

```bash
scripts/verify
```

Or: `bun run verify`. This runs JavaScript and Python lint, format check, typecheck, Discord/web Vitest and agent pytest, all pre-commit hooks, and docs lint. It excludes Go and Playwright; select their checks below when applicable.

### Tooling reference

| Tool     | Scope                            | Command                |
| -------- | -------------------------------- | ---------------------- |
| ESLint   | TypeScript / JavaScript          | `bun run lint:js`      |
| Prettier | Formatted text in repo           | `bun run format:check` |
| Ruff     | Python                           | `bun run lint:py`      |
| Pyright  | Python types                     | `bun run typecheck:py` |
| Tests    | Discord/web Vitest, agent pytest | `bun run test`         |

Format fix: `bun run format`. Full lint: `bun run lint`. Full typecheck: `bun run typecheck`.

### GraphQL schema

After API schema changes:

```bash
bun run export-schema
bun run check-schema
```

Commit updated `packages/contracts/schema.graphql` when the API contract changes.

## Triton workflow adapter

**Pattern: Adapter.** Shared orchestration policy remains at `~/.codex/workflows/triton-workflow/SKILL.md`; this section owns Chronicler's setup, command selection, and evidence boundaries. This converges on one shared policy and one repository reference. Repository architecture and the rules in [AGENTS.md](/AGENTS.md) remain authoritative.

Use [Development setup](/CONTRIBUTING.md#development-setup) and [README.md](/README.md#develop). Before assigning execution, give one environment owner responsibility for checking the actual worker/gate PATH (`bun`, `bunx`, `uv`, Python and Go), dependencies, writable caches/output space, and any required loopback, proxy, Docker or browser access. Missing prerequisites are readiness failures; do not change model, execution controls, permissions or unrelated configuration to route around them.

Select acceptance by changed scope; commands run from the repository root unless stated otherwise:

- **Repository documentation/tooling, including this file and `AGENTS.md`:** `scripts/verify-repo` and `python3 scripts/docs-lint.py`. For a focused adapter check, also use `bun node_modules/prettier/bin/prettier.cjs --check AGENTS.md CONTRIBUTING.md` and `git diff --check -- AGENTS.md CONTRIBUTING.md`. Focused checks do not replace the repository gate.
- **Covered application changes:** `scripts/verify`. Go and browser behavior require separate lanes.
- **Go/API:** from `apps/api`, run `go test -count=1 ./...` and `go vet ./...`.
- **Schema/code generation:** from `apps/api`, run `env -u DATABASE_URL bash scripts/verify-loop.sh`; follow [API CI](/.github/workflows/api.yml) for additional gqlgen drift checks. This command regenerates outputs and executes selected integration packages via disposable PostgreSQL, so it requires Docker even for schema work.
- **Database/persistence:** from `apps/api`, run `env -u DATABASE_URL go test -tags=integration -count=1 ./...`. Tests own disposable testcontainers; do not supply a shared database override. This includes `cmd/api` and `cmd/seedqa`, which the verify-loop tagged package list omits.
- **Web browser behavior:** run `bun run --filter @pi/web lint` and `env CI=1 bun run --filter @pi/web test:e2e`. Check port 4173 ownership first; stop on occupancy without killing or adopting an existing server. `CI=1` disables Playwright server reuse. These Chromium journeys use a mock API; they do not prove full-stack or live-provider behavior.

Use existing app tests and CI as acceptance journeys, selected for the actual change. Distinguish environment failures, unit/fixture evidence, database behavior and live-provider behavior. Dated successful receipts do not establish current readiness.

Apply the canonical skill's ownership and review contracts. Record existing writers, dirty files and exclusions in each run's briefs. `scripts/verify` includes hooks that can rewrite files: run fixing all-files gates in an isolated checkout when the source checkout contains unrelated work. Use the recorded revision plus only the agreed patch; do not copy another checkout's virtual environment or secrets. Preserve effective global/project guidance, configuration/trust, model and execution controls, and record parity before treating an isolated run as qualification.

Keep the canonical skill's per-run evidence under ignored `.local/workflow-runs/`, outside the shared skill, using its `scripts/session.py` helper where applicable. Each session state must identify the checkout where its commands execute. For disposable checkouts, keep primary evidence in the persistent source run directory, outside resources scheduled for deletion; verify retained reports/logs before cleanup. `/tmp` alone is insufficient, and local persistence is not a remote backup. Keep run state out of living documentation and retain one canonical endpoint-review memory.

For fresh-session qualification, follow the canonical skill's activation and acceptance requirements using the repository lanes above. Inspect owned processes after timeouts before retrying or cleaning up; a timeout receipt does not prove child termination. Keep evidence outside any checkout scheduled for cleanup.

Workflow adoption does not authorize production deployment, merge, remote publication, destructive database reset, product architecture/transport changes, memory enablement or generated-memory rewrites. Production releases remain [Actions-only](/docs/interfaces/actions-releases.md). Mercury, existing sessions and unrelated repairs remain excluded. A necessary configuration change requires demonstrated runtime evidence, a scoped authorized edit and rollback that preserves intervening unrelated changes; preserve the original bytes/hash and validate the rollback under fresh effective controls.

## Documentation ownership model

Templates (frozen): [docs/templates/](/docs/templates/README.md). Index: [docs/README.md](/docs/README.md).

### Ownership

| Owner              | Paths                                                                        | Holds                                                     |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Product (global)   | `docs/requirements/`, `docs/semantics/`, `docs/systems/`, `docs/interfaces/` | What we owe, vocabulary, thin system map, boundaries      |
| Boundary decisions | `docs/decisions/` (D-ids that cross apps)                                    | Short ADRs linked from an interface                       |
| App                | `apps/<app>/docs/`                                                           | Design, internals, local decisions, as-built for that app |
| Deploy             | `deploy/` (runbooks next to compose)                                         | Ship, backup, repair steps                                |
| Repo               | this file, [AGENTS.md](/AGENTS.md)                                           | How to change the monorepo                                |

### Acceptance rules (checks, not conventions)

1. **One owner per doc.** Product, boundary, one app, or deploy — never two.
2. **Links flow down.** Map → interfaces → each side's app docs. App docs may link **up only** to interfaces they implement (and `packages/contracts` for the GraphQL schema). App docs must not link to system essays or other apps' design pages. In-repo markdown links are **repo-root absolute** (`/docs/...`, `/apps/...`, `/deploy/...`), never `../` relative between docs. Every link target must exist **under this git root** and have real content (not an empty or `# Placeholder` file; directory links need a contentful `README.md`).
3. **Interfaces** live at `docs/interfaces/<name>.md`. Required fields: Rule, Provider, Consumers, Enforcement, Related decisions. Enforcement names a schema check, test, or CI step — or explicitly **not enforced**.
4. **Decisions are short.** Target ≤60 lines, hard cap 100. Fixed template: Context, Decision, Alternatives rejected, Consequences, Enforced by, Reopen triggers. IDs D1–D33 never change. No DDL, inventories, tutorials, or requirement tables inside a decision.
5. **Evidence uses durable anchors.** Symbol names, test names, schema fields, CI job names. No `file:line`, no commit hashes in living docs.
6. **Doc links stay inside this git root.** No wiki URLs or `epic-*.md` working files as authority. (Host paths in runbooks like `/opt/…` are fine in prose; they are not doc links.)
7. **One canonical page per topic.**

### Stages (architecture and epics)

| Stage              | Outcome                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Interface / system | Update interface or thin system page; keep [systems.md](/docs/systems.md) linked                                    |
| Epic cut           | Trace R-ids in [requirements/index.md](/docs/requirements/index.md); open issues with acceptance tied to those rows |
| Issue build        | Plan → implement → `scripts/verify` → PR with verification named                                                    |
| Close              | Distill durable conclusions into the owning path; leave scratch outside the clone                                   |

### Writing rules

- Lead with a **Verdict** or TL;DR; prefer tables for seams.
- Do not paste session plans, chat transcripts, or RTM dumps into living docs.
- Label scaffold or partial behavior clearly; do not present planned design as shipped.
- Code that changes a boundary cites an interface (and its decision) or opens an issue first.
- Optional local archaeology: gitignored `.local/docs-quarry/` — not authority.

## Releases and changelog

User-visible changes belong in [CHANGELOG.md](/CHANGELOG.md) under `[Unreleased]` until a version is cut. Release tagging and production promotion follow GitHub Actions only ([D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)).

## Getting help

Open a [GitHub issue](https://github.com/piyushsatti/chronicler/issues) for bugs and feature discussion. For architecture questions, start from [docs/systems.md](/docs/systems.md).
