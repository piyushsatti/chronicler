import { screen } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { DMDashboardPage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

it.each([['dm'], ['admin']])('keeps the personal DM header first in the page frame for %s', async (role) => {
  signIn([role]);
  server.use(graphql.query('DmDashboard', () => HttpResponse.json({ data: {
    dmStats: null,
    questArcs: { items: [], total: 0 },
    quests: { items: [], total: 0 },
    documents: { items: [], total: 0 },
  } })));
  renderWithProviders(<DMDashboardPage />, { route: '/dm' });
  await screen.findByRole('heading', { name: 'Your quests' });
  const heading = screen.getByRole('heading', { level: 1, name: 'DM dashboard' });
  expect(heading.closest('.page-root > .page')).not.toBeNull();
  const host = heading.closest('[data-page-host]');
  expect(host?.firstElementChild).toHaveAttribute('data-page-region', 'body');
  expect(host?.querySelector('[data-page-region="nav"]')).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Admin sections' })).toBeNull();
});
