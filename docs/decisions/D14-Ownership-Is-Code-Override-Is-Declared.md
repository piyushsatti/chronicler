# D14: Ownership Is Code; Override Is Declared

**Status:** decided; amended 2026-09-16; amended 2026-11-07  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

Read visibility and write ownership are separate axes. Treating resource authority as a documents-only mechanism hid inconsistent overrides on character writes.

## Decision

**Use relationship-based access control with ownership in code and explicitly declared override breadth.** The ownership relation is an invariant: document author, quest DM, character owner, or the archon assigned to the map's region. Declaring an override never changes that relation.

Operation declarations name the required permission and who may act without owning the resource. A declared role is specific; “any role holder” needs a written justification. Do not invent broader authority inside a service body. [D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md) governs platform-owner/admin bypass.

**September 16 amendment:** every player-character mutation is literally owner-only, including profile/guild/status, progression and logs, verification submission, downtime and D&D Beyond sync. Platform owner, admin, verifier and other staff have no mutation bypass. Separately authorized admin/verifier decisions may append an assessment and change approval/lifecycle state; they do not edit player-authored fields or initiate sync.

**November 7 amendment:** profile fields written by `updateCharacterProfile` — the same fields the owner edits on the character page — may also be edited by an admin (the `admin` role) or the platform owner ([D29](/docs/decisions/D29-Owner-And-Admin-Bypass-Identity-Predicates.md)). Verifiers and other DMs do not receive this grant. Every other player-character mutation stays owner-only: guild and status, progression and logs, verification submission, retirement, downtime, and D&D Beyond sync. This reverses the September 16 amendment for those profile fields only.

Per-row read audience applies to the document family: documents, revisions and links. Quests and characters remain public records; this does not expose a quest brief, linked document or protected body. Document reads follow [scoped-body](/docs/interfaces/scoped-body.md). This ruling adds neither region ownership nor an NPC editing grant from lieutenant assignment.

## Alternatives rejected

- Editable ownership policy: it permits changing an invariant to impersonate the resource owner.
- A policy service for a few ownership relations: disproportionate to this boundary.
- Unnamed overrides at call sites: their breadth cannot be reviewed consistently.
- Generalizing document audience rules to every public entity: no accepted visibility policy supports it.

## Consequences

Ownership, capability, audience and application validity remain distinct. One declared authority surface replaces repeated call-site interpretations. The September amendment supersedes July's general bypass language for player-character mutations only. The November 7 amendment restores admin and platform-owner bypass for profile fields only.

## Enforced by

The [live-authority interface](/docs/interfaces/live-authority.md) records implemented checks and gaps. Character mutation parity and complete operation-declaration coverage are **not enforced** by the current read-only character API.

## Reopen triggers

- An accepted decision changes ownership, the scoped document family, or the player-character exception.
- Lieutenant assignment gains an editing authority rather than remaining an unresolved relation.
