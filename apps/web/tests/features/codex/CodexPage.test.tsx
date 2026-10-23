import { graphql, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CodexPage } from '../../../src/features/codex/pages/CodexPage.js';
import { routes } from '../../../src/features/codex/feature.js';
import { server } from '../../../src/mocks/server.js';
import empty from '../../fixtures/wire/codex/empty-list.json';
import { renderWithProviders } from '../../test-utils.js';

const viewport = vi.hoisted(() => ({
  widthClass: 'expanded' as 'compact' | 'expanded',
}));
vi.mock('@pi/react-imposition/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pi/react-imposition/react')>()),
  useSizeClasses: () => ({ widthClass: viewport.widthClass }),
}));
function setViewportWidth(width: number) {
  viewport.widthClass = width < 600 ? 'compact' : 'expanded';
}

describe('CodexPage', () => {
  afterEach(() => {
    setViewportWidth(1440);
  });

  it('renders a readable custom-category entry absent from the published category catalogue', async () => {
    server.use(
      graphql.query('CodexDirectory', () =>
        HttpResponse.json({
          data: {
            codexDirectory: {
              items: [
                {
                  id: '10000000-0000-4000-8000-000000000001',
                  slug: 'unpublished-notes',
                  title: 'My unpublished notes',
                  category: 'DraftOnly',
                  effectiveBody: 'A readable own draft.',
                },
              ],
              total: 1,
            },
            codexCategories: [],
          },
        }),
      ),
    );
    renderWithProviders(<CodexPage />);
    expect(
      await screen.findByRole('link', { name: /My unpublished notes/ }),
    ).toHaveAttribute('href', '/codex/unpublished-notes');
    expect(screen.getByRole('region', { name: 'DraftOnly' })).toBeInTheDocument();
    expect(screen.getByText('1 entry')).toBeInTheDocument();
  });

  it('lists codex entries', async () => {
    renderWithProviders(<CodexPage />);
    expect(await screen.findByText('Tree of Light')).toBeInTheDocument();
    expect(screen.getByText('The Continent of Weeping')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Category' })).toBeInTheDocument();
  });

  it('filters category groups and searches their actual titles', async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    renderWithProviders(<CodexPage />);
    await screen.findByText('Tree of Light');
    await user.click(screen.getByRole('button', { name: /Locations/ }));
    await screen.findByText('The Continent of Weeping');
    expect(screen.queryByText('Tree of Light')).not.toBeInTheDocument();
    expect(screen.getByText('The Continent of Weeping')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /All/ }));
    await user.type(screen.getByLabelText('Search the Codex'), 'tree');
    await screen.findByText('Tree of Light');
    expect(screen.getByText('Tree of Light')).toBeInTheDocument();
    expect(screen.queryByText('The Continent of Weeping')).not.toBeInTheDocument();
  });

  it('collapses the category chips into a picker on phones', async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    renderWithProviders(<CodexPage />);
    await screen.findByText('Tree of Light');
    expect(screen.queryByRole('button', { name: /Locations/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Category/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Locations/ }));
    await screen.findByText('The Continent of Weeping');
    expect(screen.queryByText('Tree of Light')).not.toBeInTheDocument();
  });

  it('follows an entry into the real Codex document reader', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>,
      { route: '/codex' },
    );
    await user.click(await screen.findByRole('link', { name: 'Tree of Light' }));
    expect(
      await screen.findByRole('heading', { name: 'Tree of Light' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Codex' })).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({ data: { codexDirectory: empty, codexCategories: [] } }),
      ),
    );
    renderWithProviders(<CodexPage />);
    expect(await screen.findByText('No codex entries.')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<CodexPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('pages beyond fifty entries and delegates nested-prefix and title search to the server', async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    const rows = Array.from({ length: 52 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: `review-entry-${index}`,
      title:
        index === 50
          ? 'Hidden Lore target'
          : index === 51
            ? 'History target'
            : `Recent entry ${index}`,
      category: index === 50 ? 'Lore' : index === 51 ? 'Lore/History' : 'Entities',
      effectiveBody: 'Review fixture',
    }));
    const requests: Array<{
      prefix: string;
      search: string;
      limit: number;
      offset: number;
    }> = [];
    server.use(
      graphql.query('CodexDirectory', ({ variables }) => {
        if (typeof variables.limit !== 'number' || typeof variables.offset !== 'number')
          throw new Error('Missing bounded Codex page');
        const prefix =
          typeof variables.categoryPrefix === 'string' ? variables.categoryPrefix : '';
        const search = typeof variables.search === 'string' ? variables.search : '';
        requests.push({
          prefix,
          search,
          limit: variables.limit,
          offset: variables.offset,
        });
        const matching = rows.filter(
          (row) =>
            (!prefix ||
              row.category === prefix ||
              row.category.startsWith(`${prefix}/`)) &&
            (!search || row.title.toLowerCase().includes(search.toLowerCase())),
        );
        return HttpResponse.json({
          data: {
            codexDirectory: {
              items: matching.slice(
                variables.offset,
                variables.offset + variables.limit,
              ),
              total: matching.length,
            },
            codexCategories: [
              { category: 'Entities' },
              { category: 'Lore' },
              { category: 'Lore/History' },
            ],
          },
        });
      }),
    );
    renderWithProviders(<CodexPage />);
    await screen.findByText('Recent entry 0');
    expect(screen.queryByText('Hidden Lore target')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 50 of 52 entries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Show 2 more/ }));
    expect(await screen.findByText('Hidden Lore target')).toBeInTheDocument();
    expect(screen.getByText('52 entries')).toBeInTheDocument();
    expect(requests.slice(0, 2)).toEqual([
      { prefix: '', search: '', limit: 50, offset: 0 },
      { prefix: '', search: '', limit: 50, offset: 50 },
    ]);
    await user.click(screen.getByRole('button', { name: /^Lore\s?\d*$/ }));
    await screen.findByText('2 entries');
    expect(screen.getByText('Hidden Lore target')).toBeInTheDocument();
    expect(screen.getByText('History target')).toBeInTheDocument();
    expect(screen.queryByText('Recent entry 0')).not.toBeInTheDocument();
    expect(requests).toContainEqual({
      prefix: 'Lore',
      search: '',
      limit: 50,
      offset: 0,
    });
    await user.type(screen.getByLabelText('Search the Codex'), 'History');
    await screen.findByText('1 entry');
    expect(screen.getByText('History target')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Lore target')).not.toBeInTheDocument();
    expect(requests).toContainEqual({
      prefix: 'Lore',
      search: 'History',
      limit: 50,
      offset: 0,
    });
  });
});
