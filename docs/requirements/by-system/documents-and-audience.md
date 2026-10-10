# Requirements — A document's audience is decided twice, by two engines that disagree

System: [documents-and-audience.md](/docs/systems/documents-and-audience.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | A document's audience is decided by exactly one engine (`resolve_audience`), interpreted twice: in Python over a loaded row for a body read, compiled to SQL over a query for listing, search, and backlinks. | [`D28`](/docs/decisions/D28-One-Predicate-Over-Policy.md) is the specification that makes both interpreters answer the same rule, so a restricted document cannot show up as public everywhere except the one place someone actually opens it. |
| R2 | The marker grammar closes to exactly three markers, folds case, and denies on anything unrecognized. | `[!DM]`, the form Obsidian's own callout convention uses, is canonical `[!dm]`, not a fourth, unrecognized thing that ships public. |
| R3 | The renderer that turns markdown into DOM never learns who is looking: server-side redaction is the only place a document gets narrowed. | A renderer with an identity check is safe only by accident; a second classifier downstream can only re-decide a question the server already answered. |
| R4 | No document body is cached per viewer. The public projection is cached once; anything a specific viewer is additionally entitled to is spliced back in on every request, never stored. | Distilled from system Verdict. |
| R5 | Media is never uploaded. A pasted URL is stored as plain text; the viewer's own browser decides whether to render it as an image or a link, and falls back to a plain link if the image fails to load. Object storage itself was cut, and nothing protects a DM-only image beyond the obscurity of its URL. | Distilled from system Verdict. |
| R6 | Artifact, Event, Lore, NPC, and Faction now share one Codex document lifecycle, editor, safe renderer, search substrate, and recovery path. | Category gates the fields and domain invariants on that shared surface; it does not select a separate implementation. [`D32`](/apps/api/docs/decisions/D32-One-Codex-Lifecycle-Category-Gated.md) records the product ruling and the author/admin mutation boundary. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | The listing/search/backlinks retrofit onto the policy engine is genuinely in motion, not merely accepted in principle. | Nothing currently enforces it, and a restricted document keeps leaking its title, frontmatter, and full policy principal list through search and listing indefinitely. |
| A2 | The closed marker set, the shared editor field, and the server-only classifier land as one coordinated change, since the marker fix is only usable once every editor surface can tell an author their marker failed to parse. | The marker set could close on the backend while an author on a non-summary document kind still gets no signal that their own markup silently locked, reproducing the same silent-failure shape from a different code path. |
| A3 | A browser-side guess from the URL string (extension, known host pattern) correctly classifies most pasted media as images without the server ever dereferencing it. | Legitimate images render as plain links more often than intended, or the `onerror` fallback fires often enough that the feature reads as broken rather than gracefully degraded. |
| A4 | No code path gains the ability to write an `Asset` row before media audience is decided. | The structural asymmetry already present in quest announce goes live immediately: it already redacts brief text but applies no check to attached images, and today that is harmless only because nothing can create the image row. |
