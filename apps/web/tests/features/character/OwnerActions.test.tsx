import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from '../../../src/api/endpoints.js';
import type { CharacterViewModel } from '../../../src/features/character/types.js';
import { OwnerActions } from '../../../src/features/character/components/OwnerActions.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

const character: CharacterViewModel = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shortCode: 'C-101',
  name: 'Mira',
  status: 'active',
  ownerId: 'member-1',
  verificationStatus: 'draft',
  backstoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  backstoryName: null,
  regionId: null,
  regionName: null,
  description: 'Old description',
  ddbUrl: null,
  displayIcon: null,
};

describe('OwnerActions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the view and dispatches profile updates through its hook', async () => {
    let submitted: unknown;
    server.use(
      http.patch(rest.characterProfile(character.id), async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions character={character} />);

    const description = screen.getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'New description');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(submitted).toEqual({
      description: 'New description',
      ddbUrl: null,
    });
  });
});
