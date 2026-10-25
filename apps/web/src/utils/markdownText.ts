/** Leading YAML front matter, as written by the editor. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Reduces Markdown to the words a reader would see, for one-line previews. */
export function markdownToPlainText(body: string): string {
  return body
    .replace(FRONTMATTER, '')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, ' ')
    .replace(/<[^>\n]+>/g, ' ')
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
