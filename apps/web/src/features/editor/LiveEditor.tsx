import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../../components/primitives/Button.js';
import { useScrollEdges } from '../../components/primitives/useScrollEdges.js';
import type { EntityLinkIndex } from './types.js';
import { HideMenu, type HidePlan } from './HideMenu.js';
import { hideLines, type HideMarker } from './hideMarkers.js';
import type { BodySpanAudit } from './adapters/bodyAudit.js';
import {
  auditBadgeIcon,
  auditBadgeLabel,
  auditLine,
  LOOKALIKE_WARNING,
  type BodyAudit,
} from './bodyAuditCopy.js';
import styles from './editor.module.css';

/** Shown in an empty document; says what the editor does with typed text. */
const DEFAULT_PLACEHOLDER = 'Start writing. Type [[ to link a Codex entry.';

export type LiveEditorCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'link'
  | 'wikilink'
  | 'table'
  | 'diagram'
  | 'hr';

const COMMANDS: { id: LiveEditorCommand; title: string; path: string }[] = [
  {
    id: 'bold',
    title: 'Bold',
    path: 'M6 4h7a4 4 0 0 1 0 8H6m0-8v16h8a4 4 0 0 0 0-8H6',
  },
  { id: 'italic', title: 'Italic', path: 'M10 4h10M4 20h10M15 4 9 20' },
  {
    id: 'strike',
    title: 'Strikethrough',
    path: 'M17 5c-3-2-10-2-10 2 0 3 10 3 10 7 0 5-7 7-11 4M3 12h18',
  },
  { id: 'code', title: 'Inline code', path: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16' },
  {
    id: 'h2',
    title: 'Heading',
    path: 'M4 5v14M14 5v14M4 12h10m4 2c0-3 5-3 4 0l-4 5h4',
  },
  {
    id: 'h3',
    title: 'Subheading',
    path: 'M3 5v14M12 5v14M3 12h9m5-2h4l-3 4c6-1 5 7-1 5',
  },
  {
    id: 'bullet',
    title: 'Bulleted list',
    path: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  },
  {
    id: 'ordered',
    title: 'Numbered list',
    path: 'M10 6h11M10 12h11M10 18h11M3 3h2v6M3 9h4m-4 5c0-3 5-3 4 0l-4 5h4',
  },
  {
    id: 'quote',
    title: 'Quote',
    path: 'M10 7H4v6h6V7m0 6c0 4-3 5-5 5m15-11h-6v6h6V7m0 6c0 4-3 5-5 5',
  },
  {
    id: 'link',
    title: 'Link',
    path: 'm10 7 2-2a5 5 0 0 1 7 7l-2 2m-3 3-2 2a5 5 0 0 1-7-7l2-2m2 5 6-6',
  },
  {
    id: 'wikilink',
    title: 'Link to a Codex entry',
    path: 'M8 4H3v16h5m8-16h5v16h-5m-6-13h4v10h-4z',
  },
  { id: 'table', title: 'Table', path: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16' },
  {
    id: 'diagram',
    title: 'Diagram',
    path: 'M9 3h6v5H9zM3 16h6v5H3zm12 0h6v5h-6zM12 8v4M6 16v-4h12v4',
  },
  { id: 'hr', title: 'Divider', path: 'M3 12h18' },
];

export type LiveEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  toolbar?: boolean;
  toolbarStart?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
  placeholder?: string;
  compact?: boolean;
  entityIndex?: EntityLinkIndex;
  /** `blocks` = legacy per-line read/edit; `plain` = single textarea. */
  variant?: 'blocks' | 'plain';
  /**
   * The server's audit of the body (`auditBody`). The blocks editor badges the
   * blocks it reports and warns on marker lookalikes; it never reads markers
   * itself (D46). Ignored by the plain variant.
   */
  audit?: BodyAudit | null;
  /** Open this 1-based line for editing; a new `request` number asks again. */
  focusLine?: { line: number; request: number } | null;
};

/** Pure serialize/deserialize helpers (legacy LiveEditor contract). */
export function leSerialize(lines: string[]): string {
  return lines.join('\n');
}

export function leDeserialize(value: string): string[] {
  return (value || '').replace(/\r\n?/g, '\n').split('\n');
}

/** Map caret offset in LF-normalized string onto a parts entry + column. */
export function leLocateInParts(
  parts: string[],
  pos: number,
): { idx: number; col: number } {
  let consumed = 0;
  for (let idx = 0; idx < parts.length; idx++) {
    const partLen = parts[idx].length;
    if (pos <= consumed + partLen) return { idx, col: pos - consumed };
    consumed += partLen + 1;
  }
  const last = Math.max(parts.length - 1, 0);
  return { idx: last, col: parts[last]?.length ?? 0 };
}

/** Renumber a contiguous ordered-list run starting at `from` (legacy #4). */
export function leRenumberOrderedListRun(
  lines: string[],
  from: number,
  startNum: number,
): string[] {
  const out = lines.slice();
  let num = startNum;
  for (let idx = from; idx < out.length; idx++) {
    const mm = out[idx].match(/^(\s*)(\d+)(\.\s+)(.*)$/);
    if (!mm) break;
    out[idx] = `${mm[1]}${num}${mm[3]}${mm[4]}`;
    num++;
  }
  return out;
}

export function leKind(t: string): string {
  if (/^#\s/.test(t)) return 'h1';
  if (/^##\s/.test(t)) return 'h2';
  if (/^###\s/.test(t)) return 'h3';
  if (/^\s*([-*+])\s+/.test(t)) return 'li';
  if (/^\s*\d+\.\s+/.test(t)) return 'ol';
  if (/^\s*>\s?/.test(t)) return 'quote';
  if (/^\s*(---|\*\*\*|___)\s*$/.test(t)) return 'hr';
  if (t.trim() === '') return 'empty';
  return 'p';
}

export function leStrip(t: string, k: string): string {
  if (k === 'h1') return t.replace(/^#\s+/, '');
  if (k === 'h2') return t.replace(/^##\s+/, '');
  if (k === 'h3') return t.replace(/^###\s+/, '');
  if (k === 'li') return t.replace(/^\s*([-*+])\s+/, '');
  if (k === 'ol') return t.replace(/^\s*\d+\.\s+/, '');
  if (k === 'quote') return t.replace(/^\s*>\s?/, '');
  return t;
}

export function leTypeClass(t: string): string {
  switch (leKind(t)) {
    case 'h1':
      return 'type-display';
    case 'h2':
    case 'h3':
      return 'type-heading';
    case 'quote':
      return 'type-narrative';
    default:
      return 'type-body';
  }
}

export type LeRegion = { start: number; end: number; kind: string };

/** Detect fenced code/mermaid, tables, and callout quote blocks. */
export function leRegions(lines: string[]): LeRegion[] {
  const regs: LeRegion[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
      const lang = ((lines[i].match(/```+\s*([\w-]*)/) || [])[1] || '').toLowerCase();
      regs.push({
        start: i,
        end: Math.min(j, lines.length - 1),
        kind: lang === 'mermaid' ? 'mermaid' : 'code',
      });
      i = j + 1;
      continue;
    }
    if (
      /\|/.test(lines[i]) &&
      i + 1 < lines.length &&
      /\|/.test(lines[i + 1]) &&
      /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])
    ) {
      let j = i + 1;
      while (
        j + 1 < lines.length &&
        lines[j + 1].trim() !== '' &&
        /\|/.test(lines[j + 1])
      ) {
        j++;
      }
      regs.push({ start: i, end: j, kind: 'table' });
      i = j + 1;
      continue;
    }
    const cm = lines[i].match(/^\s*>\s*\[!(\w+)\]/);
    if (cm) {
      let j = i;
      while (j + 1 < lines.length && /^\s*>/.test(lines[j + 1])) j++;
      regs.push({ start: i, end: j, kind: 'callout' });
      i = j + 1;
      continue;
    }
    i++;
  }
  return regs;
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { next: string; cursor: number } {
  const selected = value.slice(start, end) || 'text';
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return { next, cursor: start + before.length + selected.length + after.length };
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): { next: string; cursor: number } {
  const lines = leDeserialize(value);
  let offset = 0;
  let startIdx = 0;
  let endIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i].length;
    if (start >= offset && start <= lineEnd + 1) startIdx = i;
    if (end >= offset && end <= lineEnd + 1) endIdx = i;
    offset = lineEnd + 1;
  }
  for (let i = startIdx; i <= endIdx; i++) {
    lines[i] = lines[i].startsWith(prefix)
      ? lines[i].slice(prefix.length)
      : prefix + lines[i].replace(/^(#{1,6}\s+|[-*+]\s+|>\s+|\d+\.\s+)/, '');
  }
  return { next: leSerialize(lines), cursor: start + prefix.length };
}

function insertAt(
  value: string,
  start: number,
  end: number,
  text: string,
): { next: string; cursor: number } {
  const next = value.slice(0, start) + text + value.slice(end);
  return { next, cursor: start + text.length };
}

function lineAtOffset(
  value: string,
  pos: number,
): { idx: number; lineStart: number; line: string } {
  const lines = leDeserialize(value);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i].length;
    if (pos >= offset && pos <= lineEnd) {
      return { idx: i, lineStart: offset, line: lines[i] };
    }
    offset = lineEnd + 1;
  }
  const last = Math.max(lines.length - 1, 0);
  return { idx: last, lineStart: offset, line: lines[last] ?? '' };
}

function indentLine(line: string, outdent: boolean): string {
  if (outdent) return line.replace(/^ {1,2}/, '');
  return `  ${line}`;
}

function wikiQueryAt(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const before = value.slice(0, caret);
  const m = before.match(/\[\[([^[\]]*)$/);
  if (!m) return null;
  return { query: m[1], start: caret - m[1].length - 2 };
}

const LEReadLine = memo(function LEReadLine({ text }: { text: string }) {
  const k = leKind(text);
  if (k === 'hr') return <hr className="le-hr" />;
  if (k === 'empty') return <div className="le-empty">&nbsp;</div>;
  const content = leStrip(text, k);
  if (k === 'h1') return <div className="le-h1 type-display">{content}</div>;
  if (k === 'h2') return <div className="le-h2 type-heading">{content}</div>;
  if (k === 'h3') return <div className="le-h3 type-heading">{content}</div>;
  if (k === 'li') {
    return (
      <div className="le-li type-body">
        <span className="le-bullet">•</span>
        <span>{content}</span>
      </div>
    );
  }
  if (k === 'ol') {
    return (
      <div className="le-li type-body">
        <span className="le-bullet le-num">
          {(text.match(/^\s*(\d+)\./) || [])[1]}.
        </span>
        <span>{content}</span>
      </div>
    );
  }
  if (k === 'quote') return <div className="le-quote type-narrative">{content}</div>;
  return <div className="le-p type-body">{content}</div>;
});

const LE_FOCUSABLE_SEL =
  '.le-read, .le-raw, .le-widget, .le-add, .le-ac, button, input, textarea, a';

const LE_TABLE_TEMPLATE =
  '| Column | Column |\n|---|---|\n| Cell | Cell |\n| Cell | Cell |';

function PlainLiveEditor({
  value,
  onChange,
  toolbar,
  toolbarStart,
  toolbarEnd,
  placeholder,
  compact,
  entityIndex,
}: Required<
  Pick<LiveEditorProps, 'value' | 'onChange' | 'toolbar' | 'placeholder' | 'compact'>
> &
  Pick<LiveEditorProps, 'toolbarStart' | 'toolbarEnd'> & {
    entityIndex: EntityLinkIndex;
  }): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useScrollEdges<HTMLDivElement>();
  const [caret, setCaret] = useState(0);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [showGutter, setShowGutter] = useState(false);

  const apply = useCallback(
    (result: { next: string; cursor: number }) => {
      onChange(result.next);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.cursor, result.cursor);
        setCaret(result.cursor);
      });
    },
    [onChange],
  );

  /** Selection kept when the Hide menu opens; focus then leaves the textarea. */
  const hideRange = useRef<{ start: number; end: number } | null>(null);
  const captureHideRange = (): void => {
    const el = ref.current;
    hideRange.current = {
      start: el?.selectionStart ?? value.length,
      end: el?.selectionEnd ?? value.length,
    };
  };
  /** Where the last Hide edit left the selection; the closing menu returns focus there. */
  const hideSelection = useRef<{ start: number; end: number } | null>(null);
  const restoreHideFocus = (): void => {
    const el = ref.current;
    const selection = hideSelection.current;
    if (!el || !selection) return;
    el.focus();
    el.setSelectionRange(selection.start, selection.end);
    setCaret(selection.end);
  };
  const planHide = (marker: HideMarker): HidePlan | null => {
    if (!hideRange.current) captureHideRange();
    const range = hideRange.current ?? { start: value.length, end: value.length };
    const result = hideLines(value, range.start, range.end, marker);
    if (!result) return null;
    return {
      replaces: result.replaces,
      commit: () => {
        hideRange.current = null;
        onChange(result.next);
        hideSelection.current = {
          start: result.selectionStart,
          end: result.selectionEnd,
        };
        requestAnimationFrame(restoreHideFocus);
      },
    };
  };

  const run = useCallback(
    (command: LiveEditorCommand) => {
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      let result: { next: string; cursor: number };
      switch (command) {
        case 'bold':
          result = wrapSelection(value, start, end, '**', '**');
          break;
        case 'italic':
          result = wrapSelection(value, start, end, '_', '_');
          break;
        case 'strike':
          result = wrapSelection(value, start, end, '~~', '~~');
          break;
        case 'code':
          result = wrapSelection(value, start, end, '`', '`');
          break;
        case 'link':
          result = wrapSelection(value, start, end, '[', '](url)');
          break;
        case 'wikilink':
          result = wrapSelection(value, start, end, '[[', ']]');
          break;
        case 'h2':
          result = prefixLines(value, start, end, '## ');
          break;
        case 'h3':
          result = prefixLines(value, start, end, '### ');
          break;
        case 'bullet':
          result = prefixLines(value, start, end, '- ');
          break;
        case 'ordered':
          result = prefixLines(value, start, end, '1. ');
          break;
        case 'quote':
          result = prefixLines(value, start, end, '> ');
          break;
        case 'table':
          result = insertAt(value, start, end, `\n${LE_TABLE_TEMPLATE}\n`);
          break;
        case 'diagram':
          result = insertAt(
            value,
            start,
            end,
            '\n```mermaid\nflowchart LR\n  A --> B\n```\n',
          );
          break;
        case 'hr':
          result = insertAt(value, start, end, '\n---\n');
          break;
        default:
          return;
      }
      apply(result);
    },
    [apply, value],
  );

  const wiki = wikiQueryAt(value, caret);
  const suggestions = useMemo(() => {
    if (!wiki || !entityIndex.length) return [];
    const q = wiki.query.toLowerCase();
    return entityIndex
      .filter(
        (e) => e.label.toLowerCase().includes(q) || e.id.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [entityIndex, wiki]);

  const pickWiki = (label: string): void => {
    if (!wiki) return;
    apply(insertAt(value, wiki.start, caret, `[[${label}]]`));
    setSuggestIdx(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSuggestIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const pick = suggestions[suggestIdx] ?? suggestions[0];
        if (pick) pickWiki(pick.label);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggestIdx(0);
        return;
      }
    }
    if (event.key === 'Tab') {
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const { idx, lineStart, line } = lineAtOffset(value, start);
      const kind = leKind(line);
      if (kind === 'li' || kind === 'ol' || kind === 'quote') {
        event.preventDefault();
        const nextLine = indentLine(line, event.shiftKey);
        const lines = leDeserialize(value);
        lines[idx] = nextLine;
        const next = leSerialize(lines);
        const delta = nextLine.length - line.length;
        apply({ next, cursor: Math.max(lineStart, start + delta) });
        return;
      }
      if (!event.shiftKey && start === end) {
        event.preventDefault();
        apply(insertAt(value, start, end, '  '));
      }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    const el = event.currentTarget;
    const start = el.selectionStart;
    const lines = leDeserialize(value);
    let offset = 0;
    let lineIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = offset + lines[i].length;
      if (start >= offset && start <= lineEnd) {
        lineIdx = i;
        break;
      }
      offset = lineEnd + 1;
    }
    const line = lines[lineIdx] ?? '';
    const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
    const ordered = line.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
    const quote = line.match(/^(\s*)>\s?(.*)$/);
    if (bullet) {
      event.preventDefault();
      if (!bullet[3].trim()) {
        lines[lineIdx] = '';
        apply({ next: leSerialize(lines), cursor: offset });
        return;
      }
      const insert = `${bullet[1]}${bullet[2]} `;
      const next = `${value.slice(0, start)}\n${insert}${value.slice(start)}`;
      apply({ next, cursor: start + 1 + insert.length });
      return;
    }
    if (ordered) {
      event.preventDefault();
      if (!ordered[4].trim()) {
        lines[lineIdx] = '';
        apply({ next: leSerialize(lines), cursor: offset });
        return;
      }
      const n = Number(ordered[2]) + 1;
      const insert = `${ordered[1]}${n}${ordered[3]}`;
      let next = `${value.slice(0, start)}\n${insert}${value.slice(start)}`;
      next = leSerialize(leRenumberOrderedListRun(leDeserialize(next), lineIdx + 1, n));
      apply({ next, cursor: start + 1 + insert.length });
      return;
    }
    if (quote) {
      event.preventDefault();
      if (!quote[2].trim()) {
        lines[lineIdx] = '';
        apply({ next: leSerialize(lines), cursor: offset });
        return;
      }
      const insert = `${quote[1]}> `;
      const next = `${value.slice(0, start)}\n${insert}${value.slice(start)}`;
      apply({ next, cursor: start + 1 + insert.length });
    }
  };

  const gutterLines = useMemo(
    () => leDeserialize(value).map((l) => leKind(l)),
    [value],
  );

  return (
    <div
      className="live-editor stack"
      data-component="LiveEditor"
      data-variant="plain"
      data-compact={compact ? '1' : undefined}
    >
      {toolbar ? (
        <div className={`row ${styles.toolbar}`} data-wrap="1">
          <div
            ref={toolbarRef}
            className={`row le-toolbar ${styles.formatting}`}
            role="toolbar"
            aria-label="Markdown formatting"
            data-wrap="1"
          >
            {toolbarStart}
            {COMMANDS.map((cmd) => (
              <Fragment key={cmd.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => run(cmd.id)}
                  aria-label={cmd.title}
                  title={cmd.title}
                >
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d={cmd.path} />
                  </svg>
                </Button>
                {cmd.id === 'ordered' ? (
                  <HideMenu
                    onOpen={captureHideRange}
                    plan={planHide}
                    restoreFocus={restoreHideFocus}
                  />
                ) : null}
              </Fragment>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={showGutter}
              onClick={() => setShowGutter((v) => !v)}
              aria-label="Toggle structure gutter"
            >
              Structure
            </Button>
          </div>
          {toolbarEnd}
        </div>
      ) : null}
      <div className="live-editor__surface stack">
        {showGutter ? (
          <div className="live-editor__gutter row" data-el="editor.gutter" aria-hidden>
            {gutterLines.map((kind, i) => (
              <span
                key={i}
                className="type-caption live-editor__gutter-chip"
                data-kind={kind}
              >
                {kind}
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          aria-label="Document body"
          className="field live-editor__input"
          rows={compact ? 6 : 16}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
            setSuggestIdx(0);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text/plain');
            if (!text || (!text.includes('\r') && !text.includes('\n'))) return;
            event.preventDefault();
            const el = event.currentTarget;
            apply(
              insertAt(
                value,
                el.selectionStart,
                el.selectionEnd,
                text.replace(/\r\n?/g, '\n'),
              ),
            );
          }}
          data-el="editor.body"
          spellCheck
        />
        {suggestions.length > 0 ? (
          <ul
            className="live-editor__wiki-suggest card stack"
            role="listbox"
            aria-label="Wikilink suggestions"
          >
            {suggestions.map((entry, i) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  role="option"
                  aria-selected={i === suggestIdx}
                  data-active={i === suggestIdx ? '1' : undefined}
                  onClick={() => pickWiki(entry.label)}
                >
                  {entry.label}
                  {entry.kind ? (
                    <span className="type-caption"> · {entry.kind}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function sizeBlockInput(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

/** Whether the audited marker token still sits exactly where the server saw it. */
function tokenInPlace(lines: readonly string[], span: BodySpanAudit): boolean {
  if (!span.token || span.tokenLine === null || span.tokenColumn === null) return false;
  const line = lines[span.tokenLine - 1];
  const at = span.tokenColumn - 1;
  return line !== undefined && line.slice(at, at + span.token.length) === span.token;
}

function BlocksLiveEditor({
  value,
  onChange,
  toolbar,
  toolbarStart,
  toolbarEnd,
  placeholder,
  compact,
  entityIndex,
  audit,
  focusLine,
}: Required<
  Pick<LiveEditorProps, 'value' | 'onChange' | 'toolbar' | 'placeholder' | 'compact'>
> &
  Pick<LiveEditorProps, 'toolbarStart' | 'toolbarEnd' | 'audit' | 'focusLine'> & {
    entityIndex: EntityLinkIndex;
  }): React.JSX.Element {
  const [lines, setLines] = useState(() => leDeserialize(value));
  const [active, setActive] = useState<number | null>(null);
  const [wikiAC, setWikiAC] = useState<{
    query: string;
    at: number;
    start: number;
  } | null>(null);
  const [acIdx, setAcIdx] = useState(0);
  const toolbarRef = useScrollEdges<HTMLDivElement>();
  const caretRef = useRef<{ idx: number; pos: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputObserver = useRef<ResizeObserver | null>(null);
  const inputResizeFrame = useRef<number | null>(null);
  const setInputRef = useCallback((input: HTMLTextAreaElement | null): void => {
    inputObserver.current?.disconnect();
    inputObserver.current = null;
    if (inputResizeFrame.current !== null) {
      cancelAnimationFrame(inputResizeFrame.current);
      inputResizeFrame.current = null;
    }
    inputRef.current = input;
    if (!input) return;
    let width: number | undefined;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (
        inputRef.current !== input ||
        inputObserver.current !== observer ||
        nextWidth === undefined ||
        nextWidth === width
      ) {
        return;
      }
      width = nextWidth;
      if (inputResizeFrame.current !== null) {
        cancelAnimationFrame(inputResizeFrame.current);
      }
      inputResizeFrame.current = requestAnimationFrame(() => {
        inputResizeFrame.current = null;
        if (inputRef.current === input && inputObserver.current === observer) {
          sizeBlockInput(input);
        }
      });
    });
    inputObserver.current = observer;
    observer.observe(input);
  }, []);
  const lastSent = useRef(value);
  const seenValue = useRef(value);
  const pendingCaret = useRef<number | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const lastActive = useRef(0);

  useEffect(() => {
    const joined = leSerialize(lines);
    if (joined !== lastSent.current) {
      lastSent.current = joined;
      onChange(joined);
    }
  }, [lines, onChange]);

  useEffect(() => {
    // A new value from the parent that this editor did not send (undo, redo)
    // replaces the lines even mid-edit; otherwise the next keystroke would
    // send the stale lines back over it. An unchanged prop never does, so a
    // parent still rendering the previous value cannot undo a local edit.
    const external = value !== seenValue.current;
    seenValue.current = value;
    if (active != null && !external) return;
    if (value !== lastSent.current) {
      lastSent.current = value;
      setLines(leDeserialize(value));
      setActive(null);
    }
  }, [value, active]);

  useEffect(() => {
    if (active != null && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const want =
        caretRef.current && caretRef.current.idx === active
          ? caretRef.current.pos
          : el.value.length;
      try {
        el.setSelectionRange(want, want);
      } catch {
        /* ignore */
      }
      caretRef.current = null;
      sizeBlockInput(el);
    }
  }, [active]);

  useEffect(() => {
    if (pendingCaret.current != null && inputRef.current) {
      const p = pendingCaret.current;
      pendingCaret.current = null;
      inputRef.current.focus();
      try {
        inputRef.current.setSelectionRange(p, p);
      } catch {
        /* ignore */
      }
      sizeBlockInput(inputRef.current);
    }
    if (pendingSelection.current != null && inputRef.current) {
      const { start, end } = pendingSelection.current;
      pendingSelection.current = null;
      inputRef.current.focus();
      try {
        inputRef.current.setSelectionRange(start, end);
      } catch {
        /* ignore */
      }
      sizeBlockInput(inputRef.current);
    }
  });

  useEffect(() => {
    if (active != null) lastActive.current = active;
  }, [active]);

  const enter = (i: number, pos?: number): void => {
    caretRef.current = { idx: i, pos: pos ?? (lines[i] || '').length };
    setActive(i);
  };

  const applyValue = (i: number, nv: string, caret?: number): void => {
    setLines((ls) => {
      const n = ls.slice();
      n[i] = nv;
      return n;
    });
    if (caret != null) pendingCaret.current = caret;
  };

  const ensureActive = (): boolean => {
    if (active == null) {
      setActive(lastActive.current || 0);
      return false;
    }
    return true;
  };

  const onInput = (i: number, e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const v = e.target.value;
    if (/\r|\n/.test(v)) {
      let parts = leDeserialize(v);
      const rawCaret = e.target.selectionStart;
      let caretPos = v.slice(0, rawCaret).replace(/\r\n?/g, '\n').length;
      if (parts.length > 1 && parts[parts.length - 1] === '') {
        const normalizedTotalLen = parts.join('\n').length;
        parts = parts.slice(0, -1);
        caretPos = Math.min(caretPos, normalizedTotalLen - 1);
      }
      const { idx: partIdx, col } = leLocateInParts(parts, caretPos);
      setLines((ls) => {
        const n = ls.slice();
        n.splice(i, 1, ...parts);
        return n;
      });
      const lastIdx = i + partIdx;
      caretRef.current = { idx: lastIdx, pos: col };
      setActive(lastIdx);
      setWikiAC(null);
      setAcIdx(0);
      return;
    }
    sizeBlockInput(e.target);
    // Report the keystroke to the parent in this same event, not from the
    // [lines] effect. From the effect, the parent's draft update ran as a
    // separate, interruptible render; on a slow device React then restored this
    // textarea to that render's older value and dropped the last character
    // (loop 3 L2, reproduced in Chromium with tests/e2e/editor-typing.spec.ts).
    const next = lines.slice();
    next[i] = v;
    setLines(next);
    const joined = leSerialize(next);
    if (joined !== lastSent.current) {
      lastSent.current = joined;
      onChange(joined);
    }
    const caret = e.target.selectionStart;
    const m = v.slice(0, caret).match(/\[\[([^[\]]*)$/);
    setWikiAC(m ? { query: m[1], at: caret, start: caret - m[1].length - 2 } : null);
    setAcIdx(0);
  };

  const acceptWiki = (name: string): void => {
    if (active == null || !wikiAC) return;
    const line = lines[active];
    const ins = `[[${name}]]`;
    const nv = line.slice(0, wikiAC.start) + ins + line.slice(wikiAC.at);
    applyValue(active, nv, wikiAC.start + ins.length);
    setWikiAC(null);
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.target as HTMLTextAreaElement;
    const pos = el.selectionStart;
    if (wikiAC) {
      const q = (wikiAC.query || '').toLowerCase();
      const list = entityIndex
        .filter(
          (entry) =>
            entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
        )
        .slice(0, 6);
      if (list.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAcIdx((n) => (n + 1) % list.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAcIdx((n) => (n - 1 + list.length) % list.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          acceptWiki(list[Math.min(acIdx, list.length - 1)].label);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setWikiAC(null);
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = el.value;
      const before = v.slice(0, pos);
      const after = v.slice(pos);
      let pre = '';
      const m = before.match(/^(\s*([-*+]|\d+\.)\s+)/);
      if (m && after === '' && before.trim() === m[1].trim()) {
        setLines((ls) => {
          const n = ls.slice();
          n[i] = '';
          return n;
        });
        return;
      }
      if (m) pre = m[1].replace(/\d+/, (s) => String(parseInt(s, 10) + 1));
      const quote = before.match(/^(\s*)>\s?/);
      if (!m && quote && after === '' && !before.replace(/^\s*>\s?/, '').trim()) {
        setLines((ls) => {
          const n = ls.slice();
          n[i] = '';
          return n;
        });
        return;
      }
      if (!m && quote) pre = `${quote[1]}> `;
      const insertedNum = pre.match(/(\d+)/);
      setLines((ls) => {
        let n = ls.slice();
        n.splice(i, 1, before, pre + after);
        if (insertedNum) {
          n = leRenumberOrderedListRun(n, i + 2, parseInt(insertedNum[1], 10) + 1);
        }
        return n;
      });
      enter(i + 1, pre.length);
      return;
    }
    if (e.key === 'Tab') {
      const kind = leKind(el.value);
      if (kind === 'li' || kind === 'ol' || kind === 'quote') {
        e.preventDefault();
        const nextLine = indentLine(el.value, e.shiftKey);
        applyValue(i, nextLine, Math.max(0, pos + (nextLine.length - el.value.length)));
      }
      return;
    }
    if (e.key === 'Backspace' && pos === 0 && el.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      const prevLen = lines[i - 1].length;
      setLines((ls) => {
        const n = ls.slice();
        n.splice(i - 1, 2, ls[i - 1] + ls[i]);
        return n;
      });
      enter(i - 1, prevLen);
      return;
    }
    if (e.key === 'ArrowUp' && i > 0 && !e.shiftKey) {
      e.preventDefault();
      enter(i - 1);
      return;
    }
    if (e.key === 'ArrowDown' && i < lines.length - 1 && !e.shiftKey) {
      e.preventDefault();
      enter(i + 1, 0);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (wikiAC) {
        setWikiAC(null);
        return;
      }
      el.blur();
      setActive(null);
    }
  };

  const focusRequest = focusLine?.request;
  useEffect(() => {
    if (focusRequest === undefined || !focusLine) return;
    const idx = Math.min(Math.max(focusLine.line - 1, 0), lines.length - 1);
    caretRef.current = { idx, pos: 0 };
    if (active === idx && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(0, 0);
    } else setActive(idx);
    // Only a new request moves the caret; later edits keep it where the author put it.
  }, [focusRequest]);

  // Audit spans are the server's (D46). They are shown only while the body still
  // has the audited line count, so a badge never lands on a shifted block.
  const auditId = useId();
  const spans = useMemo(
    () =>
      audit && leDeserialize(audit.body).length === lines.length ? audit.spans : [],
    [audit, lines.length],
  );
  const blockSpans = spans.filter((span) => span.kind !== 'LOOKALIKE');
  const lookalikes = spans.filter((span) => span.kind === 'LOOKALIKE');
  const badgeId = (span: BodySpanAudit): string => `${auditId}-span-${span.startLine}`;
  const warningId = (span: BodySpanAudit): string =>
    `${auditId}-lookalike-${auditLine(span)}-${span.tokenColumn ?? 0}`;
  /** Lines a..b (0-based, inclusive): the block span over them and the lookalikes on them. */
  const auditFor = (a: number, b: number) => {
    const covering = blockSpans.filter(
      (span) => span.startLine - 1 <= b && span.endLine - 1 >= a,
    );
    const warnings = lookalikes.filter((span) => {
      const line = auditLine(span) - 1;
      return line >= a && line <= b;
    });
    const ids = [...covering.map(badgeId), ...warnings.map(warningId)].join(' ');
    return {
      span: covering[0] as BodySpanAudit | undefined,
      warnings,
      // Only the line being typed takes focus, so only it carries the description.
      describedBy: ids || undefined,
    };
  };
  /** Replaces exactly the lookalike token with the server's suggestion: one edit, one undo step. */
  const fixLookalike = (span: BodySpanAudit): void => {
    if (!span.suggestion || !tokenInPlace(lines, span)) return;
    const idx = (span.tokenLine as number) - 1;
    const at = (span.tokenColumn as number) - 1;
    const line = lines[idx];
    const next = lines.slice();
    next[idx] =
      line.slice(0, at) + span.suggestion + line.slice(at + (span.token as string).length);
    setLines(next);
  };
  const badge = (span: BodySpanAudit): React.ReactNode => {
    const icon = auditBadgeIcon(span.kind);
    return (
      <p
        key="badge"
        id={badgeId(span)}
        className={`type-caption ${styles.auditBadge}`}
        data-kind={span.kind}
        data-el="editor.audit.badge"
      >
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{auditBadgeLabel(span)}</span>
      </p>
    );
  };
  const warnings = (found: BodySpanAudit[]): React.ReactNode[] =>
    found.map((span) => (
      <div
        key={`lookalike${auditLine(span)}-${span.tokenColumn ?? 0}`}
        className={`row ${styles.auditWarning}`}
        data-el="editor.audit.lookalike"
        data-gap="2"
        data-wrap="1"
      >
        <p id={warningId(span)} className="type-caption" role="status" aria-live="polite">
          <span aria-hidden="true">⚠️ </span>
          {LOOKALIKE_WARNING}
          {span.suggestion ? (
            <>
              {' '}
              Did you mean <code>{span.suggestion}</code>?
            </>
          ) : null}
        </p>
        {span.suggestion && tokenInPlace(lines, span) ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-describedby={warningId(span)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => fixLookalike(span)}
          >
            Fix
          </Button>
        ) : null}
      </div>
    ));

  const blankDoc = lines.length === 1 && lines[0].trim() === '';
  const regs = leRegions(lines);
  const regAt = (idx: number): LeRegion | undefined =>
    regs.find((r) => idx >= r.start && idx <= r.end);

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Portaled menus and dialogs (the Hide menu's member picker) bubble here
    // through React; they are not part of the document surface.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest(LE_FOCUSABLE_SEL)) return;
    e.preventDefault();
    ensureActive();
  };

  const cmdWrap = (b: string, a: string): void => {
    if (!ensureActive()) return;
    const el = inputRef.current;
    if (!el || active == null) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const v = el.value;
    const sel = v.slice(s, e);
    applyValue(
      active,
      v.slice(0, s) + b + sel + a + v.slice(e),
      sel ? s + b.length + sel.length + a.length : s + b.length,
    );
  };

  const cmdPrefix = (pfx: string): void => {
    if (!ensureActive() || active == null) return;
    const cur = lines[active];
    const nv = cur.startsWith(pfx)
      ? cur.slice(pfx.length)
      : pfx + cur.replace(/^(#{1,6}\s+|[-*+]\s+|>\s+|\d+\.\s+)/, '');
    applyValue(active, nv, nv.length);
  };

  const cmdBlock = (text: string): void => {
    const at = active != null ? active : lines.length - 1;
    const sep = lines[at] && lines[at].trim() !== '' ? 1 : 0;
    setLines((ls) => {
      const n = ls.slice();
      n.splice(at + 1, 0, ...(sep ? [''] : []), ...text.split('\n'), '');
      return n;
    });
    const focusLine = at + 1 + sep + 1;
    caretRef.current = { idx: focusLine, pos: 0 };
    setActive(focusLine);
  };

  /** Selection kept when the Hide menu opens, as offsets into the whole body. */
  const hideRange = useRef<{ start: number; end: number } | null>(null);
  const captureHideRange = (): void => {
    const idx = Math.min(active ?? lastActive.current, lines.length - 1);
    const lineStart = lines
      .slice(0, idx)
      .reduce((sum, line) => sum + line.length + 1, 0);
    const el = active != null ? inputRef.current : null;
    const lineEnd = lines[idx].length;
    hideRange.current = {
      start: lineStart + (el ? el.selectionStart : lineEnd),
      end: lineStart + (el ? el.selectionEnd : lineEnd),
    };
  };
  /** Where the last Hide edit left the selection in its line. */
  const hideSelection = useRef<{ start: number; end: number } | null>(null);
  const restoreHideFocus = (): void => {
    const el = inputRef.current;
    const selection = hideSelection.current;
    if (!el || !selection) return;
    el.focus();
    el.setSelectionRange(selection.start, selection.end);
  };
  const planHide = (marker: HideMarker): HidePlan | null => {
    if (!hideRange.current) captureHideRange();
    const range = hideRange.current;
    if (!range) return null;
    const result = hideLines(leSerialize(lines), range.start, range.end, marker);
    if (!result) return null;
    return {
      replaces: result.replaces,
      commit: () => {
        hideRange.current = null;
        const next = leDeserialize(result.next);
        const { idx, col } = leLocateInParts(next, result.selectionStart);
        const selection = {
          start: col,
          end: col + result.selectionEnd - result.selectionStart,
        };
        setLines(next);
        caretRef.current = { idx, pos: col };
        pendingSelection.current = selection;
        hideSelection.current = selection;
        setActive(idx);
      },
    };
  };

  const run = (command: LiveEditorCommand): void => {
    switch (command) {
      case 'bold':
        cmdWrap('**', '**');
        break;
      case 'italic':
        cmdWrap('_', '_');
        break;
      case 'strike':
        cmdWrap('~~', '~~');
        break;
      case 'code':
        cmdWrap('`', '`');
        break;
      case 'link':
        cmdWrap('[', '](url)');
        break;
      case 'wikilink': {
        if (!ensureActive()) break;
        const el = inputRef.current;
        if (!el || active == null) break;
        const s = el.selectionStart;
        const e = el.selectionEnd;
        const v = el.value;
        const token = '[[]]';
        applyValue(active, v.slice(0, s) + token + v.slice(e), s + 2);
        break;
      }
      case 'h2':
        cmdPrefix('## ');
        break;
      case 'h3':
        cmdPrefix('### ');
        break;
      case 'bullet':
        cmdPrefix('- ');
        break;
      case 'ordered':
        cmdPrefix('1. ');
        break;
      case 'quote':
        cmdPrefix('> ');
        break;
      case 'table':
        cmdBlock(LE_TABLE_TEMPLATE);
        break;
      case 'diagram':
        cmdBlock('```mermaid\nflowchart LR\n  A --> B\n```');
        break;
      case 'hr':
        cmdBlock('---');
        break;
      default:
        break;
    }
  };

  const inputFor = (i: number, mono: boolean): React.JSX.Element => (
    <textarea
      ref={setInputRef}
      aria-label="Document body"
      aria-describedby={auditFor(i, i).describedBy}
      className={`le-input ${mono ? 'le-mono type-code' : leTypeClass(lines[i])}`}
      rows={1}
      spellCheck={!mono}
      placeholder={!mono && blankDoc ? placeholder : ''}
      value={lines[i]}
      onChange={(e) => onInput(i, e)}
      onKeyDown={(e) => onKey(i, e)}
      data-el={i === active ? 'editor.body' : undefined}
    />
  );

  // A block the audit marks is one labelled group: its badge, then its lines,
  // so the badge is part of the block's own content for assistive technology.
  const rows: React.ReactNode[] = [];
  let group: { span: BodySpanAudit; nodes: React.ReactNode[] } | null = null;
  const flushGroup = (): void => {
    if (!group) return;
    const { span, nodes } = group;
    rows.push(
      <div
        key={`audit${span.startLine}`}
        role="group"
        aria-labelledby={badgeId(span)}
        className={styles.auditBlock}
        data-audit={span.kind}
        data-el="editor.audit.block"
      >
        {badge(span)}
        {nodes}
      </div>,
    );
    group = null;
  };
  const place = (span: BodySpanAudit | undefined, nodes: React.ReactNode[]): void => {
    if (group && group.span !== span) flushGroup();
    if (!span) {
      rows.push(...nodes);
      return;
    }
    if (!group) group = { span, nodes: [] };
    group.nodes.push(...nodes);
  };
  let i = 0;
  while (i < lines.length) {
    const r = regAt(i);
    const marks = r ? auditFor(r.start, r.end) : auditFor(i, i);
    const kind = marks.span?.kind;
    if (r) {
      const inside = active != null && active >= r.start && active <= r.end;
      let block: React.ReactNode;
      if (inside) {
        const inner: React.ReactNode[] = [];
        for (let k = r.start; k <= r.end; k++) {
          inner.push(
            <div key={k} className="le-row">
              {k === active ? (
                inputFor(k, true)
              ) : (
                <div
                  className="le-raw"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    enter(k);
                  }}
                >
                  {lines[k] || '\u00a0'}
                </div>
              )}
            </div>,
          );
        }
        block = (
          <div key={`reg${r.start}`} className="le-rawbox" data-audit={kind}>
            {inner}
          </div>
        );
      } else {
        const md = lines.slice(r.start, r.end + 1).join('\n');
        block = (
          <div
            key={`reg${r.start}`}
            className="le-widget"
            data-audit={kind}
            onMouseDown={(e) => {
              e.preventDefault();
              enter(r.kind === 'callout' ? r.start : r.start + 1);
            }}
          >
            <span className="le-chip">
              {r.kind === 'mermaid'
                ? 'diagram · click to edit'
                : `${r.kind} · click to edit`}
            </span>
            <pre className={`type-caption ${styles.widgetSource}`}>{md}</pre>
          </div>
        );
      }
      place(marks.span, [block, ...warnings(marks.warnings)]);
      i = r.end + 1;
    } else {
      const idx = i;
      place(marks.span, [
        <div
          key={idx}
          className={`le-row ${idx === active ? 'le-active' : ''}`}
          data-audit={kind}
        >
          {idx === active ? (
            inputFor(idx, false)
          ) : (
            <div
              className="le-read"
              onMouseDown={(e) => {
                e.preventDefault();
                enter(idx);
              }}
            >
              <LEReadLine text={lines[idx]} />
            </div>
          )}
        </div>,
        ...warnings(marks.warnings),
      ]);
      i++;
    }
  }
  flushGroup();

  const wikiList = useMemo(() => {
    if (!wikiAC) return [];
    const q = (wikiAC.query || '').toLowerCase();
    return entityIndex
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [entityIndex, wikiAC]);

  return (
    <div
      className="live-editor stack"
      data-component="LiveEditor"
      data-variant="blocks"
      data-compact={compact ? '1' : undefined}
      onMouseDown={handleContainerMouseDown}
    >
      {toolbar ? (
        <div className={`row ${styles.toolbar}`} data-wrap="1">
          <div
            ref={toolbarRef}
            className={`row le-toolbar ${styles.formatting}`}
            role="toolbar"
            aria-label="Markdown formatting"
            data-wrap="1"
          >
            {toolbarStart}
            {COMMANDS.map((cmd) => (
              <Fragment key={cmd.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(cmd.id)}
                  aria-label={cmd.title}
                  title={cmd.title}
                >
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d={cmd.path} />
                  </svg>
                </Button>
                {cmd.id === 'ordered' ? (
                  <HideMenu
                    onOpen={captureHideRange}
                    plan={planHide}
                    restoreFocus={restoreHideFocus}
                  />
                ) : null}
              </Fragment>
            ))}
          </div>
          {toolbarEnd}
        </div>
      ) : null}
      <div className={`le-doc${compact ? ' le-doc-compact' : ''}`}>
        {rows}
        <div
          className="le-add"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blankDoc) {
              enter(0, 0);
            } else {
              setLines((ls) => {
                const n = ls.slice();
                n.push('');
                return n;
              });
              enter(lines.length, 0);
            }
          }}
        >
          {blankDoc ? placeholder || DEFAULT_PLACEHOLDER : 'Add a paragraph'}
        </div>
      </div>
      {wikiAC && active != null && wikiList.length > 0 ? (
        <ul
          className="le-ac live-editor__wiki-suggest card stack"
          role="listbox"
          aria-label="Wikilink suggestions"
        >
          {wikiList.map((entry, wi) => (
            <li key={entry.id}>
              <button
                type="button"
                className="btn btn--ghost le-ac-item"
                role="option"
                aria-selected={wi === acIdx}
                data-active={wi === acIdx ? '1' : undefined}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  acceptWiki(entry.label);
                }}
              >
                {entry.label}
                {entry.kind ? (
                  <span className="type-caption"> · {entry.kind}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LiveEditor({
  value,
  onChange,
  toolbar = true,
  toolbarStart,
  toolbarEnd,
  placeholder = DEFAULT_PLACEHOLDER,
  compact = false,
  entityIndex = [],
  variant = 'blocks',
  audit = null,
  focusLine = null,
}: LiveEditorProps): React.JSX.Element {
  if (variant === 'plain') {
    return (
      <PlainLiveEditor
        value={value}
        onChange={onChange}
        toolbar={toolbar}
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        placeholder={placeholder}
        compact={compact}
        entityIndex={entityIndex}
      />
    );
  }
  return (
    <BlocksLiveEditor
      value={value}
      onChange={onChange}
      toolbar={toolbar}
      toolbarStart={toolbarStart}
      toolbarEnd={toolbarEnd}
      placeholder={placeholder}
      compact={compact}
      entityIndex={entityIndex}
      audit={audit}
      focusLine={focusLine}
    />
  );
}
