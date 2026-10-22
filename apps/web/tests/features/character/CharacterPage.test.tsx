import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CharacterPage } from '../../../src/features/character/pages/CharacterPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';

function renderCharacter() {
  return renderWithProviders(
    <Routes>
      <Route path="/characters/:code" element={<CharacterPage />} />
    </Routes>,
    { route: '/characters/C-101' },
  );
}

describe('CharacterPage', () => {
  it('renders ready profile hero, narrative, and tab labels against L1 adapters', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lyra Storm' }),
    ).toBeInTheDocument();
    expect(screen.getByText('C-101')).toBeInTheDocument();
    expect(document.querySelector('[data-el="character.detail"]')).toHaveClass(
      'ctx-rpg',
    );
    expect(document.querySelector('[data-el="character.profile"]')).toBeTruthy();
    expect(await screen.findByText('Child of the Weeping')).toBeInTheDocument();
    expect(screen.getByText('Born under the Tree of Light.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Background')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('A wanderer of Lightfall.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'D&D Beyond' })).toHaveAttribute(
      'href',
      'https://www.dndbeyond.com/characters/101',
    );
    expect(screen.getByRole('tab', { name: 'Progression' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Quest history' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summaries' })).toBeInTheDocument();
    expect(await screen.findByText('+100 PCXP')).toBeInTheDocument();
  });

  it('lists quest history by quest title, linked to the quest, not by the character name', async () => {
    renderCharacter();
    await screen.findByRole('heading', { level: 1, name: 'Lyra Storm' });
    fireEvent.click(screen.getByRole('tab', { name: 'Quest history' }));
    const quest = await screen.findByRole('link', { name: 'The Salt Stair' });
    expect(quest).toHaveAttribute('href', '/quests/Q-7');
    const panel = document.querySelector('[data-el="character.historyReady"]');
    expect(panel).not.toHaveTextContent('Lyra Storm');
    expect(panel).toHaveTextContent('03 Jan 2026');
  });

  it('tolerates missing ddbUrl without inventing a link', async () => {
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: {
            character: {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              shortCode: 'C-101',
              name: 'Lyra Storm',
              status: 'active',
              ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              verificationStatus: 'approved',
              backstoryId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              regionId: null,
              description: 'A wanderer of Lightfall.',
              ddbUrl: null,
              displayIcon: null,
              updatedAt: '2026-10-01T12:00:00Z',
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lyra Storm' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No D&D Beyond link on file.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'D&D Beyond' })).not.toBeInTheDocument();
    // The description reads in the same prose style as the backstory lore.
    const description = screen.getByText('A wanderer of Lightfall.');
    expect(description.closest('.cr-prose')).not.toBeNull();
    expect(description).not.toHaveClass('type-narrative');
  });

  it('renders backstory lore as Markdown and finds it with one region-filtered read', async () => {
    const reads: unknown[] = [];
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: {
            character: {
              ...character,
              regionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              backgroundText: 'Retired free text',
            },
          },
        }),
      ),
      graphql.query('CharacterBackstory', ({ variables }) => {
        reads.push(variables);
        return HttpResponse.json({
          data: {
            backstories: {
              items: [
                {
                  id: character.backstoryId,
                  name: 'Child of the Weeping',
                  lore: 'Born **under** the Tree.\n\n- First root\n- Second root',
                },
              ],
              total: 1,
            },
          },
        });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByText('Child of the Weeping')).toBeInTheDocument();
    expect(screen.getByText('under').tagName).toBe('STRONG');
    expect(screen.getByText('First root').tagName).toBe('LI');
    expect(screen.getByText('Second root')).toBeInTheDocument();
    expect(screen.queryByText('Retired free text')).not.toBeInTheDocument();
    expect(reads).toEqual([
      {
        filters: { regionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
        limit: 100,
        offset: 0,
      },
    ]);
  });

  it('falls back to the full list when the backstory is from another region', async () => {
    const reads: unknown[] = [];
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: {
            character: {
              ...character,
              regionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            },
          },
        }),
      ),
      graphql.query('CharacterBackstory', ({ variables }) => {
        reads.push(variables.filters);
        const items = variables.filters
          ? []
          : [{ id: character.backstoryId, name: 'Far origin', lore: '' }];
        return HttpResponse.json({
          data: { backstories: { items, total: items.length } },
        });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByText('Far origin')).toBeInTheDocument();
    expect(reads).toEqual([{ regionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, null]);
  });

  it('shows a designed empty line when no backstory was chosen', async () => {
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: { character: { ...character, backstoryId: null } },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByText('No backstory chosen yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Backstory' })).toBeInTheDocument();
  });

  it('says the backstory is no longer listed only after the whole list is read', async () => {
    const offsets: unknown[] = [];
    server.use(
      graphql.query('CharacterBackstory', ({ variables }) => {
        offsets.push([variables.filters, variables.offset]);
        const items =
          variables.offset === 0 ? [{ id: 'other', name: 'Other', lore: '' }] : [];
        return HttpResponse.json({ data: { backstories: { items, total: 150 } } });
      }),
    );
    renderCharacter();
    expect(
      await screen.findByText('This backstory is no longer listed.'),
    ).toBeInTheDocument();
    expect(offsets).toEqual([
      [null, 0],
      [null, 100],
    ]);
  });

  it.each<[string, Record<string, unknown>]>([
    [
      'a transport failure',
      { errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }] },
    ],
    ['an unreadable reply', { data: { backstories: { items: [{ id: 1 }] } } }],
  ])(
    'shows %s in the backstory section and keeps the page',
    async (_label, failure) => {
      let calls = 0;
      const recovered = {
        data: {
          backstories: {
            items: [{ id: character.backstoryId, name: 'Recovered origin', lore: '' }],
            total: 1,
          },
        },
      };
      server.use(
        graphql.query('CharacterBackstory', () => {
          calls++;
          return HttpResponse.json(calls === 1 ? failure : recovered);
        }),
      );
      renderCharacter();
      const retry = await screen.findByRole('button', { name: 'Try again' });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Lyra Storm' }),
      ).toBeVisible();
      expect(screen.queryByText('This backstory is no longer listed.')).toBeNull();
      // An inline state inside the section, not a page-level card.
      expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull();
      fireEvent.click(retry);
      expect(await screen.findByText('Recovered origin')).toBeInTheDocument();
    },
  );

  it('shows empty roster state when character is missing', async () => {
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({ data: { character: null } }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-404' },
    );
    expect(
      await screen.findByText('That character is not on the roster.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Progression' })).not.toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
  it('shows the portrait in the header and falls back to the initials token on error', async () => {
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: {
            character: { ...character, imageUrl: 'https://example.com/lyra.png' },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    const portrait = await screen.findByRole('img', { name: 'Portrait of Lyra Storm' });
    expect(portrait).toHaveAttribute('src', 'https://example.com/lyra.png');
    expect(document.querySelector('[data-el="character.token"]')).toBeNull();
    fireEvent.error(portrait);
    expect(
      screen.queryByRole('img', { name: 'Portrait of Lyra Storm' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-el="character.token"]')).toHaveTextContent(
      'L',
    );
  });

  it('keeps the initials token when there is no image or it is not https', async () => {
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({
          data: { character: { ...character, imageUrl: 'http://example.com/a.png' } },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    await screen.findByRole('heading', { level: 1, name: 'Lyra Storm' });
    expect(screen.queryByRole('img', { name: /Portrait of/ })).not.toBeInTheDocument();
    expect(document.querySelector('[data-el="character.token"]')).toBeTruthy();
  });
});
