import type { Link, Root } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

function entityHref(token: string): string {
  const target = token.startsWith('[[')
    ? token.slice(2, -2).split('|')[0].trim()
    : token;
  if (/^Q-\d+$/.test(target)) return `/quests/${encodeURIComponent(target)}`;
  if (/^C-\d+$/.test(target)) return `/characters/${encodeURIComponent(target)}`;
  if (/^@[\w.]+$/.test(target)) return `/dms/${encodeURIComponent(target)}`;
  return `/codex?q=${encodeURIComponent(target)}`;
}

/** Extend the parsed Markdown tree so code and link destinations remain literal. */
export function remarkContent() {
  return (tree: Root) => {
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
        if (marker?.type === 'text') {
          const match = marker.value.match(
            /^\[!(note|info|tip|warn|warning|dm)\](?:[ \t]+([^\n]*))?(?:\n|$)/i,
          );
          if (match) {
            const variant = match[1]
              .toLowerCase()
              .replace('warning', 'warn')
              .replace('info', 'note');
            const titles: Record<string, string> = {
              note: 'Note',
              tip: 'Tip',
              warn: 'Warning',
              dm: 'DM only',
            };
            node.data = {
              hProperties: {
                calloutVariant: variant,
                calloutTitle: match[2]?.trim() || titles[variant],
              },
            };
            marker.value = marker.value.slice(match[0].length);
            if (
              !marker.value &&
              paragraph?.type === 'paragraph' &&
              paragraph.children.length === 1
            )
              node.children.shift();
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
      const expression = /(\[\[[^\]\n]+\]\]|\bQ-\d+\b|\bC-\d+\b|(?<![\w.])@[\w.]+)/g;
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
