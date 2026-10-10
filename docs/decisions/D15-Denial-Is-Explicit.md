# D15: Denial Is Explicit

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

**A denied request says denied.** `FORBIDDEN`, distinguishable from not-found. The caller learns the
resource exists and that they may not have it.

## Decision

**A denied request says denied.** `FORBIDDEN`, distinguishable from not-found. The caller learns the
resource exists and that they may not have it.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Uniform not-found | Buys the enumeration defence at a real cost to legitimate users. A DM who lost a role sees "not found" for a quest they can see in their own history, and support cannot distinguish "the thing is gone" from "your access is gone" either, because the server did not tell them apart. Paying that for the bounded exposure above is a bad trade. |
| Not-found for anonymous, denied for members | Defensible, and the strongest of the three. Rejected on proportionality: two behaviours keyed on identity is more surface to get right and to test, and D14 already made the exposure small enough not to need it. Kept as the escalation if document-id probing ever shows up in logs. |

## Consequences

This ruling remains binding until a reopen trigger fires or a new ADR supersedes it. Long-form evidence (if any) remains in `.local/docs-quarry/decisions-longform/`.

## Enforced by

**not enforced** unless the related interface names a schema check, test, or CI job.

## Reopen triggers

- A written ADR supersedes this decision.
