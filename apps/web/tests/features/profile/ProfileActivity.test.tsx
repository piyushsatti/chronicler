import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileActivity } from '../../../src/features/profile/components/ProfileActivity.js';
import { loadProfileActivity } from '../../../src/features/profile/adapters/profileActivityAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';
const memberId = '11111111-1111-4111-8111-111111111111';
const questId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('Public profile activity', () => {
  it('shows returned counts, a character card grid, deduplicated quest history and authored writings', async () => {
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({ data: { characters: { items: [character, { ...character, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', shortCode: 'other', name: 'Other hero' }], total: 2 } } })),
      graphql.query('ProfileActivity', () => HttpResponse.json({ data: { memberActivityStats: { questsPlayed: 7, summariesAuthored: 1 }, documents: { total: 1, items: [{ id: questId, slug: 'salt-stair', title: 'The salt stair journal', publishedAt: '2026-02-01T12:00:00Z' }] } } })),
    );
    const user = userEvent.setup();
    renderWithProviders(<ProfileActivity memberId={memberId} owner={false} about={<p>About this player</p>} />);
    expect(await screen.findByText('Quests played')).toBeVisible();
    expect(screen.getByText('Quests played').closest('[data-component="StatTile"]')).toHaveTextContent('7');
    await user.click(screen.getByRole('tab', { name: 'Characters' }));
    expect(await screen.findByRole('link', { name: /Lyra Storm/ })).toHaveAttribute('href', '/characters/C-101');
    expect(screen.getByRole('tabpanel', { name: 'Characters' }).querySelector('[aria-label="Characters"]')).toHaveAttribute('data-component', 'CardGrid');
    await user.click(screen.getByRole('tab', { name: 'Quest history' }));
    expect(await screen.findByRole('link', { name: 'The Salt Stair' })).toHaveAttribute('href', '/quests/Q-7');
    expect(screen.getAllByRole('link', { name: 'The Salt Stair' })).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: 'Writings' }));
    expect(await screen.findByRole('link', { name: /The salt stair journal/ })).toHaveAttribute('href', '/summaries/salt-stair');
  });

  it.each([false, true])('uses honest empty tabs with owner actions only when owner=%s', async (owner) => {
    server.use(graphql.query('CharacterDirectory', () => HttpResponse.json({ data: { characters: { items: [], total: 0 } } })));
    const user = userEvent.setup();
    renderWithProviders(<ProfileActivity memberId={memberId} owner={owner} about={<p>About</p>} />);
    await user.click(screen.getByRole('tab', { name: 'Characters' }));
    expect(await screen.findByText(owner ? 'You have not created a character yet.' : 'This player has no shared characters yet.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Create a character' }) !== null).toBe(owner);
    await user.click(screen.getByRole('tab', { name: 'Quest history' }));
    expect(await screen.findByText(owner ? 'You have no recorded quest history yet.' : 'This player has no shared quest history yet.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Writings' }));
    expect(await screen.findByText(owner ? 'You have not published any writings yet.' : 'This player has no shared writings yet.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Write a summary' }) !== null).toBe(owner);
    expect(screen.queryByText('Quests played')).not.toBeInTheDocument();
  });

  it('pages authored writings and rejects an incomplete page', async () => {
    const offsets: unknown[] = [];
    server.use(graphql.query('ProfileActivity', ({ variables }) => {
      offsets.push(variables.offset);
      return HttpResponse.json({ data: { memberActivityStats: null, documents: { total: 2, items: [{ id: questId, slug: `page-${variables.offset}`, title: 'Entry', publishedAt: null }] } } });
    }));
    expect((await loadProfileActivity(memberId)).writings).toHaveLength(2);
    expect(offsets).toEqual([0, 1]);
    server.use(graphql.query('ProfileActivity', () => HttpResponse.json({ data: { memberActivityStats: null, documents: { items: [], total: 1 } } })));
    await expect(loadProfileActivity(memberId)).rejects.toMatchObject({ kind: 'invalid' });
  });
});
