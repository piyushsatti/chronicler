import { graphql, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CodexPage } from '../../../src/features/codex/pages/CodexPage.js';
import { NpcsDirectoryPage } from '../../../src/features/codex/pages/NpcsDirectoryPage.js';
import { FactionsDirectoryPage } from '../../../src/features/codex/pages/FactionsDirectoryPage.js';
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
    vi.unstubAllGlobals();
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
    const categories = screen.getByRole('toolbar', { name: 'Codex categories' });
    expect(
      within(categories).getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['All', 'Lore', 'Locations', 'Entities', 'Features', 'More']);
    const count = within(screen.getByRole('region', { name: 'Filter the Codex' }))
      .getByText('2 entries');
    expect(count).toBeVisible();
    expect(categories).not.toContainElement(count);
    expect(screen.getByRole('link', { name: 'Regions' })).toHaveAttribute('href', '/regions');
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/map');
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
    await user.click(screen.getByRole('button', { name: 'Search the Codex' }));
    await user.type(screen.getByLabelText('Search the Codex'), 'tree');
    await screen.findByText('Tree of Light');
    expect(screen.getByText('Tree of Light')).toBeInTheDocument();
    expect(screen.queryByText('The Continent of Weeping')).not.toBeInTheDocument();
  });

  it('shows, edits and clears the query from a direct Codex search URL', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CodexPage />, { route: '/codex?q=seal' });

    const search = screen.getByRole('searchbox', { name: 'Search the Codex' });
    expect(search).toBeVisible();
    expect(search).toHaveValue('seal');
    await screen.findByText('No entries match these filters.');
    await user.clear(search);
    await user.type(search, 'tree');
    expect(await screen.findByText('Tree of Light')).toBeInTheDocument();
    expect(screen.queryByText('The Continent of Weeping')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear and close search the codex' }));
    expect(screen.queryByRole('searchbox', { name: 'Search the Codex' })).not.toBeInTheDocument();
    expect(await screen.findByText('The Continent of Weeping')).toBeInTheDocument();
    expect(screen.getByText('Tree of Light')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search the Codex' }));
    expect(screen.getByRole('searchbox', { name: 'Search the Codex' })).toHaveValue('');
  });

  it('keeps the segmented categories and More menu on phones', async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    renderWithProviders(<CodexPage />);
    await screen.findByText('Tree of Light');
    expect(screen.getByRole('toolbar', { name: 'Codex categories' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: /NPCs/ }));
    expect(await screen.findByText('No entries match these filters.')).toBeInTheDocument();
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

  it.each([
    ['NPCs', NpcsDirectoryPage],
    ['Factions', FactionsDirectoryPage],
  ])('keeps the zero count and browse action in the empty %s directory', async (title, Directory) => {
    renderWithProviders(<Directory />);
    expect(await screen.findByText('0 entries')).toBeVisible();
    expect(screen.getByRole('region', { name: `Filter ${title}` })).toHaveTextContent('0 entries');
    expect(screen.getByRole('link', { name: 'Browse the Codex' })).toHaveAttribute('href', '/codex');
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

  it('loads the next Codex batch on scroll and delegates category and title search to the server', async () => {
    setViewportWidth(1440);
    const user = userEvent.setup();
    let observerCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    class TestObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '160px 0px';
      readonly thresholds = [0];
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = observe;
      disconnect = vi.fn();
      takeRecords = () => [];
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', TestObserver);
    const rows = Array.from({ length: 14 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: `review-entry-${index}`,
      title:
        index === 12
          ? 'Hidden Lore target'
          : index === 13
            ? 'History target'
            : `Recent entry ${index}`,
      category: index === 12 ? 'Lore' : index === 13 ? 'Lore/History' : 'Entities',
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
              { category: 'Entities', count: 12 },
              { category: 'Lore', count: 1 },
              { category: 'Lore/History', count: 1 },
            ],
          },
        });
      }),
    );
    renderWithProviders(<CodexPage />);
    await screen.findByText('Recent entry 0');
    expect(screen.queryByText('Hidden Lore target')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 12 of 14 entries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show .* more/ })).not.toBeInTheDocument();
    expect(observe).toHaveBeenCalled();
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(await screen.findByText('Hidden Lore target')).toBeInTheDocument();
    expect(screen.getByText('14 entries')).toBeInTheDocument();
    expect(requests.slice(0, 2)).toEqual([
      { prefix: '', search: '', limit: 12, offset: 0 },
      { prefix: '', search: '', limit: 12, offset: 12 },
    ]);
    await user.click(screen.getByRole('button', { name: 'Lore' }));
    await screen.findByText('2 entries');
    expect(screen.getByText('Hidden Lore target')).toBeInTheDocument();
    expect(screen.getByText('History target')).toBeInTheDocument();
    expect(screen.queryByText('Recent entry 0')).not.toBeInTheDocument();
    expect(requests).toContainEqual({
      prefix: 'Lore',
      search: '',
      limit: 12,
      offset: 0,
    });
    await user.click(screen.getByRole('button', { name: 'Search the Codex' }));
    await user.type(screen.getByLabelText('Search the Codex'), 'History');
    await screen.findByText('1 entry');
    expect(screen.getByText('History target')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Lore target')).not.toBeInTheDocument();
    expect(requests).toContainEqual({
      prefix: 'Lore',
      search: 'History',
      limit: 12,
      offset: 0,
    });
  });
});
