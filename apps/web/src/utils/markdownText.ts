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

/** Plain text cut to `length` characters at a word boundary, with an ellipsis when cut. */
export function plainExcerpt(text: string, length: number): string | null {
  if (text.length <= length) return text || null;
  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > length / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A one-line preview of a Markdown body: syntax stripped first, then cut. */
export function markdownExcerpt(
  body: string | null | undefined,
  length: number,
): string | null {
  return body ? plainExcerpt(markdownToPlainText(body), length) : null;
}
