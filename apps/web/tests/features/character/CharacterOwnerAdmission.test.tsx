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
    expect(screen.queryByRole('tab', { name: 'Edit' })).not.toBeInTheDocument();
  });
  it('offers mutations when the live member UUID matches the immutable owner', async () => {
    signInCharacter();
    renderWithProviders(
      <Routes>
        <Route path="/characters/:code" element={<CharacterPage />} />
      </Routes>,
      { route: '/characters/C-101' },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { name: 'Edit character' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Retire character' })).toBeInTheDocument();
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
    expect(await screen.findByText(/D&D Beyond last synced/)).toBeVisible();
    expect(screen.getByText('Class and level').nextElementSibling).toHaveTextContent('Wizard');
    expect(screen.getByText('Species').nextElementSibling).toHaveTextContent('Elf');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(wire.description);
    await user.click(await screen.findByRole('button', { name: 'Sync D&D Beyond' }));
    expect(await screen.findByText(/The provider timed out/)).toHaveTextContent(
      'last synchronized data were kept',
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(wire.description);
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText(/D&D Beyond last synced/)).toBeVisible();
    expect(screen.getByText('Class and level').nextElementSibling).toHaveTextContent('Wizard');
    expect(screen.getByText('Species').nextElementSibling).toHaveTextContent('Elf');
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });
});
