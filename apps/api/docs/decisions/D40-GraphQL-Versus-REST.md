# D40: GraphQL Versus REST

**Status:** decided 2026-10-09
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** `packages/contracts`

## Context

The old API exposed every read and write as a GraphQL field. Mapping passes that treated every fixed-shape field as REST would force a web client rewrite and put three quarters of the contract on REST. The Go API needs one rule that reviewers can apply without arguing per field.

## Decision

A field is **GraphQL** when a screen selects a tree of related fields on one round trip (list or detail with nested children).

A field is **REST** when it is any of:

- a command (old mutation)
- a pure lookup with a fixed response shape
- static configuration or a fixed aggregate
- a read that writes (must become an explicit command, optionally followed by a query)

A field is **DROP** when it is an alias, a deprecated path, or a placeholder that always returns empty.

Version lives once in the path (`/v1/graphql`, `/v1/...`). Field and type names drop the `V2` suffix.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Everything GraphQL | Keeps reads-that-write and fixed aggregates in the wrong place; no gain over the old API |
| Everything REST | Forces a full web client rewrite and loses nested selection |

## Consequences

- Mutations are REST commands under `/v1`.
- Nested quest/character/document/map/member trees stay on `/v1/graphql`.
- `myNotifications` and `myPersonalization` split into a command plus a read.
- Field routing lives in `packages/contracts/field-routing.md` and must stay in sync with the SDL and OpenAPI.

## Enforced by

Contract review against `packages/contracts/field-routing.md`. CI `check-schema` and OpenAPI drift checks once wired.

## Reopen triggers

A screen needs nested selection on a field currently marked REST, or a GraphQL field is only ever fetched with a fixed shape and never nests.
