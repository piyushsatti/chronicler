# Chronicler

Campaign-management software for a West Marches Dungeons & Dragons community: authoritative records on the web, identity and activity from Discord, imported character snapshots from external sheet tools.

**Chronicler** is the product name. **PI** is the maintainer namespace: JavaScript workspaces use `@pi/*` (for example `@pi/discord`), the Go API module is under `apps/api`, and the agent service uses `pi.chronicler.agent`. The project is volunteer-maintained under that namespace and licensed under the [GNU GPL version 2](/LICENSE), the same license as the Linux kernel.

[**Start here**](/docs/start-here.md) · [**Systems**](/docs/systems.md) · [**Docs index**](/docs/README.md) · [**Contributing**](/CONTRIBUTING.md) · [**Changelog**](/CHANGELOG.md) · [**License**](/LICENSE)

## Status

This tree is an application **monorepo re-scaffold** (`apps/*`, shared contracts). Not every app has a full local run path yet. What CI and `scripts/verify` enforce today is the best signal for “implemented”; see each `apps/*/README.md`.

## Develop

**Prerequisites:** [Bun](https://bun.sh) 1.3.14 (see `packageManager` in `package.json`), [Go](https://go.dev) 1.26+, and [uv](https://docs.astral.sh/uv/) for the agent service.

```bash
scripts/setup    # once: JS workspaces + Python dev tools
scripts/verify   # lint, format, typecheck, tests, pre-commit
cd apps/api && go test ./...
```

Equivalent: `bun run verify` after setup. Tooling and hooks: [CONTRIBUTING.md](/CONTRIBUTING.md).

### Monorepo layout

| Path | Role |
| --- | --- |
| `apps/api` | Go GraphQL + REST API and worker |
| `apps/web` | React SPA (`@pi/web`) |
| `apps/discord` | discord.js sensor and mention agent (`@pi/discord`) |
| `apps/agent` | Server-side agent (`pi.chronicler.agent`) for Discord and future callers |
| `packages/contracts` | GraphQL SDL (`graphql/`), OpenAPI, field routing (`@pi/contracts`) |
| `scripts/` | `setup`, `verify`, automation |
| `docs/` | Product intent + as-built documentation ([start here](/docs/start-here.md)) |

### Contracts

Source SDL is `packages/contracts/graphql/*.graphql`. `schema.graphql` is the merged file for web codegen. REST lives in `openapi.yaml`.

```bash
bun run export-schema   # merge graphql/ → schema.graphql
bun run check-schema    # fail if merged schema drifted
```

## Run the product (local)

End-to-end run commands will live in `scripts/` and app READMEs as each surface is wired. Until then, use per-app dev entrypoints documented under `apps/discord` (the first app covered by root `bun run test`).

## Get help

- **Bugs and features:** [GitHub Issues](https://github.com/piyushsatti/chronicler/issues)
- **Architecture:** [Systems map](/docs/systems.md)
- **Automated agents:** [AGENTS.md](/AGENTS.md)

## Contributing

We welcome changes that match current scaffold scope. Read [CONTRIBUTING.md](/CONTRIBUTING.md) before opening a pull request.

## License

Chronicler is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License version 2](/LICENSE). Copyright (C) 2026 PI.
