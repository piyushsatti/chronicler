import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterListPage } from '../../../src/features/character/pages/CharacterListPage.js';
import { CreateCharacterForm } from '../../../src/features/character/components/CreateCharacterForm.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';
import { signInCharacter } from './characterAuth.js';
beforeEach(() => signInCharacter());
const REGION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
    await user.type(screen.getByLabelText('Search characters by name'), 'Lyra');
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({
        offset: 0,
        filters: { namePrefix: 'Lyra', status: 'active' },
      }),
    );
    await user.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() =>
      expect(requests.at(-1)).toMatchObject({ filters: { namePrefix: 'Lyra' } }),
    );
    expect(requests.at(-1)?.filters).not.toHaveProperty('status');
    await user.click(screen.getByRole('checkbox', { name: 'My characters' }));
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
    await user.selectOptions(screen.getByLabelText('Region'), REGION);
    await user.selectOptions(screen.getByLabelText('Backstory'), backstory);
    await user.click(await screen.findByRole('checkbox', { name: /Soldier/ }));
    expect(screen.getByRole('checkbox', { name: /Soldier/ })).toHaveClass('checkbox__box');
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
    await user.selectOptions(screen.getByLabelText('Region'), REGION);
    await user.selectOptions(
      screen.getByLabelText('Backstory'),
      screen.getAllByRole('option').find((o) => o.textContent === 'Child of the Weeping')!,
    );
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
    expect(screen.getByRole('alert')).toHaveTextContent('Use your D&D Beyond character link');
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
    // The default Approved-only list does not repeat "Approved" on every card.
    expect(screen.queryByText('Approved', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.queryByText('C-101')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Character pages' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search characters by name' })).toBeInTheDocument();
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
  it('requires a region and backstory chosen from a disabled placeholder', async () => {
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
    const region = screen.getByLabelText('Region');
    expect(screen.getByRole('option', { name: 'Choose a region' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Choose a backstory' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'No region' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'No backstory' })).not.toBeInTheDocument();
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
    await user.selectOptions(region, REGION);
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
    await user.selectOptions(screen.getByLabelText('Region'), REGION);
    await user.selectOptions(
      screen.getByLabelText('Backstory'),
      screen.getAllByRole('option').find((o) => o.textContent === 'Child of the Weeping')!,
    );
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
              ],
              total: 2,
            },
          },
        }),
      ),
    );
    renderWithProviders(<CharacterListPage />);
    const lyra = await screen.findByRole('link', { name: /Lyra Storm/ });
    expect(lyra.querySelector('img')).toHaveAttribute('src', 'https://example.com/lyra.png');
    const brann = screen.getByRole('link', { name: /Brann Ironfoot/ });
    expect(brann.querySelector('img')).toBeNull();
    expect(brann).toHaveTextContent('BI');
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
    expect(screen.getAllByRole('status', { name: 'Loading characters' }).length).toBeGreaterThan(0);
    expect(await screen.findByText('No characters match these filters.')).toBeInTheDocument();
    expect(document.querySelector('[data-component="EmptyState"]')).toHaveAttribute(
      'data-kind',
      'no-characters',
    );
    expect(screen.getByText('0 characters')).toBeInTheDocument();
    const mine = await screen.findByRole('checkbox', { name: 'My characters' });
    expect(mine).toHaveClass('checkbox__box');
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
          : HttpResponse.json({ data: { characters: { items: [character], total: 1 } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CharacterListPage />);
    await user.click(await screen.findByRole('button', { name: 'Retry roster' }));
    expect(await screen.findByRole('heading', { name: 'Lyra Storm' })).toBeInTheDocument();
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
    expect(screen.queryByText('Approved', { selector: 'p' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(await screen.findByText('Approved', { selector: 'p' })).toBeInTheDocument();
  });
});
