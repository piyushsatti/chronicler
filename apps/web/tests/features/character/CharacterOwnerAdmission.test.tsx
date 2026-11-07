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

function renderCharacter() {
  renderWithProviders(
    <Routes>
      <Route path="/characters/:code" element={<CharacterPage />} />
    </Routes>,
    { route: '/characters/C-101' },
  );
}

describe('Character owner admission', () => {
  it('lets an admin edit the profile and shows the saved text', async () => {
    signInCharacter({
      ...characterActor,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      roles: ['admin'],
    });
    let description = wire.description;
    server.use(
      graphql.query('Character', () =>
        HttpResponse.json({ data: { character: { ...wire, imageUrl: null, description } } }),
      ),
      graphql.mutation('UpdateCharacterProfile', async ({ variables }) => {
        const input = variables.input as { description?: string | null };
        if (typeof input.description === 'string') description = input.description;
        return HttpResponse.json({
          data: {
            updateCharacterProfile: {
              id: wire.id,
              description,
              imageUrl: null,
              updatedAt: wire.updatedAt,
            },
          },
        });
      }),
    );
    renderCharacter();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit character' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Retire character' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync D&D Beyond' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Description' });
    await user.clear(field);
    await user.type(field, 'Corrected by admin.');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Corrected by admin.')).toBeVisible();
  });
  it.each([
    ['verifier', ['verifier']],
    ['another DM', ['dm']],
  ])('does not offer profile edits to %s', async (_label, roles) => {
    signInCharacter({
      ...characterActor,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      roles,
    });
    renderCharacter();
    await screen.findByRole('heading', { name: 'Lyra Storm' });
    expect(screen.queryByRole('tab', { name: 'Edit' })).not.toBeInTheDocument();
  });
  it('offers mutations when the live member UUID matches the immutable owner', async () => {
    signInCharacter();
    renderCharacter();
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
    renderCharacter();
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
