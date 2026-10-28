import { describe, expect, it } from 'vitest';
import {
  audienceTokens,
  classifyGroup,
  hideLines as hideLinesRaw,
  hideMarkerToken,
  markerHandle,
  type HideMarker,
} from '../../../src/features/editor/hideMarkers.js';
import fixture from '../../../../../packages/contracts/fixtures/audience-markers.v1.json';

const DM = { kind: 'dm' } as const;
const SPOILER = { kind: 'spoiler' } as const;
const MEMBER = { kind: 'member', handle: 'Exact-Handle' } as const;

/**
 * Every edit must leave exactly one audience token in the body, on the
 * header it wrote, so the server cannot scope the block any other way.
 */
function hideLines(value: string, start: number, end: number, marker: HideMarker) {
  const result = hideLinesRaw(value, start, end, marker);
  if (result) {
    const header = `> ${hideMarkerToken(marker)}`;
    const marked = result.next
      .split('\n')
      .filter((line) => audienceTokens(line).length > 0);
    expect(marked).toEqual([header]);
    expect(audienceTokens(header)).toHaveLength(1);
  }
  return result;
}

/** Offset of `needle` in `value`, so cases read as text rather than numbers. */
function at(value: string, needle: string, shift = 0): number {
  const index = value.indexOf(needle);
  if (index < 0) throw new Error(`missing ${needle}`);
  return index + shift;
}

describe('hide marker tokens', () => {
  it('writes only the closed D20 forms, with the colon and @ before a handle', () => {
    expect(hideMarkerToken(DM)).toBe('[!dm]');
    expect(hideMarkerToken(SPOILER)).toBe('[!spoiler]');
    expect(hideMarkerToken(MEMBER)).toBe('[!dm:@Exact-Handle]');
  });

  it('uses the exact handle and refuses one the marker charset cannot carry', () => {
    expect(markerHandle('Exact-Handle')).toBe('Exact-Handle');
    expect(markerHandle('@dot.handle')).toBe('dot.handle');
    expect(markerHandle('Space Handle')).toBeNull();
    expect(markerHandle('éxact')).toBeNull();
    expect(markerHandle('')).toBeNull();
    expect(
      hideLines('Secret', 0, 0, { kind: 'member', handle: 'Space Handle' }),
    ).toBeNull();
  });

  it('writes tokens the shared vectors classify as the intended audience', () => {
    const cases = fixture.cases as {
      name: string;
      body: string;
      spans: { text: string; policy: string[] | null; spoiler: boolean }[];
    }[];
    const vector = (name: string, token: string) => {
      const found = cases.find((c) => c.name === name);
      const span = found?.spans.find((s) => s.text.startsWith(`> ${token}\n`));
      return span && { policy: span.policy, spoiler: span.spoiler };
    };
    expect(vector("normalized '[!dm]'", hideMarkerToken(DM))).toEqual({
      policy: ['role:dm'],
      spoiler: false,
    });
    expect(vector('spoiler presentation only', hideMarkerToken(SPOILER))).toEqual({
      policy: null,
      spoiler: true,
    });
    expect(
      vector("exact handle '[!dm:@Exact-Handle]'", hideMarkerToken(MEMBER)),
    ).toEqual({ policy: ['member:@Exact-Handle'], spoiler: false });
  });
});

describe('audience classification', () => {
  it('agrees with every shared marker vector the server is tested against', () => {
    const cases = fixture.cases as {
      name: string;
      spans: { text: string; policy: string[] | null; spoiler: boolean }[];
    }[];
    for (const vector of cases) {
      for (const span of vector.spans) {
        const scope = classifyGroup(span.text.split('\n'));
        const policy =
          scope?.kind === 'malformed'
            ? []
            : scope?.kind === 'member'
              ? [`member:@${scope.handle}`]
              : scope?.kind === 'dm'
                ? ['role:dm']
                : null;
        expect(
          { policy, spoiler: scope?.kind === 'spoiler' },
          `${vector.name}: ${span.text}`,
        ).toEqual({ policy: span.policy, spoiler: span.spoiler });
      }
    }
  });
});

describe('hideLines', () => {
  it.each([
    ['DMs only', DM, '> [!dm]'],
    ['Only for a member', MEMBER, '> [!dm:@Exact-Handle]'],
    ['Spoiler', SPOILER, '> [!spoiler]'],
  ])(
    '%s on an empty line inserts the quote with "Hidden text" selected',
    (_, marker, header) => {
      const value = 'Intro\n\n\nOutro';
      const caret = 'Intro\n\n'.length;
      const result = hideLines(value, caret, caret, marker);
      expect(result?.next).toBe(`Intro\n\n${header}\n> Hidden text\n\nOutro`);
      expect(result?.next.slice(result.selectionStart, result.selectionEnd)).toBe(
        'Hidden text',
      );
    },
  );

  it('inserts the template into an empty document', () => {
    const result = hideLines('', 0, 0, DM);
    expect(result).toEqual({
      next: '> [!dm]\n> Hidden text',
      selectionStart: 10,
      selectionEnd: 21,
      replaces: null,
    });
  });

  it.each([
    ['DMs only', DM, '> [!dm]'],
    ['Only for a member', MEMBER, '> [!dm:@Exact-Handle]'],
    ['Spoiler', SPOILER, '> [!spoiler]'],
  ])('%s with no selection wraps the current paragraph', (_, marker, header) => {
    const value = 'Intro\n\nThe mayor\nleads the cult.\n\nOutro';
    const caret = at(value, 'mayor');
    expect(hideLines(value, caret, caret, marker)?.next).toBe(
      `Intro\n\n${header}\n> The mayor\n> leads the cult.\n\nOutro`,
    );
  });

  it.each([
    ['DMs only', DM, '> [!dm]'],
    ['Only for a member', MEMBER, '> [!dm:@Exact-Handle]'],
    ['Spoiler', SPOILER, '> [!spoiler]'],
  ])('%s on a single-line selection wraps only that line', (_, marker, header) => {
    const value = 'Intro\nThe mayor leads the cult.\nOutro';
    const result = hideLines(value, at(value, 'mayor'), at(value, 'leads'), marker);
    // Blank lines keep the hidden quote from absorbing its neighbours.
    expect(result?.next).toBe(
      `Intro\n\n${header}\n> The mayor leads the cult.\n\nOutro`,
    );
    expect(result?.selectionStart).toBe(result?.selectionEnd);
    expect(result?.next.slice(0, result.selectionStart)).toBe(
      `Intro\n\n${header}\n> The mayor leads the cult.`,
    );
  });

  it.each([
    ['DMs only', DM, '> [!dm]'],
    ['Only for a member', MEMBER, '> [!dm:@Exact-Handle]'],
    ['Spoiler', SPOILER, '> [!spoiler]'],
  ])('%s on a multi-line selection prefixes every line', (_, marker, header) => {
    const value = 'Intro\nLine one\n\nLine two\nOutro';
    const result = hideLines(value, at(value, 'one'), at(value, 'two', 3), marker);
    // The blank line stays inside the quote so the scope covers both lines.
    expect(result?.next).toBe(`Intro\n\n${header}\n> Line one\n>\n> Line two\n\nOutro`);
  });

  it('does not take the next line when the selection ends at its start', () => {
    const value = 'One\nTwo\nThree';
    expect(hideLines(value, 0, 'One\n'.length, DM)?.next).toBe(
      '> [!dm]\n> One\n\nTwo\nThree',
    );
  });

  it('replaces the marker of an already-quoted block instead of stacking or doubling', () => {
    const value = 'Intro\n\n> [!dm]\n> Secret\n> More\n\nOutro';
    const caret = at(value, 'Secret');
    expect(hideLines(value, caret, caret, SPOILER)?.next).toBe(
      'Intro\n\n> [!spoiler]\n> Secret\n> More\n\nOutro',
    );
  });

  it('replaces a mistyped marker such as [!dm@mortal] with the picked handle', () => {
    const value = '> [!dm@mortal]\n> Secret';
    const result = hideLines(value, 0, value.length, MEMBER);
    expect(result?.next).toBe('> [!dm:@Exact-Handle]\n> Secret');
  });

  it('quotes an ordinary quote once and keeps other callouts as content', () => {
    const value = '> [!note]\n> Visible\n>> nested';
    expect(hideLines(value, 3, 3, DM)?.next).toBe(
      '> [!dm]\n> [!note]\n> Visible\n>> nested',
    );
  });

  it('takes the whole quote when a selection reaches into it', () => {
    const value = 'Lead\n> one\n> two';
    expect(hideLines(value, 0, at(value, 'one'), DM)?.next).toBe(
      '> [!dm]\n> Lead\n> one\n> two',
    );
  });

  it('keeps a marker-only selection usable by inserting the placeholder', () => {
    const value = '> [!spoiler]';
    const result = hideLines(value, 0, 0, DM);
    expect(result?.next).toBe('> [!dm]\n> Hidden text');
    expect(result?.next.slice(result.selectionStart, result.selectionEnd)).toBe(
      'Hidden text',
    );
  });

  it.each([
    ['a quoted handle', '> [!dm:@alice] Secret', '> [!dm]\n> Secret'],
    ['a bare inline handle', 'Meet [!dm:@bob] here', '> [!dm]\n> Meet here'],
    ['a lookalike', 'Meet [!dm@bob] here', '> [!dm]\n> Meet here'],
    ['a malformed handle', '> [!dm: @x] Secret', '> [!dm]\n> Secret'],
    ['an unclosed marker', 'Secret [!dm:@Bad', '> [!dm]\n> Secret @Bad'],
    ['an audience attempt', '> [!audience role:player]\n> Secret', '> [!dm]\n> Secret'],
    ['a spoiler beside text', 'A [!spoiler] B [!DM] C', '> [!dm]\n> A B C'],
    [
      'nested quote markers',
      '> lead\n>> [!DM]\n>> Secret',
      '> [!dm]\n> lead\n>> Secret',
    ],
  ])('removes %s inside the range so the header alone decides', (_, value, next) => {
    expect(hideLines(value, 0, value.length, DM)?.next).toBe(next);
  });

  it.each([
    ['DM-only text made a spoiler', '> [!dm]\n> Secret', SPOILER, { kind: 'dm' }],
    [
      'member text made DM-only',
      '> [!dm:@alice]\n> Secret',
      DM,
      { kind: 'member', handle: 'alice' },
    ],
    [
      'an inline handle',
      'Meet [!dm:@bob] here',
      SPOILER,
      { kind: 'member', handle: 'bob' },
    ],
    ['malformed text', '> [!dm:]\n> Secret', DM, { kind: 'malformed' }],
  ])('reports the hidden scope it replaces: %s', (_, value, marker, replaces) => {
    expect(hideLines(value, 2, 2, marker)?.replaces).toEqual(replaces);
  });

  it.each([
    ['the same scope', '> [!dm]\n> Secret', DM],
    ['the same member', '> [!dm:@Exact-Handle]\n> Secret', MEMBER],
    ['a spoiler made hidden', '> [!spoiler]\n> Secret', DM],
    ['plain text', 'Secret', SPOILER],
  ])('reports nothing replaced for %s', (_, value, marker) => {
    expect(hideLines(value, 2, 2, marker)?.replaces).toBeNull();
  });

  it('keeps a fenced block with a blank line whole', () => {
    const value = 'Intro\n\n```\ncode one\n\ncode two\n```\n\nOutro';
    const inside = at(value, 'one');
    const blank = at(value, 'code two') - 1;
    const wrapped =
      'Intro\n\n> [!dm]\n> ```\n> code one\n>\n> code two\n> ```\n\nOutro';
    expect(hideLines(value, inside, inside, DM)?.next).toBe(wrapped);
    expect(hideLines(value, blank, blank, DM)?.next).toBe(wrapped);
    expect(hideLines(value, at(value, 'two'), at(value, 'two'), DM)?.next).toBe(
      wrapped,
    );
  });

  it('takes the whole fence when a selection reaches into it', () => {
    const value = 'Lead\n```\na\n\nb\n```';
    expect(hideLines(value, 0, at(value, '\na\n', 1), SPOILER)?.next).toBe(
      '> [!spoiler]\n> Lead\n> ```\n> a\n>\n> b\n> ```',
    );
  });
});
