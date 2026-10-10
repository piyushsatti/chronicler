As-built living note. Scrubbed from quarry; prefer durable symbol/schema names over path:line.
Interfaces: see [docs/interfaces/](/docs/interfaces/README.md).

# Capacity attribution

Which lever contributes what to the system's capacity ceiling, and who owns each one.
Two levers are filled here; two are named and owned elsewhere. Attribution is
partial on purpose — an unmeasured contribution is left empty rather than guessed.

| Lever | Contribution | Owner |
|---|---|---|
| Connection budget | Declared, not measured: one total partitioned into per-process shares, with the `api` share's ceiling being its `pool_size + max_overflow` (``apps/api`/db/pool.py`). The fields and their defaults are `config.py`; the sum is checked at process start and the process refuses to boot when the shares over-subscribe the total (`config.py`). This says what the system permits itself, which is a different claim from what it survives. | this epic |
| Measured ceiling | 2026-08-01 run of `scripts/loadtest/chronicler.js` at the target declared in `scripts/loadtest/config.json`, against a local stack (`chronicler_test`, backend on `:8002`, `dev_seed_v2` data), k6 v2.1.0, 11,081 iterations, 0 errors. Per-route p95: home 360.5 ms, quest detail 369.7 ms, DM dashboard 192.8 ms. No pool rejection occurred at the declared target — `CAPACITY_EXHAUSTED` was 0 on all three routes — so the ceiling is above it and **remains unmeasured**. The p95 figures are latency, not capacity. | this epic |
| Read-path batching | Contribution not measured here. | the SQL-and-batching epic ([SQL-and-batching](/docs/interfaces/session-audience.md); the RTM's batching rows already record two independent hand-rolled batchers with no shared mechanism) |
| Frontend cache policy | Contribution not measured here. | the FE-cache epic (the RTM's data-and-caching and loading-and-performance rows; the global `staleTime: 0` plus refetch-on-focus behaviour is the subject) |

## Reading the ceiling row

The run found latency, not a limit. Zero `CAPACITY_EXHAUSTED` responses means the
pool never rejected a request at the load that was driven, so the number this row
reports is a **floor** on capacity: the system did at least this much. It is an
upper bound on nothing.

The stack was local and single-node with a small seed, so this is not a production
capacity statement. What it does establish is that the declared target is not
where the system breaks.

`CAPACITY_EXHAUSTED` is the typed rejection the API returns when the pool is
exhausted (``apps/api`/graphql/extensions/capacity.py`). A zero count
is a meaningful reading rather than a missing instrument.

## Re-measuring

`scripts/loadtest/README.md` carries the run recipe, the guards, and the
local-only rules. The target and duration live in `scripts/loadtest/config.json`
and nowhere else — change them there and the next run changes with them.
