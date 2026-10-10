As-built living note. Scrubbed from quarry; prefer durable symbol/schema names over path:line.
Interfaces: see [docs/interfaces/](/docs/interfaces/README.md).

# Backend stack


Current-state reference (latest only at time of excerpt). Paths below describe **legacy** layout until the API app is fully wired.

## Languages & runtime

| Item | Value | Legacy source |
| --- | --- | --- |
| Language | Python | `pyproject.toml` |
| Version | `>=3.12`, pinned `3.12` | `requires-python`, `.python-version` |
| Package manager | **uv** | `uv.lock` |
| Container base | `python:3.12-slim` | `Dockerfile` |

## Web / API framework

- **FastAPI** — HTTP app, lifespan, CORS, REST auth routers.
- **Strawberry GraphQL** — `GraphQLRouter` with context: DB session, `session_maker`, `discord_id`, `claims_v2`.

## Data layer

- **SQLAlchemy 2.0 async**, `asyncpg` driver.
- **Postgres** (PostGIS image available; hexes use plain axial integers).
- **Alembic** migrations.
- **Pydantic v2** at boundaries.

## AI integration: none

Legacy extraction pipeline removed (#528); website-first pivot.

## Monorepo commands (current tree)

```bash
bun run export-schema
bun run check-schema
```

Full legacy stack doc: quarry `prior tree/apps/api/docs/backend-stack.md`.
