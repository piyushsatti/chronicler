# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once public versioning begins.

## [Unreleased]

### Added

- Agent HTTP-first port: `apps/agent` uv project (`pi.chronicler.agent` / `archive` / `qa`), API claim/complete job pipeline, Archive MCP + LanceDB, deploy compose without RabbitMQ, `agent.yml` CI. Docs: [agent-qa-http](docs/interfaces/agent-qa-http.md), D43.
- Repo CI scaffold: `.github/workflows/repo.yml` and `scripts/verify-repo` (docs lint, Prettier, Ruff, Pyright). Web and agent apps stay out of that job.
- Monorepo scaffold: `apps/api`, `apps/web`, `apps/discord`, `apps/agent`, `packages/contracts`.
- Root tooling: Bun workspaces, uv dev group, `scripts/setup`, `scripts/verify`, GraphQL `export-schema` / `check-schema`.
- Repository hub docs: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, changelog and license files.
- Documentation ownership model: `docs/systems/`, `docs/interfaces/`, `docs/decisions/`, `docs/requirements/`, `docs/semantics/`, co-located `apps/*/docs/`, runbooks in `deploy/docs/`. Templates in `docs/templates/`. Lint: `scripts/docs-lint.py`.

### Changed

- Port Legacy Home, Tavern Board, Chronicles, Codex, Community, and Rules presentation onto current GraphQL adapters and PageHost. Home drops archive buckets and unsupported beginner counts; media controls remain usable on compact and wide layouts. Codex uses server filters and bounded paging; rule cards open the current document reader. Community uses public availability and character-roster reads, and unavailable avatar images fall back to initials.
- Make `/codex/:slug` the canonical Codex reader. Typed slug aliases share that reader; typed UUID aliases resolve readable `codex_entry` document metadata first. Existing editor routes retain precedence; new Codex titles normalizing to `new` allocate from `new-entry` so their reader URLs remain reachable.
- Docs refactor: links flow map → interfaces → app docs; boundary decisions shortened; long-form essays quarantined to gitignored `.local/docs-quarry/`. See [docs/start-here.md](docs/start-here.md).
- Project license set to GNU GPL version 2 (same as the Linux kernel).

## [0.0.0] - TBD

Initial tagged release of the monorepo layout will be recorded here when versioning starts.

Prior application history predates this layout and is not replayed in this file.
