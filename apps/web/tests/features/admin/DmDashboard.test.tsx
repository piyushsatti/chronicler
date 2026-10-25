import { screen, within } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { DMDashboardPage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';
import { seriesAuthority } from '../../seriesAuthority.js';
import me from '../../fixtures/wire/me/good.json';

const other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownArc = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Harbor adventures', createdBy: me.id, questCount: 2 };
const quest = { id: other, shortCode: 'Q-1', status: 'open', scheduledAt: '2098-01-01T19:00:00Z', filledCount: 2, slotsMax: 5, briefDocument: { title: 'The next voyage' } };
const empty = { dmStats: { sessionCount: 3 }, questArcs: { items: [], total: 0 }, quests: { items: [], total: 0 }, documents: { items: [], total: 0 } };

it('shows only real totals as stat tiles and an action in each empty subsection', async () => {
  signIn(['dm']);
  server.use(
    graphql.query('DmDashboard', () => HttpResponse.json({ data: empty })),
    seriesAuthority(me.id),
  );
  renderWithProviders(<DMDashboardPage />, { route: '/dm' });
  await screen.findByRole('heading', { name: 'Your quests' });
  const stats = screen.getByLabelText('Your DM stats');
  expect(stats).toHaveTextContent('Quests posted0');
  expect(stats).toHaveTextContent('Sessions run3');
  expect(stats).toHaveTextContent('DM tables0');
  expect(screen.getByRole('link', { name: 'Your page' })).toHaveAttribute('href', '/me');
  expect(screen.getByRole('complementary', { name: 'DM tools' })).toBeVisible();
  for (const name of ['Upcoming quests', 'Past quests']) {
    const section = screen.getByRole('region', { name });
    expect(section.querySelector('[data-component="EmptyState"]')).toBeTruthy();
    expect(within(section).getByRole('link')).toBeVisible();
  }
  // An empty series list offers the create dialog, not a link to a page.
  const series = screen.getByRole('region', { name: 'Your series' });
  expect(series.querySelector('[data-component="EmptyState"]')).toBeTruthy();
  expect(
    await within(series).findByRole('button', { name: 'Create a series' }),
  ).toBeVisible();
});

it('separates upcoming and past quests, omits missing stats and renders own series as cards', async () => {
  signIn(['dm']);
  server.use(graphql.query('DmDashboard', () => HttpResponse.json({ data: {
    ...empty,
    dmStats: null,
    quests: { total: 2, items: [quest, { ...quest, id: ownArc.id, shortCode: 'Q-2', status: 'closed', scheduledAt: '2024-01-01T19:00:00Z', briefDocument: { title: 'The first voyage' } }] },
    questArcs: { total: 2, items: [ownArc, { ...ownArc, id: other, name: 'Someone else’s series', createdBy: other }] },
  } })));
  renderWithProviders(<DMDashboardPage />, { route: '/dm' });
  const upcoming = await screen.findByRole('region', { name: 'Upcoming quests' });
  expect(within(upcoming).getByRole('link', { name: 'The next voyage' })).toHaveAttribute('href', '/quests/Q-1');
  expect(within(upcoming).queryByText('The first voyage')).toBeNull();
  expect(within(screen.getByRole('region', { name: 'Past quests' })).getByRole('link', { name: 'The first voyage' })).toBeVisible();
  expect(screen.queryByText('Sessions run')).toBeNull();
  const series = screen.getByRole('region', { name: 'Your series' });
  expect(series.querySelector('[data-component="CardGrid"]')).toBeTruthy();
  expect(within(series).getByRole('link', { name: ownArc.name })).toHaveAttribute('href', `/series/${ownArc.id}`);
  expect(screen.queryByText('Someone else’s series')).toBeNull();
});

it('gives players a direct apply link from the denied dashboard', async () => {
  signIn(['player']);
  renderWithProviders(<DMDashboardPage />, { route: '/dm' });
  await screen.findByRole('alert');
  expect(screen.getByRole('link', { name: 'Browse DMs and apply' })).toHaveAttribute('href', '/dms');
  expect(screen.getByRole('button', { name: 'Check access again' })).toBeVisible();
});
