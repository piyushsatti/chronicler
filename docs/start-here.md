# Start here

One path for a human or agent joining this repository.

## Verdict

- **Product intent:** [requirements/](/docs/requirements/README.md), [semantics/](/docs/semantics/README.md), [systems.md](/docs/systems.md), [interfaces/](/docs/interfaces/README.md), [decisions/](/docs/decisions/README.md).
- **As-built:** `apps/*/docs/`, [deploy/docs/](/deploy/docs/README.md), `packages/contracts/`.
- Outer workspace scratch is not authority.

## Read in this order

1. [Repository README](/README.md) — setup, layout, license.
2. [Systems map](/docs/systems.md) — fourteen systems and the seams that matter.
3. [Interfaces](/docs/interfaces/README.md) — boundaries both sides must honor.
4. One system page that matches your work (example: [Discord](/docs/systems/discord-bot.md)).
5. [AGENTS.md](/AGENTS.md) if you are changing code.
6. [Semantics](/docs/semantics/README.md) when naming actors, nouns, or verbs.

## Local develop

```bash
scripts/setup
scripts/verify
```

Per-app entrypoints: `apps/*/README.md`. Discord is the first app covered by root `bun run test`.

## Where to put new docs

| Kind                            | Put it here                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| Requirement / R-id              | `docs/requirements/`                                                 |
| Meaning (actors, nouns, verbs)  | `docs/semantics/`                                                    |
| Boundary rule                   | `docs/interfaces/` (+ short decision in `docs/decisions/` if needed) |
| Thin system map entry           | `docs/systems/`                                                      |
| App design / as-built           | `apps/<app>/docs/`                                                   |
| Deploy / backup / on-call steps | `deploy/docs/`                                                       |
| Monorepo / PR / verify rules    | [CONTRIBUTING.md](/CONTRIBUTING.md)                                  |

One canonical page per topic. Links flow down: map → interfaces → app docs.
