# D45: Redaction Keeps Rough Size

**Status:** decided 2026-10-28
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [scoped-body](/docs/interfaces/scoped-body.md)

## Context

[scoped-body](/docs/interfaces/scoped-body.md) replaced every hidden span with the fixed `> [!redacted]` placeholder "without a secret-length hint". Readers could not tell a one-word aside from a page of DM notes. **Owner decision, 2026-10-28:** redacted text keeps its rough size, drawn like Discord spoiler bars, so readers see "this much was hidden". This supersedes the "without a secret-length hint" rule. It does not change [D22](/docs/decisions/D22-Renderers-Never-Know-The-Viewer.md): redaction still completes on the server, and the client never receives hidden text.

## Decision

Named pattern: **redaction with length bucketing**. The server replaces hidden values with same-shape filler (like a masked card number), rounding the length into coarse buckets.

`document.EffectiveBody` replaces each hidden span with:

1. the fixed line `> [!redacted]`;
2. one line per hidden text line: `> ` followed by U+2588 `█`, repeated for the line's length in runes, **rounded up to the next multiple of 20**;
3. `>` alone for a blank hidden line.

**What counts as a line:** take each source line of the span. Strip its leading quote prefix (whitespace and `>`). Remove each closed `[!…]` callout token, then trim. A line that held only marker tokens, such as the usual `> [!dm]` header, adds no bar. A marker line that also carries text (`> [!dm] Title`, or a bare `[!dm] hello`) counts the text beside the marker. The text-line count is exact, and marker-only lines add none. Only each line's length is bucketed.

**Caps (engineering ruling, 2026-10-28):** to bound amplification, a span shows at most 200 bars per line and at most 100 shape lines (bars or blanks). When lines are cut, one final plain line `> +N more lines` (`> +1 more line`) reports the rest. Renderers show that count under the bars. Each span stays near 60 KB at most. The whole projection also has a budget of 10,000 bar runes, which spans spend in document order. A line that the remaining budget cannot cover, and every line after it, joins the count. Once the budget is spent, each further hidden span is only `> [!redacted]` and its `> +N more lines` count, with no bars. Bars therefore stop growing with the body. What remains is the fixed placeholder text: a 128 KiB body of `[!dm] x` lines projects to about 3.9 times its input.

**Separator:** a placeholder ends in a quote line. When the next span starts with a non-blank line, the server ends the placeholder with a blank line. Otherwise a following quote (for example a public `> [!note]`) or a lazy line would join the redaction. Every consumer, Discord included, therefore sees where the redaction ends. Renderers treat only bar lines, blank `>` lines and the count line as shape. The first other line ends the shape and renders normally.

Generation happens on the server only. Renderers draw the bars from the server's shape and never derive one. Completeness, precedence, the outer gate and the author/admin raw bypass stay as they were.

Convergence: one projection (`redactedBlock`) produces the only shape. Discord, the agent index, search snippets and web cards all read that one output.

## Trade-off accepted

- **Leaks:** the number of hidden lines, blank-line placement and each line's length to within 20 runes. A reader can tell a short note from a long section.
- **Still protected:** the hidden bytes. Within one 20-rune bucket, short secrets look identical: a name, "yes" or "no", and a 19-rune phrase all become one 20-bar line.
- Authors who need to hide even the shape should keep the material in a separate document gated by the outer policy. Blocks remain narrow-only ([D3](/docs/decisions/D3-Audience-Policy-Model.md)).

## Alternatives rejected

| Alternative                     | Why not                                                   |
| ------------------------------- | --------------------------------------------------------- |
| Keep the fixed placeholder      | Owner reversed it: readers should see how much was hidden |
| Exact per-line length           | Leaks exact length of short secrets (names, yes/no)       |
| Client computes bars            | The client would need the hidden text; violates D22       |
| One bar sized to the total span | Loses the line structure the owner asked to show          |

## Consequences

### Surfaces

**Owner decision, 2026-10-28: "Bars everywhere."** Plain-text surfaces receive the same projected body, including the `[!redacted]` line and the bars. There is no plain-text variant. Known effects:

- **Discord quest posts** (`MemberBriefBody`) show the literal marker line and the `█` bars. The bars count toward the 2000-character limit and move the truncation point earlier.
- **QA agent index** (`qa/remote_source.py`): chunks and embeddings contain the bars. Each affected document re-indexes once, because its public body hash changes.
- **Card hooks, blurbs, search snippets and excerpts** show the marker and the bars inline, for example `[!redacted] ████…`.

### Renderer

- The web renderer draws a `redacted` callout as labelled solid bars. Screen readers hear a line-count summary instead of block characters.
- An authored literal `> [!redacted]` callout renders the same way. That is presentation, not access control.

## Enforced by

`redactedBlock`, `TestHiddenSpanKeepsRoughSizeOnly`, `TestSharedAudienceMarkerConformance` over `packages/contracts/fixtures/audience-markers.v1.json`, and the web `ContentRenderer` redacted-callout tests.

## Reopen triggers

- A hidden secret becomes distinguishable inside one 20-rune bucket.
- A renderer receives hidden text or computes bars itself.
- The owner asks for a coarser or finer bucket, or for no shape at all.
