import type { BodySpanAudit, BodySpanKind } from './types.js';

/**
 * User copy for the server's body audit (`auditBody`). Everything here reads
 * the spans the server reported; nothing re-reads marker grammar (D22, D46).
 */

/** Who the preview shows the body to. */
export type PreviewViewer =
  | { kind: 'player' }
  | { kind: 'dm' }
  | { kind: 'member'; handle: string };

/** The audit of one exact body text. */
export type BodyAudit = { body: string; spans: BodySpanAudit[] };

const BADGE_ICONS: Partial<Record<BodySpanKind, string>> = {
  DM: '🔒',
  MEMBER: '🔒',
  MALFORMED: '⛔',
};

/** The icon beside a block badge; decorative, the label carries the meaning. */
export function auditBadgeIcon(kind: BodySpanKind): string | null {
  return BADGE_ICONS[kind] ?? null;
}

/** What a block badge says about who can read the block. */
export function auditBadgeLabel(span: BodySpanAudit): string {
  switch (span.kind) {
    case 'DM':
      return 'DMs only';
    case 'MEMBER':
      return `Only @${span.handle ?? 'a member'}`;
    case 'SPOILER':
      return 'Spoiler — everyone sees it blurred';
    case 'MALFORMED':
      return 'Hidden from everyone (marker not recognised)';
    case 'LIST_NESTED':
      return LIST_NESTED_WARNING;
    default:
      return 'Not a hiding marker';
  }
}

/** The warning on a line whose callout looks like a marker but is not one. */
export const LOOKALIKE_WARNING = 'Not a hiding marker — players will see this.';

export const LIST_NESTED_WARNING = 'This marker does not protect the whole list item.';

/** Marker diagnostics the author must confirm before publishing. */
export function auditTypos(spans: readonly BodySpanAudit[]): BodySpanAudit[] {
  return spans.filter(
    (span) =>
      span.kind === 'LOOKALIKE' ||
      span.kind === 'MALFORMED' ||
      span.kind === 'LIST_NESTED',
  );
}

/** The line a span's marker sits on, falling back to its first line. */
export function auditLine(span: BodySpanAudit): number {
  return span.tokenLine ?? span.startLine;
}

const SHORT_TEXT = 60;

/** "Line 3: > [!dm@mortal] The mayor… — players will see this" for the publish check. */
export function typoSummary(span: BodySpanAudit, body: string): string {
  const line = auditLine(span);
  const source = (body.replace(/\r\n?/g, '\n').split('\n')[line - 1] ?? '').trim();
  const text =
    source.length > SHORT_TEXT ? `${source.slice(0, SHORT_TEXT - 1)}…` : source;
  const effect =
    span.kind === 'LIST_NESTED'
      ? 'does not protect the whole list item'
      : span.kind === 'LOOKALIKE'
        ? 'players will see this'
        : 'hidden from everyone';
  return `Line ${line}: ${text} — ${effect}`;
}

/**
 * Kinds an audit span hides from a fixed audience. A member's view is not
 * listed: whether a member reads DMs-only blocks depends on their roles, which
 * only the server knows.
 */
const HIDDEN_KINDS: Record<'player' | 'dm', readonly BodySpanKind[]> = {
  player: ['DM', 'MEMBER', 'MALFORMED'],
  dm: ['MEMBER', 'MALFORMED'],
};

function blocks(count: number): string {
  return `${count} ${count === 1 ? 'block' : 'blocks'}`;
}

export function viewerLabel(viewer: PreviewViewer): string {
  if (viewer.kind === 'member') return `@${viewer.handle}`;
  return viewer.kind === 'dm' ? 'DMs' : 'players';
}

/** The fixed first line of each placeholder the server writes for a hidden span (D45). */
const REDACTED_LINE = '> [!redacted]';

function redactedLines(text: string): number[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line, index) => (line.trim() === REDACTED_LINE ? [index + 1] : []));
}

/** `> [!redacted]` lines in the server's projected preview. */
export function countRedactedBlocks(previewBody: string): number {
  return redactedLines(previewBody).length;
}

/**
 * Lines the author typed as a literal `> [!redacted]` callout that the viewer
 * still reads, so they show in the preview unchanged. A line inside a span
 * hidden from the viewer became bars instead. Without an audit, every literal
 * line is taken as visible. For a member, DMs-only spans count as hidden: the
 * member's roles are the server's to know.
 */
function visibleLiteralLines(
  rawBody: string,
  viewer: PreviewViewer,
  spans: readonly BodySpanAudit[] | null,
): number {
  const hiding = (spans ?? []).filter((span) =>
    viewer.kind === 'member'
      ? span.kind === 'DM' ||
        span.kind === 'MALFORMED' ||
        (span.kind === 'MEMBER' && span.handle !== viewer.handle)
      : HIDDEN_KINDS[viewer.kind].includes(span.kind),
  );
  return redactedLines(rawBody).filter(
    (line) => !hiding.some((span) => line >= span.startLine && line <= span.endLine),
  ).length;
}

/**
 * "Hidden from players: 2 blocks (1 DMs only, 1 only @mortal)". The count is
 * the server's placeholders in the preview for this viewer, less any literal
 * `> [!redacted]` line the author wrote that the viewer still reads. The
 * per-kind breakdown comes from the audit only for players and DMs, and only
 * when it accounts for exactly that many blocks; a member's line shows the
 * total alone.
 */
export function previewHiddenSummary(
  previewBody: string,
  viewer: PreviewViewer,
  spans: readonly BodySpanAudit[] | null,
  rawBody = '',
): string {
  const who = viewerLabel(viewer);
  const total = Math.max(
    0,
    countRedactedBlocks(previewBody) - visibleLiteralLines(rawBody, viewer, spans),
  );
  if (total === 0) return `Nothing is hidden from ${who}`;
  const hidden =
    viewer.kind === 'member' || !spans
      ? []
      : spans.filter((span) => HIDDEN_KINDS[viewer.kind].includes(span.kind));
  if (hidden.length !== total) return `Hidden from ${who}: ${blocks(total)}`;
  const parts = new Map<string, number>();
  for (const span of hidden) {
    const part =
      span.kind === 'DM'
        ? 'DMs only'
        : span.kind === 'MEMBER'
          ? `only @${span.handle ?? 'a member'}`
          : 'hidden from everyone';
    parts.set(part, (parts.get(part) ?? 0) + 1);
  }
  const detail = [...parts].map(([part, count]) => `${count} ${part}`).join(', ');
  return `Hidden from ${who}: ${blocks(total)} (${detail})`;
}
