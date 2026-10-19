import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CharacterPage } from '../../../src/features/character/pages/CharacterPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

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
    expect(document.querySelector('[data-el="character.detail"]')).toHaveClass('ctx-rpg');
    expect(document.querySelector('[data-el="character.profile"]')).toBeTruthy();
    expect(screen.getByText('Child of the Weeping')).toBeInTheDocument();
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
  });

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
});
