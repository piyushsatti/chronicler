# D2: Multi Quest Summary Identity

**Status:** decided 2026-07-15
**Kind:** local
**Owner:** `apps/api/docs/decisions/`
**Interface:** n/a

## Context

The `questId → questIds` change dropped the field that anchored an upsert. Without a replacement identity, the product could not tell “same summary, new edit” from “new summary.”

## Decision

A quest summary’s identity is a nullable **`documentId`**, never a slug or a `(category, character)` pair.

`upsertQuestSummaryV2`: **`documentId` null → create**; **set → update** that document (title, body, `questIds`, links re-settable). Identity is the document **primary key** (stable). **Not** slug (mutates on rename). **Not** `(category, character)` (blocks multi-game summaries). **No new uniqueness constraint** — author-titled summaries are intentionally many-per-member.

## Alternatives rejected

| Alternative                    | Why not                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| Create-only, drop upsert       | Not chosen; no rejection rationale recorded beyond being unchosen |
| Key on `(category, character)` | Contradicts summaries that span several games                     |

## Consequences

Upsert and read paths resolve summaries by document id only. Slug or frontmatter containment is not an identity key.

## Enforced by

`upsertQuestSummaryV2` contract; upsert path resolves via `DocumentsRepo.get_by_id` only.

## Reopen triggers

- A written ADR supersedes this decision.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
