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
- [uv](https://docs.astral.sh/uv/) for Python tooling and API/agent packages

**One-time setup**

```bash
scripts/setup
```

Installs JavaScript workspaces and syncs the root Python dev dependency group (`ruff`, `pyright`, `pre-commit`).

**Optional git hooks**

```bash
uv run pre-commit install
```

## Quality gate

Run before pushing:

```bash
scripts/verify
```

Or: `bun run verify`. This runs JavaScript and Python lint, format check, typecheck, tests, and all pre-commit hooks.

### Tooling reference

| Tool     | Scope                           | Command                |
| -------- | ------------------------------- | ---------------------- |
| ESLint   | TypeScript / JavaScript         | `bun run lint:js`      |
| Prettier | Formatted text in repo          | `bun run format:check` |
| Ruff     | Python                          | `bun run lint:py`      |
| Pyright  | Python types                    | `bun run typecheck:py` |
| Vitest   | `@pi/discord` (more apps later) | `bun run test`         |

Format fix: `bun run format`. Full lint: `bun run lint`. Full typecheck: `bun run typecheck`.

### GraphQL schema

After API schema changes:

```bash
bun run export-schema
bun run check-schema
```

Commit updated `packages/contracts/schema.graphql` when the API contract changes.

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
