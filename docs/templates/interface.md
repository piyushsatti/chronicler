# Interface: \<short name\>

**Status:** draft | accepted | superseded  
**Provider:** `apps/<app>` (or `packages/contracts`)  
**Consumers:** `apps/<app>`, …

## Rule

One or two sentences: the obligation both sides must honor.

## Enforcement

| Mechanism                            | Location         | Status                   |
| ------------------------------------ | ---------------- | ------------------------ |
| Schema check / test / CI step / lint | path or job name | enforced \| not enforced |

If every row is **not enforced**, list this interface on [interfaces/README.md](/docs/interfaces/README.md#not-enforced).

## Provider

How the providing side satisfies the rule. Link into `apps/<provider>/docs/…` only.

## Consumers

How each consumer relies on the rule. Link into each `apps/<consumer>/docs/…` only.

## Related decisions

- [D#](/docs/decisions/D#.md) — one-line why this interface exists

## Reopen

What evidence would force rewriting this interface (not a code bug report).
