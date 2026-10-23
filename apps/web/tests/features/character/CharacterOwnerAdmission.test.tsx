import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import wire from '../../fixtures/wire/character/good.json';
import { Route, Routes } from 'react-router-dom';
import { CharacterPage } from '../../../src/features/character/pages/CharacterPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { signInCharacter, characterActor } from './characterAuth.js';

describe('Character owner admission', () => {
  it('does not offer mutations to an admin who owns another character', async () => {
    signInCharacter({
      ...characterActor,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      roles: ['admin'],
    });
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    await screen.findByRole('heading', { name: 'Lyra Storm' });
    expect(
      screen.queryByRole('heading', { name: 'Owner actions' }),
    ).not.toBeInTheDocument();
  });
  it('offers mutations when the live member UUID matches the immutable owner', async () => {
    signInCharacter();
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    expect(
      await screen.findByRole('heading', { name: 'Owner actions' }),
    ).toBeInTheDocument();
  });
  it('keeps the last-good mirror visible after an acknowledged provider failure and reload', async () => {
    signInCharacter();
    let reads = 0;
    server.use(
      graphql.query('Character', () => {
        reads++;
        return HttpResponse.json({
          data: {
            character: {
              ...wire,
              ddbMirror: {
                level: 3,
                xp: 900,
                classes: 'Wizard',
                species: 'Elf',
                background: 'Scholar',
                syncedAt: '2026-10-19T12:00:00Z',
              },
            },
          },
        });
      }),
      graphql.mutation('SyncCharacterDdb', () =>
        HttpResponse.json({
          data: {
            syncCharacterDdb: {
              succeeded: false,
              safeError: 'TIMEOUT',
              attemptedAt: '2026-10-20T12:00:00Z',
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
    expect(await screen.findByText(/Synced from D&D Beyond/)).toBeVisible();
    expect(screen.getByText(/Wizard · Elf/)).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Sync D&D Beyond' }));
    expect(await screen.findByText(/The provider timed out/)).toHaveTextContent(
      'last synchronized data were kept',
    );
    expect(await screen.findByText(/Synced from D&D Beyond/)).toBeVisible();
    expect(screen.getByText(/Wizard · Elf/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      wire.description,
    );
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });
});
