import { describe, expect, it } from 'vitest';
import {
  cardExcerpt,
  markdownToPlainText,
  plainExcerpt,
} from '../../src/utils/markdownText.js';
import { parseChronicleList } from '../../src/features/chronicle/adapters/chronicleAdapter.js';
import { parseRulesList } from '../../src/features/rules/adapters/rulesAdapter.js';
import chronicleList from '../fixtures/wire/chronicle/list-good.json';
import { parseSearch } from '../../src/features/search/adapters/searchAdapter.js';
import { parseCodexDirectory } from '../../src/features/codex/adapters/codexAdapter.js';

describe('markdown previews', () => {
  it('strips tables, headings, emphasis, links and images', () => {
    expect(
      markdownToPlainText(
        '## Overview\n\n| Type | City and realm |\n|---|---|\n| Capital | **Lionmarch** |\n\n*The Lion-Marcher* sees [the gate](/codex/gate) ![map](/m.png)',
      ),
    ).toBe('Overview Type City and realm Capital Lionmarch The Lion-Marcher sees the gate map');
  });

  it('cleans markers a server-side cut left unpaired or mid-line', () => {
    expect(markdownToPlainText('*The Lion-Marcher of the north ## Origins **Bold')).toBe(
      'The Lion-Marcher of the north Origins Bold',
    );
    expect(markdownToPlainText('snake_case_name stays')).toBe('snake_case_name stays');
  });

  it('keeps escaped characters and entities as readers see them and drops footnotes', () => {
    expect(
      markdownToPlainText(
        'Kings &amp; Queens\n=================\n\nThe \\*first\\* light[^1] &mdash; 5&#37; &lt;rare&gt;\n\n[^1]: Told by the steward.\n[home]: https://example.com',
      ),
    ).toBe('Kings & Queens The *first* light — 5% <rare>');
    expect(markdownToPlainText('A \\| pipe and a \\[bracket\\]')).toBe('A | pipe and a [bracket]');
  });

  it('strips before truncating so the cut counts visible words', () => {
    const body = `| Type | City |\n|---|---|\n\n**Lead** ${'word '.repeat(60)}`;
    const excerpt = cardExcerpt(body, 40);
    expect(excerpt).not.toMatch(/[|#*]/);
    expect(excerpt?.startsWith('Lead word')).toBe(true);
    expect(excerpt?.endsWith('…')).toBe(true);
    expect(cardExcerpt(null, 40)).toBeNull();
  });

  it('codex cards and search hits show plain-text previews', () => {
    const codex = parseCodexDirectory(
      {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'lionmarch',
            title: 'Lionmarch',
            category: 'Locations',
            effectiveBody: '| Type | City and realm |\n|---|---|\n*The Lion-Marcher* rules.',
          },
        ],
        total: 1,
      },
      [],
    );
    expect(codex.ok && codex.data.items[0].excerpt).toBe('The Lion-Marcher rules.');
    const search = parseSearch({
      query: 'lion',
      documents: [
        {
          id: 'doc-1',
          kind: 'codex_entry',
          category: 'Locations',
          slug: 'lionmarch',
          title: 'Lionmarch',
          snippet: '*The Lion-Marcher… ## Origins | Type |',
          questShortCode: null,
        },
      ],
      documentTotal: 1,
      documentOrder: 'rank_desc_updated_at_desc_id_desc',
      members: [],
      memberTotal: 0,
      memberOrder: 'handle_asc_id_asc',
    });
    expect(search.ok && search.data.documents[0]).toMatchObject({
      snippet: 'The Lion-Marcher… Origins Type',
    });
  });

  it('ends card previews on a whole word with an ellipsis (L6)', () => {
    const text = 'Gives resistance to the cold and the dark of the deep roads';
    expect(plainExcerpt(text, 22)).toBe('Gives resistance to…');
    expect(plainExcerpt(text, 23)).toBe('Gives resistance to the…');
    expect(plainExcerpt('Ends with a comma, then more words', 18)).toBe('Ends with a comma…');
    expect(plainExcerpt(text, 200)).toBe(text);
  });

  it('cuts text without a usable space between characters, still with an ellipsis', () => {
    const url = 'https://example.com/a/very/long/path/that/never/breaks';
    expect(plainExcerpt(url, 20)).toBe('https://example.com/…');
    expect(plainExcerpt(`See ${url}`, 20)).toBe('See https://example…');
    expect(plainExcerpt('東の塔に眠る古き竜の伝説を語る', 6)).toBe('東の塔に眠る…');
    // Characters outside the BMP are counted whole and never split in half.
    expect(plainExcerpt('𠀋𠀋𠀋𠀋𠀋𠀋', 4)).toBe('𠀋𠀋𠀋𠀋…');
  });

  it('puts an authored summary before the body prose on every card type', () => {
    const body = '---\nsummary: "The *authored* line."\n---\nBody prose comes second.';
    expect(cardExcerpt(body, 120)).toBe('The authored line.');
    expect(cardExcerpt('Body prose only.', 120, 'Given summary')).toBe('Given summary');
    expect(cardExcerpt('Body prose only.', 120, '')).toBe('Body prose only.');
    const codex = parseCodexDirectory(
      { items: [{ id: '11111111-1111-4111-8111-111111111111', slug: 'a', title: 'A', category: 'Lore', effectiveBody: body }], total: 1 },
      [],
    );
    const rules = parseRulesList({
      items: [{ id: '22222222-2222-4222-8222-222222222222', slug: 'b', kind: 'rule', category: 'guide', title: 'B', effectiveBody: body, author: null }],
      total: 1,
    });
    const chronicles = parseChronicleList({
      items: [
        { ...chronicleList.items[0], frontmatter: { excerpt: 'The *authored* line.' }, effectiveBody: 'Body prose comes second.' },
        { ...chronicleList.items[0], frontmatter: {}, effectiveBody: body },
      ],
      total: 2,
    });
    expect(codex.ok && codex.data.items[0].excerpt).toBe('The authored line.');
    expect(rules.ok && rules.data.guides[0].excerpt).toBe('The authored line.');
    expect(chronicles.ok && chronicles.data.items.map((item) => item.excerpt)).toEqual([
      'The authored line.',
      'The authored line.',
    ]);
  });

  it('skips tables and headings in card previews, falling back to the summary (L6)', () => {
    const body =
      '## Lightfall\n\n| Type | City and realm |\n|---|---|\n| Ruler | The Lion |\n\nA [[coast|coastal]] city of *light*.';
    expect(cardExcerpt(body, 120)).toBe('A coastal city of light.');
    const tableOnly = '---\nsummary: "The city of light."\n---\n| Type | City |\n|---|---|\n| Ruler | Lion |';
    expect(cardExcerpt(tableOnly, 120)).toBe('The city of light.');
    expect(cardExcerpt('| A | B |\n|---|---|\n| 1 | 2 |', 120)).toBeNull();
  });

  it('gives Codex, Rules and Chronicles cards the same plain, whole-word preview (L6)', () => {
    const body = `| Type | City |\n|---|---|\n| Ruler | Lion |\n\nMy cousin **vinny** ${'walks the long road '.repeat(12)}`;
    const codex = parseCodexDirectory(
      { items: [{ id: '11111111-1111-4111-8111-111111111111', slug: 'a', title: 'A', category: 'Lore', effectiveBody: body }], total: 1 },
      [],
    );
    const rules = parseRulesList({
      items: [{ id: '22222222-2222-4222-8222-222222222222', slug: 'b', kind: 'rule', category: 'guide', title: 'B', effectiveBody: body, author: null }],
      total: 1,
    });
    const chronicles = parseChronicleList({
      items: [{ ...chronicleList.items[0], frontmatter: {}, effectiveBody: body }],
      total: 1,
    });
    const previews = [
      codex.ok ? codex.data.items[0].excerpt : 'invalid codex',
      rules.ok ? rules.data.guides[0].excerpt : 'invalid rules',
      chronicles.ok ? chronicles.data.items[0].excerpt : 'invalid chronicles',
    ];
    for (const preview of previews) {
      expect(preview).toMatch(/^My cousin vinny walks the long road .*\b(walks|the|long|road)…$/);
      expect(preview).not.toMatch(/[*|]|Type|Ruler/);
    }
  });
});
