import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CharacterViewModel } from '../../../src/features/character/types.js';
import { OwnerActions } from '../../../src/features/character/components/OwnerActions.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signInCharacter, characterActor } from './characterAuth.js';
beforeEach(() => signInCharacter());

const character: CharacterViewModel = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shortCode: 'C-101',
  name: 'Mira',
  status: 'active',
  ownerId: characterActor.id,
  verificationStatus: 'draft',
  backstoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  regionId: null,
  regionName: null,
  description: 'Old description',
  ddbUrl: null,
  imageUrl: null,
  displayIcon: null,
  updatedAt: '2026-10-01T12:00:00Z',
};

describe('OwnerActions', () => {
  it('renders the view and dispatches profile updates through its hook', async () => {
    let submitted: unknown;
    server.use(
      graphql.mutation('UpdateCharacterProfile', ({ variables }) => {
          submitted = variables;
          return HttpResponse.json({
            data: {
              updateCharacterProfile: {
                id: character.id,
                description: 'New description',
                updatedAt: character.updatedAt,
              },
            },
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
    expect(submitted).not.toMatchObject({
      input: expect.objectContaining({
        ddbUrl: expect.anything(),
        displayIcon: expect.anything(),
      }),
    });    expect(
      (submitted as { input: Record<string, unknown> }).input,
    ).not.toHaveProperty('backgroundText');
    expect(screen.queryByLabelText('Background')).not.toBeInTheDocument();
    expect(screen.getByText('Verification: Not submitted')).toBeInTheDocument();
  });

  it('does not offer a displayIcon control (schema limit)', () => {
    renderWithProviders(<OwnerActions character={character} />);
    expect(screen.queryByLabelText(/display icon/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('D&D Beyond URL')).toBeInTheDocument();
  });
});

describe('OwnerActions character image', () => {
  it('sets, validates and clears the image URL, sending it only when changed', async () => {
    const inputs: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('UpdateCharacterProfile', ({ variables }) => {
        inputs.push(variables.input as Record<string, unknown>);
        return HttpResponse.json({
          data: {
            updateCharacterProfile: {
              id: character.id,
              description: 'Old description',
              imageUrl: null,
              updatedAt: character.updatedAt,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    const view = renderWithProviders(<OwnerActions character={character} />);
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved.');
    expect(inputs[0]).not.toHaveProperty('imageUrl');

    const image = screen.getByLabelText('Character image URL');
    await user.type(image, 'http://example.com/a.png');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Use an https:// image link');
    expect(image).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();

    await user.clear(image);
    await user.type(image, 'https://example.com/a.png');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await vi.waitFor(() => expect(inputs).toHaveLength(2));
    expect(inputs[1]).toMatchObject({ imageUrl: 'https://example.com/a.png' });

    view.unmount();
    renderWithProviders(
      <OwnerActions character={{ ...character, imageUrl: 'https://example.com/a.png' }} />,
    );
    await user.clear(screen.getByLabelText('Character image URL'));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await vi.waitFor(() => expect(inputs).toHaveLength(3));
    expect(inputs[2]).toMatchObject({ imageUrl: null });
  });

  it('blocks a non-canonical D&D Beyond link before syncing', async () => {
    let synced = 0;
    server.use(
      graphql.mutation('SyncCharacterDdb', () => {
        synced += 1;
        return HttpResponse.json({ data: { syncCharacterDdb: null } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions character={character} />);
    const ddb = screen.getByLabelText('D&D Beyond URL');
    await user.type(ddb, 'https://dndbeyond.com/characters/1');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use your D&D Beyond character link, like https://www.dndbeyond.com/characters/123456',
    );
    expect(screen.getByRole('button', { name: 'Sync D&D Beyond' })).toBeDisabled();
    expect(synced).toBe(0);
  });
});

describe('owner lifecycle actions', () => {
  it('saves profile independently of DDB and reports expected sync failure', async () => {
    const calls: string[] = [];
    server.use(
      graphql.mutation('UpdateCharacterProfile', () => {
        calls.push('profile');
        return HttpResponse.json({
          data: {
            updateCharacterProfile: {
              id: character.id,
              updatedAt: character.updatedAt,
            },
          },
        });
      }),
      graphql.mutation('SyncCharacterDdb', () => {
        calls.push('sync');
        return HttpResponse.json({
          data: {
            syncCharacterDdb: {
              succeeded: false,
              safeError: 'TIMEOUT',
              attemptedAt: character.updatedAt,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions character={character} />);
    await user.type(
      screen.getByLabelText('D&D Beyond URL'),
      'https://www.dndbeyond.com/characters/101',
    );
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved.');
    expect(calls).toEqual(['profile']);
    await user.click(screen.getByRole('button', { name: 'Sync D&D Beyond' }));
    await screen.findByText(/The provider timed out/);
    expect(calls).toEqual(['profile', 'sync']);
    expect(screen.getByRole('status')).toHaveTextContent(
      'saved profile and last synchronized data were kept',
    );
  });
  it('disables an existing uppercase pending submission and permits rejected resubmission with its current token', async () => {
    const user = userEvent.setup();
    let submitted: unknown;
    server.use(
      graphql.mutation('SubmitForVerification', ({ variables }) => {
        submitted = variables;
        return HttpResponse.json({
          data: {
            submitForVerification: {
              id: character.id,
              verificationStatus: 'PENDING',
              updatedAt: character.updatedAt,
            },
          },
        });
      }),
    );
    const view = renderWithProviders(
      <OwnerActions
        character={{
          ...character,
          status: 'pending_approval',
          verificationStatus: 'PENDING',
        }}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Submit for verification' }),
    ).toBeDisabled();
    view.rerender(
      <OwnerActions
        character={{
          ...character,
          status: 'pending_approval',
          verificationStatus: 'REJECTED',
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Resubmit for verification' }));
    await screen.findByText('Submitted for verification.');
    expect(submitted).toMatchObject({
      characterId: character.id,
      expectedUpdatedAt: character.updatedAt,
    });
  });
  it('sends retirement only after confirmation and includes the current version', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let submitted: unknown;
    server.use(
      graphql.mutation('RetireCharacter', ({ variables }) => {
        submitted = variables;
        return HttpResponse.json({
          data: {
            retireCharacter: {
              id: character.id,
              status: 'retired',
              updatedAt: character.updatedAt,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions character={character} />);
    await user.click(screen.getByRole('button', { name: 'Retire' }));
    expect(submitted).toBeUndefined();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Retire' }));
    await screen.findByText('Character retired.');
    expect(submitted).toMatchObject({
      characterId: character.id,
      expectedUpdatedAt: character.updatedAt,
    });
    confirm.mockRestore();
  });
});
