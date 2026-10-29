import type {
  Blockquote,
  Link,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

type RedactedShape = {
  /** Bar length per hidden line (0 = blank line). */
  lengths: number[];
  /** Lines the server cut under its D45 cap (`> +N more lines`). */
  more: number;
  /** Last source line of the shape; later lines are ordinary content. */
  lastLine: number;
  /** Whether the first line after the shape is itself a quote line. */
  tailQuoted: boolean;
};

const BAR_LINE = /^[ \t]{0,3}>[ \t]?(█*)[ \t]*$/;
const MORE_LINE = /^[ \t]{0,3}>[ \t]?\+(\d+) more lines?[ \t]*$/;

/**
 * Shape of a server redaction (D45), read from the source lines after the
 * `[!redacted]` marker: bar lines (`> ████`), blank `>` lines and one optional
 * `> +N more lines` count. The first other line ends the shape, so content
 * Markdown folded into the quote (a quoted callout or a lazy line) is put back
 * and rendered normally instead of being drawn as bars.
 */
function redactedShape(node: Blockquote, source: string): RedactedShape {
  const start = node.position?.start;
  const end = node.position?.end;
  if (start?.offset === undefined || end?.offset === undefined)
    return { lengths: [], more: 0, lastLine: Number.POSITIVE_INFINITY, tailQuoted: false };
  const lines = source.slice(start.offset, end.offset).split('\n');
  const lengths: number[] = [];
  let more = 0;
  let index = 1;
  for (; index < lines.length; index += 1) {
    const bar = lines[index].match(BAR_LINE);
    if (bar) {
      lengths.push(bar[1].length);
      continue;
    }
    const count = lines[index].match(MORE_LINE);
    if (count) {
      more = Number(count[1]);
      index += 1;
    }
    break;
  }
  return {
    lengths,
    more,
    lastLine: start.line + index - 1,
    tailQuoted: index < lines.length && /^[ \t]{0,3}>/.test(lines[index]),
  };
}

/** Line breaks inside a node's text; gfm's find-and-replace nodes have no
 * source position, so lines are counted from content, not positions. */
function lineBreaks(node: Nodes): number {
  if (node.type === 'break') return 1;
  if ('value' in node) return node.value.split('\n').length - 1;
  if ('children' in node)
    return (node.children as Nodes[]).reduce((sum, child) => sum + lineBreaks(child), 0);
  return 0;
}

/** The phrasing content of `paragraph` that lies below `lastLine`. */
function paragraphBelow(paragraph: Paragraph, lastLine: number): Paragraph | null {
  let line = paragraph.position?.start.line ?? Number.POSITIVE_INFINITY;
  const kept: PhrasingContent[] = [];
  for (const child of paragraph.children) {
    const first = line;
    line += lineBreaks(child);
    if (first > lastLine) kept.push(child);
    else if (line > lastLine && child.type === 'text') {
      const value = child.value
        .split('\n')
        .slice(lastLine - first + 1)
        .join('\n');
      if (value) kept.push({ type: 'text', value });
    }
  }
  return kept.length ? { type: 'paragraph', children: kept } : null;
}

/** The quote's content after its redaction shape, as blocks to render normally. */
function contentAfterShape(node: Blockquote, lastLine: number): Blockquote['children'] {
  const blocks: Blockquote['children'] = [];
  for (const child of node.children) {
    const start = child.position?.start.line;
    const end = child.position?.end.line;
    if (start !== undefined && start > lastLine) blocks.push(child);
    else if (child.type === 'paragraph' && end !== undefined && end > lastLine) {
      const below = paragraphBelow(child, lastLine);
      if (below) blocks.push(below);
    }
  }
  return blocks;
}

function entityHref(token: string): string {
  const target = token.startsWith('[[')
    ? token.slice(2, -2).split('|')[0].trim()
    : token;
  if (/^Q-\d+$/.test(target)) return `/quests/${encodeURIComponent(target)}`;
  if (/^C-\d+$/.test(target)) return `/characters/${encodeURIComponent(target)}`;
  if (/^@[\w.-]*\w$/.test(target)) return `/dms/${encodeURIComponent(target)}`;
  return `/codex?q=${encodeURIComponent(target)}`;
}

/** Extend the parsed Markdown tree so code and link destinations remain literal. */
export function remarkContent() {
  return (tree: Root, file?: { value?: unknown }) => {
    visit(tree, (node, index, parent) => {
      if (
        node.type === 'link' ||
        node.type === 'linkReference' ||
        node.type === 'code' ||
        node.type === 'inlineCode'
      )
        return SKIP;
      if (node.type === 'blockquote') {
        const paragraph = node.children[0];
        const marker =
          paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
        if (paragraph?.type === 'paragraph' && marker?.type === 'text') {
          const source = typeof file?.value === 'string' ? file.value : '';
          const offset = paragraph.position?.start.offset;
          const firstLine =
            source && offset !== undefined
              ? source.slice(offset).split('\n')[0]
              : marker.value.split('\n')[0];
          const match = firstLine.match(
            /^\[![^\S\r\n]*(note|info|tip|warn|warning|dm(?::@[A-Za-z0-9_.-]+)?|redacted|spoiler)[^\S\r\n]*\](?:[ \t]+([^\n]*))?$/i,
          );
          if (match?.[1].toLowerCase() === 'redacted') {
            // The server already removed the hidden text; only its shape
            // remains, so the bars are presentation and never re-scope.
            const shape = redactedShape(node, source);
            const after = contentAfterShape(node, shape.lastLine);
            node.data = {
              hProperties: {
                calloutVariant: 'redacted',
                redactedLines: shape.lengths.join(' '),
                redactedMore: String(shape.more),
              },
            };
            node.children = [];
            if (after.length && parent && index !== undefined) {
              const restored: RootContent[] = shape.tailQuoted
                ? [{ type: 'blockquote', children: after }]
                : after;
              (parent.children as RootContent[]).splice(index + 1, 0, ...restored);
            }
            return SKIP;
          }
          if (match) {
            const [kind, handle] = match[1].split(':');
            const variant = kind
              .toLowerCase()
              .replace('warning', 'warn')
              .replace('info', 'note');
            const titles: Record<string, string> = {
              note: 'Note',
              tip: 'Tip',
              warn: 'Warning',
              dm: 'DM only',
              spoiler: 'Spoiler',
            };
            node.data = {
              hProperties: {
                calloutVariant: variant,
                calloutTitle:
                  match[2]?.trim() || (handle ? `For ${handle}` : titles[variant]),
              },
            };
            const below = paragraphBelow(paragraph, paragraph.position?.start.line ?? 1);
            if (below) node.children[0] = below;
            else node.children.shift();
          }
        }
      }
      if (node.type === 'paragraph' && node.children.length === 1) {
        const link = node.children[0];
        if (
          link.type === 'link' &&
          link.children.length === 1 &&
          link.children[0].type === 'text'
        ) {
          const label = link.children[0].value.match(/^(video|music):\s*(.+)$/i);
          if (label)
            node.data = {
              hName: 'figure',
              hProperties: {
                mediaRequest: label[1].toLowerCase(),
                mediaUrl: link.url,
                mediaLabel: label[2],
              },
            };
        }
      }
      if (node.type !== 'text' || index === undefined || !parent) return;
      const expression = /(\[\[[^\]\n]+\]\]|\bQ-\d+\b|\bC-\d+\b|(?<![\w.])@[\w.-]*\w)/g;
      const replacements: Array<Link | typeof node> = [];
      let offset = 0;
      for (const match of node.value.matchAll(expression)) {
        if (match.index > offset)
          replacements.push({
            type: 'text',
            value: node.value.slice(offset, match.index),
          });
        const token = match[0];
        const label = token.startsWith('[[')
          ? (
              token.slice(2, -2).split('|')[1] || token.slice(2, -2).split('|')[0]
            ).trim()
          : token;
        replacements.push({
          type: 'link',
          url: entityHref(token),
          children: [{ type: 'text', value: label }],
          data: { hProperties: { className: ['cr-link'] } },
        });
        offset = match.index + token.length;
      }
      if (offset) {
        if (offset < node.value.length)
          replacements.push({ type: 'text', value: node.value.slice(offset) });
        parent.children.splice(index, 1, ...replacements);
        return index + replacements.length;
      }
    });
  };
}
