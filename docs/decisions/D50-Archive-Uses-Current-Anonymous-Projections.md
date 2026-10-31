# D50: Archive uses current anonymous projections

**Status:** decided 2026-10-29  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [agent-qa-http](/docs/interfaces/agent-qa-http.md)

## Context

The live Archive service needs database candidate IDs and current anonymous document bodies. `ProjectionReader` queries only `document_id`, while `AnonymousGraphqlSource` reads `effectiveBody` from the anonymous API.

## Decision

Use a **CQRS read model** for candidate IDs and the existing **Specification** for readability. `public.archive_documents_v1` exposes one UUID column, `document_id`, for non-deleted documents admitted by `document_readable` with an anonymous viewer. The view contains no body or marker logic.

At runtime, `ArchiveSource` revalidates candidates through the current anonymous GraphQL API. `is_eligible_public_document` admits only projections with a supported route and a non-empty public body.

This converges on one projection authority. The Go Document projector supplies `effectiveBody`, as required by [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md). The database view identifies candidates without copying body projection rules.

## Alternatives rejected

| Alternative                             | Why not                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| Store or project bodies in the view     | Duplicates the Go projector or introduces a second body cache. |
| Read raw bodies from PostgreSQL         | Bypasses anonymous `effectiveBody` redaction.                  |
| Trust frozen snapshot bodies at runtime | Can retain withdrawn content or an older public body.          |

## Consequences

The live Archive service requires API migration `0015_archive_documents_view.sql` and an operator-managed identity with access to the view. `ArchiveSource` needs anonymous API access for each indexed body. A readable candidate can still be omitted because its route is unsupported or its projected body is empty.

## Enforced by

`TestArchiveDocumentsViewMigrationAnonymousEligibility` covers view eligibility and up, down, up. `ProjectionReader.all_document_ids` and `ProjectionReader.eligible_document_ids` select only IDs. `test_bootstrap_withdrawal_is_not_readable_or_indexable` and `test_bootstrap_reads_current_projection_after_public_body_changes` cover current anonymous body revalidation.

## Reopen triggers

- The anonymous API cannot provide current projections for candidate IDs.
- Archive gains a body source that bypasses the Go Document projector.
