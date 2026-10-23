import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { SearchPage } from '../../../src/features/search/pages/SearchPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/search/good.json';
import kinds from '../../fixtures/wire/search/kinds-good.json';

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button" onClick={() => void navigate(-1)}>
        Back in history
      </button>
    </>
  );
}
const KIND_LABELS = new Map(kinds.map((kind) => [kind.key, kind.label]));
async function pickKind(user: ReturnType<typeof userEvent.setup>, key: string) {
  await user.click(screen.getByRole('button', { name: /Kind/ }));
  const label = key === 'all' ? 'All kinds' : (KIND_LABELS.get(key) ?? key);
  await user.click(await screen.findByRole('menuitem', { name: label }));
}
const requestSchema = z.object({
  query: z.string(),
  variables: z
    .object({
      query: z.string(),
      kinds: z.array(z.string()).nullable(),
      limit: z.number(),
      offset: z.number(),
    })
    .optional(),
});

function pageResponses() {
  const seen: unknown[] = [];
  server.use(
    http.post(GRAPHQL_PATH, async ({ request }) => {
      const body = requestSchema.parse(await request.json());
      if (body.query.includes('SearchableKinds'))
        return HttpResponse.json({ data: { searchableKinds: kinds } });
      const variables = body.variables;
      if (!variables) return HttpResponse.json({ data: {} });
      seen.push(variables);
      return HttpResponse.json({
        data: {
          search: {
            ...good,
            query: variables.query,
            documentTotal: 41,
            memberTotal: 42,
            documents: [
              {
                ...good.documents[0],
                title: `Document ${variables.offset}`,
                slug: `document-${variables.offset}`,
              },
            ],
            members: [
              {
                ...good.members[0],
                displayName: `Member ${variables.offset}`,
                handle: `member-${variables.offset}`,
              },
            ],
          },
        },
      });
    }),
  );
  return seen;
}

describe('SearchPage', () => {
  it('groups results and disambiguates visible member names without redundant Member chips', async () => {
    server.use(graphql.query('Search', () => HttpResponse.json({ data: { search: {
      ...good, documents: [], documentTotal: 0, memberTotal: 2,
      members: [{ ...good.members[0], displayName: 'dev', handle: 'brune' }, { ...good.members[0], memberId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', displayName: 'dev', handle: 'cox' }],
    } } })));
    renderWithProviders(<SearchPage />, { route: '/search?q=dev' });
    expect(await screen.findByRole('link', { name: 'dev (@brune)' })).toHaveAttribute('href', '/players/@brune');
    const members = screen.getByRole('region', { name: 'Members' });
    expect(within(members).getByRole('link', { name: 'dev (@cox)' })).toBeVisible();
    expect(within(members).queryByText('Member')).not.toBeInTheDocument();
    const documents = screen.getByRole('region', { name: 'Documents' });
    expect(within(documents).getByText('No documents match your search.')).toBeVisible();
    expect(within(documents).getByRole('link', { name: 'Browse the Codex' })).toHaveAttribute('href', '/codex');
  });
  it('restores URL query/filter/family pages and preserves the other page through back navigation', async () => {
    const seen = pageResponses();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=tree&documents=2&members=1' },
    );
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('tree');
    expect(await screen.findByRole('link', { name: 'Document 20' })).toHaveAttribute(
      'href',
      '/codex/document-20',
    );
    expect(await screen.findByRole('link', { name: 'Member 0' })).toHaveAttribute(
      'href',
      '/players/@member-0',
    );
    await user.click(screen.getByRole('button', { name: 'Next members' }));
    expect(await screen.findByRole('link', { name: 'Member 20' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Document 20' })).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      'documents=2&members=2',
    );
    await user.click(screen.getByRole('button', { name: 'Back in history' }));
    expect(await screen.findByRole('link', { name: 'Member 0' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Document 20' })).toBeInTheDocument();
    await pickKind(user, 'rule');
    await waitFor(() =>
      expect(screen.getByLabelText('Location')).toHaveTextContent(
        '/search?q=tree&kinds=rule',
      ),
    );
    expect(screen.queryByRole('region', { name: 'Members' })).not.toBeInTheDocument();
    expect(seen).toContainEqual({ query: 'tree', kinds: null, limit: 20, offset: 20 });
    expect(seen).toContainEqual({
      query: 'tree',
      kinds: ['rule'],
      limit: 20,
      offset: 0,
    });
  });

  it('restores explicit no kinds and lets the user search all kinds', async () => {
    const seen = pageResponses();
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />, { route: '/search?q=tree&kinds=' });
    expect(screen.getByText(/No kinds selected/)).toBeInTheDocument();
    expect(seen).toEqual([]);
    await pickKind(user, 'all');
    expect(await screen.findByRole('link', { name: 'Document 0' })).toBeInTheDocument();
    expect(seen).toContainEqual({ query: 'tree', kinds: null, limit: 20, offset: 0 });
  });

  it('explains an unknown URL kind and lets the user recover', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />, { route: '/search?q=tree&kinds=hex' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That search kind is unavailable',
    );
    expect(
      screen.queryByRole('link', { name: 'Tree of Light' }),
    ).not.toBeInTheDocument();
    await pickKind(user, 'all');
    expect(
      await screen.findByRole('link', { name: 'Tree of Light' }),
    ).toBeInTheDocument();
  });

  it('explains missing quest identity rather than creating a slug route', async () => {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = requestSchema.parse(await request.json());
        return HttpResponse.json({
          data: body.query.includes('SearchableKinds')
            ? { searchableKinds: kinds }
            : {
                search: {
                  ...good,
                  documents: [
                    {
                      ...good.documents[0],
                      kind: 'quest_brief',
                      title: 'Archived brief',
                      questShortCode: null,
                    },
                  ],
                },
              },
        });
      }),
    );
    renderWithProviders(<SearchPage />, { route: '/search?q=tree' });
    expect(await screen.findByText('Archived brief')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Archived brief' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse quests' })).toHaveAttribute(
      'href',
      '/quests',
    );
  });

  it('shows a controlled error and retries the failed search', async () => {
    let failed = true;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = requestSchema.parse(await request.json());
        if (body.query.includes('SearchableKinds'))
          return HttpResponse.json({ data: { searchableKinds: kinds } });
        if (failed)
          return HttpResponse.json({
            errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
          });
        return HttpResponse.json({ data: { search: good } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />, { route: '/search?q=tree&kinds=codex_entry' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    failed = false;
    await user.click(screen.getByRole('button', { name: 'Retry documents' }));
    expect(
      await screen.findByRole('link', { name: 'Tree of Light' }),
    ).toBeInTheDocument();
  });

  it('shows totals and independent pagination regions', async () => {
    pageResponses();
    renderWithProviders(<SearchPage />, { route: '/search?q=tree' });
    const docs = await screen.findByRole('region', { name: 'Documents' });
    await within(docs).findByText('41 results');
    expect(
      within(docs).getByRole('navigation', { name: 'Documents pages' }),
    ).toHaveTextContent('Page 1');
    expect(
      within(screen.getByRole('region', { name: 'Members' })).getByRole('navigation', {
        name: 'Members pages',
      }),
    ).toHaveTextContent('42 results');
  });
});
