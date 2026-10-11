# D#: \<one-line title\>

**Status:** decided YYYY-MM-DD | ruled-provisional YYYY-MM-DD  
**Kind:** boundary | local  
**Owner:** global (`docs/decisions/`) | `apps/<app>/docs/decisions/`  
**Interface:** [name](/docs/interfaces/name.md) (boundary only) or n/a

Target **≤60 lines**. Hard cap **100**. No DDL, inventories, tutorials, or requirement tables.

## Context

What forced a choice (two or three sentences).

## Decision

The ruling in plain words. Preserve owner-ruling quotes and dates verbatim when present.

## Alternatives rejected

| Alternative | Why not |
| ----------- | ------- |
| …           | …       |

## Consequences

What becomes true / impossible after this ruling.

## Enforced by

Durable anchors only: symbol names, test names, schema field names, CI job names.  
No `file:line`, no commit hashes. If nothing enforces it: **not enforced**.

## Reopen triggers

Falsifiable conditions that would reopen the decision.
