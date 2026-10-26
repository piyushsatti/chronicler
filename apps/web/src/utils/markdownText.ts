/** Leading YAML front matter, as written by the editor. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/** Named and numeric HTML entities as the characters a reader sees. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Stand-ins for backslash-escaped punctuation, restored after the syntax is stripped. */
const ESCAPE_START = 0xe000;

/** Reduces Markdown to the words a reader would see, for one-line previews. */
export function markdownToPlainText(body: string): string {
  const stripped = body
    .replace(FRONTMATTER, '')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, ' ')
    // `\*` stays a literal asterisk instead of starting emphasis.
    .replace(/\\([!-/:-@[-`{-~])/g, (_m, char: string) =>
      String.fromCharCode(ESCAPE_START + char.charCodeAt(0)),
    )
    .replace(/<[^>\n]+>/g, ' ')
    // Reference definitions and footnote markers are not reader text.
    .replace(/^\s{0,3}\[[^\]\n]+\]:\s+\S.*$/gm, ' ')
    .replace(/\[\^[^\]\s]+\]/g, '')
    // Setext heading underlines (`===`); `---` lines go with thematic breaks below.
    .replace(/^\s{0,3}=+\s*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_m, target: string, label?: string) => (label ?? target).trim(),
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Snippets cut by the server can leave half a pair or a heading mark mid-line.
    .replace(/(^|\s)#{1,6}(?=\s|$)/g, '$1')
    .replace(/(^|\s)(?:\*{1,3}|_{1,3})(?=\S)/g, '$1')
    .replace(/(\S)(?:\*{1,3}|_{1,3})(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(
    stripped.replace(/[\ue000-\ue07f]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - ESCAPE_START),
    ),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text cut to at most `length` characters with an ellipsis when cut.
 * The cut falls between words ("resistance to…", never "resistance to th…")
 * when a space sits in the back half of the limit. Text without one (a long
 * URL, CJK) is cut between characters, never inside a surrogate pair. */
export function plainExcerpt(text: string, length: number): string | null {
  const chars = Array.from(text);
  if (chars.length <= length) return text || null;
  // Look one character past the limit: a space there means the cut already
  // falls between words.
  const cut = chars.slice(0, length + 1).join('');
  const lastSpace = cut.lastIndexOf(' ');
  const head = chars.slice(0, length).join('');
  const words = lastSpace >= head.length / 2 ? cut.slice(0, lastSpace) : head;
  return `${words.replace(/[\s,;:.\-–—]+$/u, '')}…`;
}

/** A one-line preview of a Markdown body: syntax stripped first, then cut. */
export function markdownExcerpt(
  body: string | null | undefined,
  length: number,
): string | null {
  return body ? plainExcerpt(markdownToPlainText(body), length) : null;
}

/** A leading YAML block's `summary:` line, unquoted. */
export function frontmatterSummary(body: string): string | null {
  const block = FRONTMATTER.exec(body)?.[1];
  const line = block?.split(/\r?\n/).find((entry) => /^summary\s*:/.test(entry));
  if (!line) return null;
  const value = line
    .replace(/^summary\s*:\s*/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  return value || null;
}

const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** A table cell pipe: not an escaped `\|` and not a `[[target|label]]` link. */
function hasCellPipe(line: string | undefined): boolean {
  return Boolean(
    line
      ?.replace(/\[\[[^\]]*\]\]/g, '')
      .replace(/\\\|/g, '')
      .includes('|'),
  );
}

/** The body's prose only: front matter, code fences, ATX headings and whole
 * tables (header, delimiter and rows) removed, so a card never shows
 * "Type City and realm Ruler…". */
export function markdownProse(body: string): string {
  const lines = body
    .replace(FRONTMATTER, '')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .split(/\r?\n/);
  const drop = new Set<number>();
  lines.forEach((line, index) => {
    if (!TABLE_DELIMITER.test(line)) return;
    // A bare `---` is a thematic break unless it sits under a pipe row.
    if (!hasCellPipe(line) && !hasCellPipe(lines[index - 1])) return;
    // The header row above the delimiter, then each pipe row below it. A
    // following line without pipes is kept: in a card it is prose.
    if (index > 0 && hasCellPipe(lines[index - 1])) drop.add(index - 1);
    drop.add(index);
    for (let row = index + 1; row < lines.length && hasCellPipe(lines[row]); row += 1) {
      drop.add(row);
    }
  });
  return lines
    .filter(
      (line, index) =>
        !drop.has(index) && !(/^\s*\|/.test(line) && hasCellPipe(line.trim().slice(1))),
    )
    .filter((line) => !/^\s{0,3}#{1,6}(?:\s|$)/.test(line))
    .join('\n');
}

/** Card preview, one rule for Codex, Rules and Chronicles: the authored
 * summary (`summary`, else the body's front matter `summary:`) when there is
 * one, else the body's prose (tables and headings skipped), cut with "…". */
export function cardExcerpt(
  body: string | null | undefined,
  length: number,
  summary?: string | null,
): string | null {
  const authored = summary ?? (body ? frontmatterSummary(body) : null);
  const text =
    (authored ? markdownToPlainText(authored) : '') ||
    (body ? markdownToPlainText(markdownProse(body)) : '');
  return plainExcerpt(text, length);
}
