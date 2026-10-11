# Database docs

High-signal notes for the Postgres schema under `apps/api/db/`. Truth for columns and constraints remains in `migrations/0001_init.sql`.

| Doc                        | Covers                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| [design.md](design.md)     | Why: dual-key, greenfield goose, TEXT+CHECK, axial hex (no PostGIS), API never sees bigint |
| [patterns.md](patterns.md) | Locked naming / table patterns; when `public_id` applies                                   |
| [tables.md](tables.md)     | Inventory by domain section — purpose + pattern tag                                        |

Related decisions (do not duplicate here):

- [D26 — Ten roots not forty-five repos](../../docs/decisions/D26-Ten-Roots-Not-Forty-Five-Repos.md) — aggregate boundaries in Go
- [D16 — Ledgers share a shape, not a table](../../docs/decisions/D16-Ledgers-Share-A-Shape-Not-A-Table.md) — per-domain ledger/history tables
- [D42 — Worker and migrations](../../docs/decisions/D42-Worker-And-Migrations.md) — goose as the migrations tool

Parent entrypoint: [`../README.md`](../README.md).
