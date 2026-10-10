# D30: Deletion Is Named Per Entity

**Status:** decided 2026-07-31
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

· **Governs:** FINDINGS F2

## Decision

- **The "one live hard delete" claim is false and this record retires it.**Thirteen

- **Two of the three GraphQL-reachable hard deletes are on role-grant ledgers**

- **`game_time_map` carries a live unconditional bulk purge**and appears in neither

- **`members` is deferred, not answered**, and D31 says why.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Leave `quests`/`characters`/`regions` undecided until someone needs it | That is R2's literal failure mode; "undecided by omission" is the state being closed |
| Hard delete for quests/characters | Every FK is `NO ACTION`; a hard delete fails against the referencing ledgers, so the option is not merely undesirable, it does not execute |
| Declare only the tables the docs already listed | The docs's list is six tables and its central deletion claim is false. A record that inherits the undercount reproduces F2 |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A fourteenth hard-delete path appears without a row here.
- `EXPECTED_TABLE_COUNT` moves off 54 without this table gaining the new entity.
- Any FK in the schema stops being bare `REFERENCES` — the cascade argument above dies with it.
