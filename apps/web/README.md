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

## API

GraphQL trees at `/v1/graphql`; commands and fixed lookups under `/v1`. See [`packages/contracts/field-routing.md`](../../packages/contracts/field-routing.md). Responsive shell waits on the Imposition library; pages are single-column until then.
