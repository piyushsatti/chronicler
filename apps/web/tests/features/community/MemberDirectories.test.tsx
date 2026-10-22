import { describe, it, expect } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayersDirectoryPage } from '../../../src/features/community/pages/PlayersDirectoryPage.js';
import { DmsDirectoryPage } from '../../../src/features/community/pages/DmsDirectoryPage.js';
import { loadCommunityMembers } from '../../../src/features/community/adapters/communityAdapter.js';
import { server } from '../../../src/mocks/server.js';
import wire from '../../fixtures/wire/community/directory-good.json';
import { renderWithProviders } from '../../test-utils.js';
describe('Member directory server pages', () => {
  it('sends role/search/offset and retains server total beyond one page', async () => {
    const attempts: Record<string, unknown>[] = [];
    server.use(
      graphql.query('CommunityDirectory', ({ variables }) => {
        attempts.push(variables);
        return HttpResponse.json({
          data: { communityDirectory: { entries: [wire.entries[0]], total: 49 } },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlayersDirectoryPage />);
    await screen.findByText('Page 1 · 49 members');
    await user.click(screen.getByRole('button', { name: 'Next members' }));
    await screen.findByText('Page 2 · 49 members');
    expect(attempts.at(-1)).toMatchObject({
      limit: 24,
      offset: 24,
      filters: { role: 'player' },
    });
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'mira');
    await screen.findByText('Page 1 · 49 members');
    expect(attempts.at(-1)).toMatchObject({
      offset: 0,
      filters: { role: 'player', search: 'mira' },
    });
    expect(screen.getByRole('link', { name: /mira/i })).toHaveAttribute(
      'href',
      '/players/@mira',
    );
  });
  it('applies approved DM and accepting filters on the server', async () => {
    let last: unknown;
    server.use(
      graphql.query('CommunityDirectory', ({ variables }) => {
        last = variables;
        return HttpResponse.json({ data: { communityDirectory: wire } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DmsDirectoryPage />);
    await screen.findByText(/^(Page 1 · )?\d+ members?$/);
    await user.click(screen.getByRole('checkbox', { name: 'Accepting players only' }));
    expect(last).toMatchObject({
      filters: { role: 'dm', dmProfileStatus: 'approved', acceptingPlayers: true },
      offset: 0,
    });
  });
  it('rejects malformed paginated directory wire', async () => {
    server.use(
      graphql.query('CommunityDirectory', () =>
        HttpResponse.json({
          data: { communityDirectory: { entries: [{ memberId: 'bad' }], total: 2 } },
        }),
      ),
    );
    await expect(loadCommunityMembers('player')).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
  it('shows one page of members without a pager and reads weekdays as names', async () => {
    server.use(
      graphql.query('CommunityDirectory', () =>
        HttpResponse.json({ data: { communityDirectory: wire } }),
      ),
    );
    renderWithProviders(<PlayersDirectoryPage />);
    expect(await screen.findByText('2 members')).toBeInTheDocument();
    expect(screen.getByText('Available Saturdays')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Member pages' })).toBeNull();
    // Each card carries an avatar and its availability as a chip.
    const cards = screen.getAllByRole('link').filter((link) =>
      link.getAttribute('href')?.startsWith('/players/@'),
    );
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.querySelector('[data-component="Avatar"]')).not.toBeNull();
      expect(card.querySelector('[data-component="Chip"]')).not.toBeNull();
    }
  });
  it('shows a designed empty state when no member matches', async () => {
    server.use(
      graphql.query('CommunityDirectory', () =>
        HttpResponse.json({ data: { communityDirectory: { entries: [], total: 0 } } }),
      ),
    );
    renderWithProviders(<PlayersDirectoryPage />);
    expect(await screen.findByText('No members match these filters.')).toBeVisible();
    expect(screen.queryByText(/0 members/)).toBeNull();
  });
  it('offers a retry when the directory cannot load', async () => {
    let fail = true;
    server.use(
      graphql.query('CommunityDirectory', () =>
        fail
          ? HttpResponse.json({
              errors: [{ message: 'x', extensions: { code: 'INTERNAL' } }],
            })
          : HttpResponse.json({ data: { communityDirectory: wire } }),
      ),
    );
    renderWithProviders(<PlayersDirectoryPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry members' }));
    expect(await screen.findByText('2 members')).toBeInTheDocument();
  });
});
