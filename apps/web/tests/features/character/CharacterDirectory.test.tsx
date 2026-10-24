import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterListPage } from '../../../src/features/character/pages/CharacterListPage.js';
import { CreateCharacterForm } from '../../../src/features/character/components/CreateCharacterForm.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';
import { signInCharacter } from './characterAuth.js';
const REGION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

beforeEach(() => {
  signInCharacter();
  server.use(
    graphql.query('CharacterRegions', () =>
      HttpResponse.json({ data: { regions: [{ id: REGION, name: 'Lightfall' }] } }),
    ),
  );
});

describe('Character directory', () => {
  it('uses server totals, offsets and filters rather than filtering the first page', async () => {
    const requests: Record<string, unknown>[] = [];
    server.use(
      graphql.query('CharacterDirectory', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({
          data: {
            characters: {
              items: [
                { ...character, name: variables.offset ? 'Second page' : 'First page' },
              ],
              total: 25,
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />);
    await screen.findByRole('heading', { name: 'First page' });
    await user.click(screen.getByRole('button', { name: 'Next characters' }));
    await screen.findByRole('heading', { name: 'Second page' });
    expect(requests.at(-1)).toMatchObject({
      limit: 24,
      offset: 24,
      filters: { status: 'active' },
    });
    expect(screen.getByRole('button', { name: 'Next characters' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Search characters' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search characters' }), 'Lyra');
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        offset: 0,
        filters: { namePrefix: 'Lyra', status: 'active' },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({ filters: { namePrefix: 'Lyra' } }),
    );
    expect(requests.at(-1)?.filters).not.toHaveProperty('status');
    await user.click(screen.getByRole('button', { name: 'My characters' }));
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        filters: { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      }),
    );
  });
  it('creates with selected persisted reference IDs and no custom shortCode', async () => {
    const backstory = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      pick = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let input: unknown;
    server.use(
      graphql.query('Backstories', () =>
        HttpResponse.json({
          data: {
            backstories: { items: [{ id: backstory, name: 'Origin' }], total: 1 },
          },
        }),
      ),
      graphql.query('CharacterCreationCatalog', () =>
        HttpResponse.json({
          data: {
            creationCatalog: {
              items: [
                {
                  id: pick,
                  name: 'Soldier',
                  kind: 'background',
                  available: true,
                  retired: false,
                },
              ],
              total: 1,
            },
          },
        }),
      ),
      graphql.mutation('CreateCharacter', ({ variables }) => {
        input = variables.input;
        return HttpResponse.json({
          data: { createCharacter: { id: character.id, shortCode: 'CNEW' } },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CreateCharacterForm onCancel={() => undefined} />);
    await screen.findByLabelText('Character name');
    await user.type(screen.getByLabelText('Character name'), 'New hero');
    await user.click(screen.getByRole('button', { name: /^Region / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Lightfall' }));
    await user.click(screen.getByRole('button', { name: /^Backstory / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Origin' }));
    await user.click(await screen.findByRole('checkbox', { name: /Soldier/ }));
    expect(screen.getByRole('checkbox', { name: /Soldier/ })).toHaveClass(
      'checkbox__box',
    );
    expect(
      document.querySelector('input[type="checkbox"]:not([aria-hidden="true"])'),
    ).toBeNull();
    expect(screen.getByRole('group', { name: 'Character options' })).toHaveClass(
      'field-group',
    );
    expect(screen.queryByLabelText('Background')).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText('D&D Beyond URL'),
      'https://www.dndbeyond.com/characters/4242',
    );
    await user.type(
      screen.getByLabelText('Character image URL'),
      'https://example.com/hero.png',
    );
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    await waitFor(() =>
      expect(input).toMatchObject({
        name: 'New hero',
        regionId: REGION,
        backstoryId: backstory,
        imageUrl: 'https://example.com/hero.png',
        catalogPickIds: [pick],
        ddbUrl: 'https://www.dndbeyond.com/characters/4242',
      }),
    );
    expect(input).not.toHaveProperty('shortCode');
    expect(input).not.toHaveProperty('backgroundText');
  });

  it('opens the create form from ?new=1 and closes it on cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />, { route: '/characters?new=1' });
    expect(await screen.findByLabelText('Character name')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Character name')).not.toBeInTheDocument(),
    );
  });

  it('requires a D&D Beyond character link before creating', async () => {
    let created = 0;
    server.use(
      graphql.mutation('CreateCharacter', () => {
        created += 1;
        return HttpResponse.json({
          data: { createCharacter: { id: character.id, shortCode: 'CNEW' } },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CreateCharacterForm onCancel={() => undefined} />);
    await user.type(await screen.findByLabelText('Character name'), 'New hero');
    await user.click(screen.getByRole('button', { name: /^Region / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Lightfall' }));
    await user.click(screen.getByRole('button', { name: /^Backstory / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Child of the Weeping' }));
    const ddb = screen.getByLabelText('D&D Beyond URL');
    expect(screen.getByText('D&D Beyond URL').textContent).not.toMatch(/optional/i);
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the D&D Beyond link for this character.',
    );
    expect(ddb).toHaveAttribute('aria-invalid', 'true');
    await user.type(ddb, 'https://example.com/characters/1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use your D&D Beyond character link, like https://www.dndbeyond.com/characters/123456',
    );
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(created).toBe(0);
    await user.clear(ddb);
    await user.type(ddb, 'https://dndbeyond.com/characters/7');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use your D&D Beyond character link',
    );
    await user.clear(ddb);
    await user.type(ddb, 'https://www.dndbeyond.com/characters/7');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    await waitFor(() => expect(created).toBe(1));
  });

  it('shows readable status labels and hides the pager for a single page', async () => {
    server.use(
      graphql.query('CharacterDirectory', () =>
        HttpResponse.json({
          data: {
            characters: {
              items: [
                character,
                {
                  ...character,
                  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  shortCode: 'C-102',
                  name: 'Pending hero',
                  status: 'pending_approval',
                },
              ],
              total: 2,
            },
          },
        }),
      ),
    );
    renderWithProviders(<CharacterListPage />);
    await screen.findByRole('heading', { name: 'Pending hero' });
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.queryByText('C-101')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Character pages' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search characters' }),
    ).toBeInTheDocument();
  });
  it('counts a single character in the singular', async () => {
    server.use(
      graphql.query('CharacterDirectory', () =>
        HttpResponse.json({ data: { characters: { items: [character], total: 1 } } }),
      ),
    );
    renderWithProviders(<CharacterListPage />);
    expect(await screen.findByText('1 character')).toBeInTheDocument();
    expect(screen.queryByText('1 characters')).not.toBeInTheDocument();
  });
  it('requires a region and backstory and validates an empty control on blur', async () => {
    let created = 0;
    server.use(
      graphql.mutation('CreateCharacter', () => {
        created += 1;
        return HttpResponse.json({
          data: { createCharacter: { id: character.id, shortCode: 'CNEW' } },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CreateCharacterForm onCancel={() => undefined} />);
    await user.type(await screen.findByLabelText('Character name'), 'New hero');
    const region = screen.getByRole('button', { name: /^Region / });
    expect(region).toHaveTextContent('Choose a region');
    await user.click(screen.getByText('Region', { selector: 'label' }));
    expect(await screen.findByRole('menu', { name: 'Region' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(region).toHaveFocus();
    await user.tab();
    expect(await screen.findByText('Choose a region for this character.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Backstory / })).toHaveTextContent('Choose a backstory');
    await user.type(
      screen.getByLabelText('D&D Beyond URL'),
      'https://www.dndbeyond.com/characters/7',
    );
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent);
    expect(alerts).toEqual([
      'Choose a region for this character.',
      'Choose a backstory for this character.',
    ]);
    expect(region).toHaveAttribute('aria-invalid', 'true');
    expect(created).toBe(0);
    await user.click(region);
    await user.click(await screen.findByRole('menuitem', { name: 'Lightfall' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('rejects a non-https image link inline and creates without one when empty', async () => {
    let input: Record<string, unknown> | undefined;
    server.use(
      graphql.mutation('CreateCharacter', ({ variables }) => {
        input = variables.input as Record<string, unknown>;
        return HttpResponse.json({
          data: { createCharacter: { id: character.id, shortCode: 'CNEW' } },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CreateCharacterForm onCancel={() => undefined} />);
    await user.type(await screen.findByLabelText('Character name'), 'New hero');
    await user.click(screen.getByRole('button', { name: /^Region / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Lightfall' }));
    await user.click(screen.getByRole('button', { name: /^Backstory / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Child of the Weeping' }));
    await user.type(
      screen.getByLabelText('D&D Beyond URL'),
      'https://www.dndbeyond.com/characters/7',
    );
    const image = screen.getByLabelText('Character image URL');
    await user.type(image, 'http://example.com/hero.png');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Use an https:// image link');
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(input).toBeUndefined();
    await user.clear(image);
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    await waitFor(() => expect(input).toBeDefined());
    expect(input).not.toHaveProperty('imageUrl');
  });

  it('shows each card portrait as a small avatar, with initials when absent', async () => {
    server.use(
      graphql.query('CharacterDirectory', () =>
        HttpResponse.json({
          data: {
            characters: {
              items: [
                { ...character, imageUrl: 'https://example.com/lyra.png' },
                {
                  ...character,
                  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  shortCode: 'C-102',
                  name: 'Brann Ironfoot',
                  imageUrl: null,
                },
                {
                  ...character,
                  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  shortCode: 'C-103',
                  name: 'Est the Younger',
                  imageUrl: null,
                },
              ],
              total: 2,
            },
          },
        }),
      ),
    );
    renderWithProviders(<CharacterListPage />);
    const lyra = await screen.findByRole('link', { name: /Lyra Storm/ });
    expect(lyra.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/lyra.png',
    );
    const brann = screen.getByRole('link', { name: /Brann Ironfoot/ });
    expect(brann.querySelector('img')).toBeNull();
    expect(brann.querySelector('[data-testid="avatar"]')).toHaveTextContent('BI');
    const est = screen.getByRole('link', { name: /Est the Younger/ });
    expect(est.querySelector('[data-testid="avatar"]')).toHaveTextContent('ET');
    // The decorative avatar does not repeat the name in the link's accessible name.
    expect(brann).toHaveAccessibleName(/^Brann Ironfoot/);
  });

  it('branches loading, empty and the My characters checkbox through foundation states', async () => {
    const owners: unknown[] = [];
    server.use(
      graphql.query('CharacterDirectory', ({ variables }) => {
        owners.push((variables.filters as { ownerId?: string }).ownerId);
        return HttpResponse.json({ data: { characters: { items: [], total: 0 } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />);
    expect(
      screen.getAllByRole('status', { name: 'Loading characters' }).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText('No characters match these filters.'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-component="EmptyState"]')).toHaveAttribute(
      'data-kind',
      'no-characters',
    );
    expect(screen.getByText('0 characters')).toBeInTheDocument();
    const mine = await screen.findByRole('button', { name: 'My characters' });
    await user.click(mine);
    expect(
      await screen.findByText('You have no characters matching these filters.'),
    ).toBeInTheDocument();
    expect(owners.at(-1)).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await user.click(screen.getByRole('button', { name: 'Create a character' }));
    expect(
      await screen.findByRole('heading', { name: 'Create a character' }),
    ).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    let calls = 0;
    server.use(
      graphql.query('CharacterDirectory', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ errors: [{ message: 'boom' }] })
          : HttpResponse.json({
              data: { characters: { items: [character], total: 1 } },
            });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />);
    await user.click(await screen.findByRole('button', { name: 'Retry roster' }));
    expect(
      await screen.findByRole('heading', { name: 'Lyra Storm' }),
    ).toBeInTheDocument();
  });

  it('labels every card with its status once the list shows all statuses', async () => {
    server.use(
      graphql.query('CharacterDirectory', () =>
        HttpResponse.json({
          data: { characters: { items: [character], total: 1 } },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />);
    await screen.findByRole('heading', { name: character.name });
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Approved')).toBeInTheDocument();
  });

  it('shows region and the listed player, using Player not listed only when ownerId is absent', async () => {
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({
        data: { characters: { items: [
          { ...character, regionId: REGION },
          { ...character, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', shortCode: 'C-102', name: 'No owner', ownerId: undefined, regionId: REGION },
        ], total: 2 } },
      })),
      graphql.query('CharacterOwner', () => HttpResponse.json({
        data: { member: { id: character.ownerId, handle: 'owner', displayName: 'Owner One', avatarUrl: null } },
      })),
      graphql.query('CharacterRegions', () => HttpResponse.json({
        data: { regions: [{ id: REGION, name: 'Lightfall Coast' }] },
      })),
    );
    renderWithProviders(<CharacterListPage />);
    const owned = await screen.findByRole('heading', { name: character.name });
    expect(owned.closest('a')).toHaveTextContent('Lightfall Coast');
    expect(await within(owned.closest('a') as HTMLElement).findByText('Owner One')).toBeInTheDocument();
    const unowned = screen.getByRole('heading', { name: 'No owner' }).closest('a');
    expect(unowned).toHaveTextContent('Player not listed');
  });

  it('shows region lookup failure as unavailable and exposes the roster retry', async () => {
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({
        data: { characters: { items: [{ ...character, regionId: REGION }], total: 1 } },
      })),
      graphql.query('CharacterRegions', () => HttpResponse.json({ errors: [{ message: 'Unavailable' }] })),
    );
    renderWithProviders(<CharacterListPage />);
    const card = await screen.findByRole('heading', { name: character.name });
    expect(card.closest('a')).toHaveTextContent('Region unavailable');
    expect(screen.getByRole('button', { name: 'Retry roster' })).toBeInTheDocument();
  });

  it('disambiguates distinct visible owners sharing a display name', async () => {
    const otherOwnerId = '22222222-2222-4222-8222-222222222222';
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({ data: {
        characters: { total: 2, items: [character, {
          ...character, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          shortCode: 'C-102', name: 'Second hero', ownerId: otherOwnerId,
        }] },
      } })),
      graphql.query('CharacterOwner', ({ variables }) => HttpResponse.json({ data: {
        member: {
          id: variables.id, handle: variables.id === character.ownerId ? 'alex_one' : 'alex_two',
          displayName: 'Alex Rowan', avatarUrl: null,
        },
      } })),
    );
    renderWithProviders(<CharacterListPage />);

    expect(await screen.findByText('Alex Rowan (@alex_one)')).toBeVisible();
    expect(screen.getByText('Alex Rowan (@alex_two)')).toBeVisible();
    expect(screen.getByRole('link', { name: /Lyra Storm/ })).toHaveTextContent('Alex Rowan (@alex_one)');
    expect(screen.getByRole('link', { name: /Second hero/ })).toHaveTextContent('Alex Rowan (@alex_two)');
  });

  it('does not add a handle when multiple visible characters have the same owner', async () => {
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({ data: {
        characters: { total: 2, items: [character, {
          ...character, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          shortCode: 'C-102', name: 'Second hero',
        }] },
      } })),
      graphql.query('CharacterOwner', () => HttpResponse.json({ data: {
        member: { id: character.ownerId, handle: 'alex_one', displayName: 'Alex Rowan', avatarUrl: null },
      } })),
    );
    renderWithProviders(<CharacterListPage />);

    expect(await screen.findAllByText('Alex Rowan', { exact: true })).toHaveLength(2);
    expect(screen.queryByText(/@alex_one/)).not.toBeInTheDocument();
  });
});
