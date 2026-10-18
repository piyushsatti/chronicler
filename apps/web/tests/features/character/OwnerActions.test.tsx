import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
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
  updatedAt: '2026-10-01T12:00:00Z',
};

describe('OwnerActions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the view and dispatches profile updates through its hook', async () => {
    let submitted: unknown;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string;
          variables?: unknown;
        };
        const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
        if (name === 'UpdateCharacterProfile') {
          submitted = body.variables;
          return HttpResponse.json({
            data: {
              updateCharacterProfile: {
                id: character.id,
                description: 'New description',
                updatedAt: character.updatedAt,
              },
            },
          });
        }
        return HttpResponse.json({
          errors: [{ message: 'Unhandled', extensions: { code: 'UNHANDLED' } }],
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions character={character} />);

    const description = screen.getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'New description');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(submitted).toMatchObject({
      characterId: character.id,
      input: { description: 'New description' },
    });
  });
});
