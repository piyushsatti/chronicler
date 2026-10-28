/**
 * Toolbar "Hide" edits. Writes only the closed D20 audience markers
 * (`[!dm]`, `[!dm:@handle]`, `[!spoiler]`) as a blockquote header, so the
 * author never types marker syntax. The token scan mirrors the API's
 * classifier (apps/api/internal/document/body.go `classifyMarkerLine`); the
 * shared vectors in packages/contracts/fixtures/audience-markers.v1.json test
 * that both agree. The server stays the authority on who reads what.
 * Narrow exception to D22, recorded in docs/decisions/D46: this reader serves
 * the Hide action's writes only (stripping tokens, detecting an existing scope
 * to confirm), never badges, warnings, the publish guard or preview.
 */

export type HideMarker =
  { kind: 'dm' } | { kind: 'member'; handle: string } | { kind: 'spoiler' };

/** A block's audience as the server classifies it; `malformed` hides from everyone. */
export type HideScope = HideMarker | { kind: 'malformed' };

export type HideEdit = {
  next: string;
  selectionStart: number;
  selectionEnd: number;
  /** The hidden scope this edit replaces with a different one; null when none. */
  replaces: HideScope | null;
};

/** Placeholder written when there is nothing to hide yet; left selected. */
export const HIDE_PLACEHOLDER = 'Hidden text';

/** D20 marker handle charset (`markerHandlePattern` in the API). */
const MARKER_HANDLE = /^[A-Za-z0-9_.-]+$/;

/**
 * The exact handle as a marker can carry it, or null. A handle outside the
 * charset would make a malformed marker that hides the text from everyone.
 */
export function markerHandle(handle: string): string | null {
  const bare = handle.startsWith('@') ? handle.slice(1) : handle;
  return MARKER_HANDLE.test(bare) ? bare : null;
}

export function hideMarkerToken(marker: HideMarker): string {
  if (marker.kind === 'dm') return '[!dm]';
  if (marker.kind === 'spoiler') return '[!spoiler]';
  return `[!dm:@${marker.handle}]`;
}

type AudienceToken = {
  start: number;
  end: number;
  /** `lookalike` is ignored by the server (`[!dm@x]`) but meant as a marker. */
  kind: HideScope['kind'] | 'lookalike';
  handle?: string;
};

function classifyInner(inner: string): Omit<AudienceToken, 'start' | 'end'> | null {
  const folded = inner.toLowerCase();
  if (folded === 'dm') return { kind: 'dm' };
  if (folded === 'spoiler') return { kind: 'spoiler' };
  const colon = inner.indexOf(':');
  if (colon >= 0) {
    const prefix = inner.slice(0, colon);
    if (prefix.trim().toLowerCase() === 'dm' && prefix.toLowerCase() !== 'dm') {
      return { kind: 'malformed' };
    }
  }
  if (folded.startsWith('dm:')) {
    const handle = inner.slice('dm:'.length);
    return /^@[A-Za-z0-9_.-]+$/.test(handle)
      ? { kind: 'member', handle: handle.slice(1) }
      : { kind: 'malformed' };
  }
  if (folded.startsWith('audience')) return { kind: 'malformed' };
  if (/^dm\b/.test(folded)) return { kind: 'lookalike' };
  return null;
}

/** Audience tokens in one line, by the server's boundary: `[!` to the first `]`. */
export function audienceTokens(line: string): AudienceToken[] {
  const tokens: AudienceToken[] = [];
  let from = 0;
  for (;;) {
    const opener = line.indexOf('[!', from);
    if (opener < 0) break;
    const tail = line.slice(opener + 2);
    const close = tail.indexOf(']');
    if (close < 0) {
      const folded = tail.trim().toLowerCase();
      if (folded.startsWith('dm') || folded.startsWith('audience')) {
        const word = /^\[!\s*(?:dm|audience)\s*:?/i.exec(line.slice(opener));
        tokens.push({
          start: opener,
          end: opener + (word ? word[0].length : 2),
          kind: 'malformed',
        });
      }
      break;
    }
    const end = opener + 2 + close + 1;
    const kind = classifyInner(tail.slice(0, close).trim());
    if (kind) tokens.push({ start: opener, end, ...kind });
    from = end;
  }
  return tokens;
}

/**
 * The scope the server gives one span (a quote run or a bare line): malformed
 * outranks the first handle, then DM, then spoiler. Null when unscoped.
 */
export function classifyGroup(lines: readonly string[]): HideScope | null {
  let handle: string | undefined;
  let dm = false;
  let spoiler = false;
  for (const line of lines) {
    for (const token of audienceTokens(line)) {
      if (token.kind === 'malformed') return { kind: 'malformed' };
      if (token.kind === 'member' && handle === undefined) handle = token.handle;
      if (token.kind === 'dm') dm = true;
      if (token.kind === 'spoiler') spoiler = true;
    }
  }
  if (handle !== undefined) return { kind: 'member', handle };
  if (dm) return { kind: 'dm' };
  return spoiler ? { kind: 'spoiler' } : null;
}

/** Removes every audience token, keeping the text around it. */
function stripAudience(line: string): string {
  let out = line;
  for (let tokens = audienceTokens(out); tokens.length; tokens = audienceTokens(out)) {
    for (const token of [...tokens].reverse()) {
      const before = out.slice(0, token.start);
      const after = out.slice(token.end);
      out =
        /[ \t]$/.test(before) || before === ''
          ? before + after.replace(/^[ \t]+/, '')
          : before + after;
    }
  }
  return out;
}

/** Up to three spaces or tabs, then `>`: the API's `isBlockquote`. */
function isQuote(line: string): boolean {
  return /^[ \t]{0,3}>/.test(line);
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function quoteContent(line: string): string {
  return line.replace(/^[ \t]{0,3}(?:>[ \t]?)*/, '');
}

/** Fenced code blocks as [open, close] line ranges, closed or running to the end. */
function fences(lines: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (!open) continue;
    const fence = open[1];
    let j = i + 1;
    while (
      j < lines.length &&
      !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[j])
    ) {
      j++;
    }
    out.push([i, Math.min(j, lines.length - 1)]);
    i = j;
  }
  return out;
}

function sameScope(a: HideScope, b: HideMarker): boolean {
  if (a.kind === 'member' && b.kind === 'member') return a.handle === b.handle;
  return a.kind === b.kind;
}

/**
 * Wraps the selected lines, or with a collapsed selection the current
 * paragraph, quote or fenced block, as one blockquote headed by `marker`. A
 * marker heads the whole contiguous quote, so a selection that reaches into a
 * quote takes all of it; a fenced block is never split. Every other audience
 * token in the range is removed, so the header is the only one and the
 * server cannot classify the block differently. Quoted lines are not quoted
 * again; blank lines inside stay quoted (`>`), so the scope covers every
 * selected line; a blank line separates the quote from neighbouring text.
 * With nothing to wrap it inserts the placeholder, selected. Offsets are into
 * the LF-normalized value. Returns null for an unusable handle.
 */
export function hideLines(
  value: string,
  start: number,
  end: number,
  marker: HideMarker,
): HideEdit | null {
  if (marker.kind === 'member' && markerHandle(marker.handle) !== marker.handle) {
    return null;
  }
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const lineAt = (pos: number): number => {
    let idx = 0;
    while (idx + 1 < lines.length && starts[idx + 1] <= pos) idx++;
    return idx;
  };
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  let first = lineAt(from);
  let last = lineAt(to);
  if (to > from && last > first && to === starts[last]) last--;
  const codeBlocks = fences(lines);
  const inFence = (idx: number) => codeBlocks.some(([a, b]) => idx >= a && idx <= b);

  if (from === to && (!isBlank(lines[first]) || inFence(first))) {
    const inQuote = isQuote(lines[first]);
    const sameBlock = (line: string) => !isBlank(line) && isQuote(line) === inQuote;
    while (first > 0 && sameBlock(lines[first - 1])) first--;
    while (last + 1 < lines.length && sameBlock(lines[last + 1])) last++;
  }
  while (first < last && isBlank(lines[first]) && !inFence(first)) first++;
  while (last > first && isBlank(lines[last]) && !inFence(last)) last--;
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of codeBlocks) {
      if (a <= last && b >= first && (a < first || b > last)) {
        first = Math.min(first, a);
        last = Math.max(last, b);
        grew = true;
      }
    }
    if (isQuote(lines[first]) && first > 0 && isQuote(lines[first - 1])) {
      while (first > 0 && isQuote(lines[first - 1])) first--;
      grew = true;
    }
    if (isQuote(lines[last]) && last + 1 < lines.length && isQuote(lines[last + 1])) {
      while (last + 1 < lines.length && isQuote(lines[last + 1])) last++;
      grew = true;
    }
  }

  const range = lines.slice(first, last + 1);
  let replaces: HideScope | null = null;
  for (let i = 0; i < range.length && !replaces;) {
    let j = i + 1;
    if (isQuote(range[i])) while (j < range.length && isQuote(range[j])) j++;
    const scope = classifyGroup(range.slice(i, j));
    if (scope && scope.kind !== 'spoiler' && !sameScope(scope, marker))
      replaces = scope;
    i = j;
  }

  const body: string[] = [];
  for (const line of range) {
    const stripped = stripAudience(line);
    const content = isQuote(stripped) ? quoteContent(stripped) : stripped;
    if (isBlank(content) && !isBlank(quoteContent(line))) continue;
    body.push(isQuote(stripped) ? stripped : isBlank(stripped) ? '>' : `> ${stripped}`);
  }
  const placeholder = body.every((line) => isBlank(quoteContent(line)));
  const block = [
    `> ${hideMarkerToken(marker)}`,
    ...(placeholder ? [`> ${HIDE_PLACEHOLDER}`] : body),
  ];

  const before = lines.slice(0, first);
  const after = lines.slice(last + 1);
  const head = [
    ...before,
    ...(before.length && !isBlank(before.at(-1) ?? '') ? [''] : []),
  ];
  const tail = [...(after.length && !isBlank(after[0]) ? [''] : []), ...after];
  const next = [...head, ...block, ...tail].join('\n');
  const blockEnd = [...head, ...block].join('\n').length;
  return placeholder
    ? {
        next,
        selectionStart: blockEnd - HIDE_PLACEHOLDER.length,
        selectionEnd: blockEnd,
        replaces,
      }
    : { next, selectionStart: blockEnd, selectionEnd: blockEnd, replaces };
}
