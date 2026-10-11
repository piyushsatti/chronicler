# D24: Media Is Linked Not Hosted

**Status:** decided 2026-07-28
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [media-linked](/docs/interfaces/media-linked.md)

## Context

Object storage was never built: no upload path, multipart off, no `Asset` writer. Owner ruled 2026-07-28: members paste links; the product hosts nothing. Quest announce reads `asset_links` for embed art but nothing populates it.

## Decision

**Link-only media.** Store pasted URLs as text; never bytes. All four `OBJ` requirements die with hosting.

- **The backend never HTTP-fetches a member-supplied URL** (SSRF). The only acceptable outbound fetch shape is allowlisted egress like `ddb_v2` (host list, redirect cap, body cap).
- **Remote media loads in the viewer's browser**, never proxied on the server.
- **No previews, thumbnails, oEmbed, or server `HEAD` for pasted URLs** — each is a fetch under another name.
- **Media inherits no audience model.** DM-only document images are protected by URL obscurity only; docs must say so wherever DM-only content is described ([D20](/docs/decisions/D20-One-Closed-Marker-Set.md)).
- **Embed vs plain link is decided client-side:** guess from URL string, render `<img>`, **`onerror` degrades to the visible link** — not a broken-image icon.
- **If anything ever writes `assets`, R4 is void** — decide media audience before a writer ships (announce already attaches images without text redaction).

Explicit tradeoff: hotlinking accepts link rot, content substitution on third-party hosts, and viewer IP disclosure to image hosts — priced as cheaper than hosting with signed URLs.

## Alternatives rejected

| Alternative                                  | Why not                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| Object storage / content-addressed store     | Owner scope cut; no working upload surface                |
| Signed URLs / capability URLs                | Requires hosting first; deferred until audience is needed |
| Server-side embed detection (`HEAD`, oEmbed) | Violates no-fetch rule; SSRF surface                      |
| Proxy media through the API                  | Reintroduces fetch + egress cost on a small box           |
| Per-viewer media audience without hosting    | Impossible; obscurity is the only layer today             |

## Consequences

`assets` / `asset_links` stay schema-only, read-only. Quest multimedia branch is dead until reopened under R5.

## Enforced by

Absence of upload handlers; ingest/announce paths must not dereference member URLs.

## Reopen triggers

- Anything gains the ability to write an `Asset` row.
- A link preview, thumbnail, or embed-metadata feature is requested.
- A pasted host serves executable content to viewers' browsers.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
