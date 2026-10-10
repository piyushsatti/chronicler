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

- Docs refactor: links flow map → interfaces → app docs; boundary decisions shortened; long-form essays quarantined to gitignored `.local/docs-quarry/`. See [docs/start-here.md](docs/start-here.md).
- Project license set to GNU GPL version 2 (same as the Linux kernel).

## [0.0.0] - TBD

Initial tagged release of the monorepo layout will be recorded here when versioning starts.

Prior application history predates this layout and is not replayed in this file.
