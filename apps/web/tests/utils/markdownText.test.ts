import { describe, expect, it } from 'vitest';
import {
  markdownExcerpt,
  markdownToPlainText,
} from '../../src/utils/markdownText.js';
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

  it('strips before truncating so the cut counts visible words', () => {
    const body = `| Type | City |\n|---|---|\n${'word '.repeat(60)}`;
    const excerpt = markdownExcerpt(body, 40);
    expect(excerpt).not.toMatch(/[|#*]/);
    expect(excerpt?.startsWith('Type City word')).toBe(true);
    expect(excerpt?.endsWith('…')).toBe(true);
    expect(markdownExcerpt(null, 40)).toBeNull();
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
    expect(codex.ok && codex.data.items[0].excerpt).toBe(
      'Type City and realm The Lion-Marcher rules.',
    );
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
});
