# Web

React SPA (Vite, TypeScript) for Chronicler (`@pi/web`).

## Layout

| Path              | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `src/api/`        | `/v1/graphql` and `/v1` REST clients     |
| `src/features/`   | Vertical slices (adapters, hooks, pages) |
| `src/components/` | Foundation and domain UI                 |
| `src/errors/`     | Transport / AppError / `toAppError`      |
| `tests/`          | Vitest + Testing Library + MSW           |
| `public/`         | Static assets                            |

## Commands

```bash
bun run --filter @pi/web dev
bun run --filter @pi/web test
bun run --filter @pi/web lint
bun run --filter @pi/web build
```

Set `VITE_API_MODE=mock` for MSW in the browser. Architecture: [`docs/architecture.md`](docs/architecture.md).

### Local API (dummy Postgres)

To hit a real local API instead of MSW:

1. Start the stack: `scripts/dev-stack` (needs Docker for Postgres + API on `127.0.0.1:8080`).
2. Load UI fixtures: from `apps/api`, `./scripts/load-qa.sh` (after migrate).
3. Point the web app at the API: set `VITE_API_MODE=proxy` (or omit `mock`) in `.env`. Optional override: `VITE_DEV_API_ORIGIN` (default `http://127.0.0.1:8080`).
4. `bun run --filter @pi/web dev` — Vite proxies `/v1` and `/auth` same-origin to that origin.

Mock mode is unchanged: MSW still intercepts when `VITE_API_MODE=mock`.

## API

GraphQL trees at `/v1/graphql`; commands and fixed lookups under `/v1`. See [`packages/contracts/field-routing.md`](../../packages/contracts/field-routing.md). Responsive shell waits on the Imposition library; pages are single-column until then.
