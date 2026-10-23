import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { routes } from '../../../src/features/codex/feature.js';
import { server } from '../../../src/mocks/server.js';
import entry from '../../fixtures/wire/codex/entry-good.json';
import { renderWithProviders } from '../../test-utils.js';

function Location(): React.JSX.Element {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function renderReader(route: string): void {
  renderWithProviders(
    <>
      <Location />
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </>,
    { route },
  );
}

async function expectReader(): Promise<void> {
  expect(
    await screen.findByRole('heading', { name: entry.document.title }),
  ).toBeVisible();
  expect(screen.getByText(entry.document.effectiveBody)).toBeVisible();
  expect(screen.getByRole('link', { name: 'More Features' })).toHaveAttribute(
    'href',
    '/codex?category=Feature',
  );
  expect(screen.getByText(/^Linked from 3 entries/)).toBeVisible();
  expect(screen.getByLabelText('Current path')).toHaveTextContent(
    '/codex/tree-of-light',
  );
}

describe('Codex document routes', () => {
  it('renders the canonical document body and real backlink count', async () => {
    renderReader('/codex/tree-of-light');
    await expectReader();
  });

  it.each([
    '/codex/npc',
    '/codex/faction',
    '/codex/region',
    '/codex/location',
    '/npcs',
    '/factions',
  ])('converges the %s slug alias on the canonical reader', async (prefix) => {
    server.use(
      graphql.query('CodexEntryById', () => {
        throw new Error('A slug alias must not use the ID lookup');
      }),
    );
    renderReader(`${prefix}/tree-of-light`);
    await expectReader();
  });

  it.each(['/codex/artifact', '/codex/event', '/codex/lore'])(
    'resolves the %s UUID through documentById before opening the real reader',
    async (prefix) => {
      const lookups: unknown[] = [];
      const slugs: unknown[] = [];
      server.use(
        graphql.query('CodexEntryById', ({ variables }) => {
          lookups.push(variables.id);
          return HttpResponse.json({
            data: {
              documentById: {
                id: entry.document.id,
                slug: entry.document.slug,
                kind: entry.document.kind,
              },
            },
          });
        }),
        graphql.query('CodexEntry', ({ variables }) => {
          slugs.push(variables.slug);
          return HttpResponse.json({ data: { codexEntry: entry } });
        }),
      );
      renderReader(`${prefix}/${entry.document.id}`);
      await expectReader();
      expect(lookups).toEqual([entry.document.id]);
      expect(slugs).toEqual(['tree-of-light']);
    },
  );

  it.each([
    ['missing', { data: { documentById: null } }, 'That item could not be found.'],
    [
      'unreadable',
      {
        data: { documentById: null },
        errors: [{ message: 'private detail', extensions: { code: 'FORBIDDEN' } }],
      },
      /Sign in to see this|You don’t have access to this/,
    ],
    [
      'wrong kind',
      { data: { documentById: { ...entry.document, kind: 'summary' } } },
      'That item could not be found.',
    ],
    [
      'invalid wire',
      { data: { documentById: { id: entry.document.id, kind: 'codex_entry' } } },
      'The server returned data this screen cannot use.',
    ],
  ])('does not render or redirect a %s ID alias', async (_label, envelope, message) => {
    let canonicalReads = 0;
    server.use(
      graphql.query('CodexEntryById', () => HttpResponse.json(envelope)),
      graphql.query('CodexEntry', () => {
        canonicalReads += 1;
        return HttpResponse.json({ data: { codexEntry: entry } });
      }),
    );
    const path = `/codex/lore/${entry.document.id}`;
    renderReader(path);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Current path')).toHaveTextContent(path);
    expect(screen.queryByText(entry.document.title)).not.toBeInTheDocument();
    expect(screen.queryByText(entry.document.effectiveBody)).not.toBeInTheDocument();
    expect(canonicalReads).toBe(0);
  });

  it('rejects a malformed UUID alias without querying or treating it as a slug', async () => {
    let reads = 0;
    server.use(
      graphql.query('CodexEntryById', () => {
        reads += 1;
        return HttpResponse.json({ data: { documentById: entry.document } });
      }),
    );
    renderReader('/codex/lore/tree-of-light');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That item could not be found.',
    );
    expect(reads).toBe(0);
    expect(screen.queryByText(entry.document.effectiveBody)).not.toBeInTheDocument();
  });

  it('shows a missing canonical document through the shared reader error state', async () => {
    renderReader('/codex/missing-entry');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That item could not be found.',
    );
    expect(screen.queryByText(entry.document.title)).not.toBeInTheDocument();
    expect(screen.queryByText(entry.document.effectiveBody)).not.toBeInTheDocument();
  });

  it.each(['/codex/tree-of-light', '/codex/npc/tree-of-light'])(
    'preserves unreadable canonical-reader errors at %s',
    async (path) => {
      server.use(
        graphql.query('CodexEntry', () =>
          HttpResponse.json({
            data: { codexEntry: entry },
            errors: [{ message: 'private detail', extensions: { code: 'FORBIDDEN' } }],
          }),
        ),
      );
      renderReader(path);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Sign in to see this|You don’t have access to this/,
      );
      expect(screen.queryByText(entry.document.title)).not.toBeInTheDocument();
      expect(screen.queryByText(entry.document.effectiveBody)).not.toBeInTheDocument();
    },
  );

  it('rejects another kind at the canonical reader boundary', async () => {
    server.use(
      graphql.query('CodexEntry', () =>
        HttpResponse.json({
          data: {
            codexEntry: { ...entry, document: { ...entry.document, kind: 'rule' } },
          },
        }),
      ),
    );
    renderReader('/codex/tree-of-light');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That item could not be found.',
    );
    expect(screen.queryByText(entry.document.title)).not.toBeInTheDocument();
    expect(screen.queryByText(entry.document.effectiveBody)).not.toBeInTheDocument();
  });

  it('lists readable backlinks by title and offers Edit to editors', async () => {
    server.use(
      graphql.query('CodexEntry', () =>
        HttpResponse.json({
          data: {
            codexEntry: {
              ...entry,
              backlinkCount: 2,
              document: { ...entry.document, canEditBody: true },
            },
            documentBacklinks: [
              {
                documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                relation: 'see_also',
              },
              {
                documentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                relation: 'mentions',
              },
            ],
          },
        }),
      ),
      graphql.query('CodexBacklinkDocument', ({ variables }) =>
        HttpResponse.json({
          data: {
            documentById:
              variables.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
                ? {
                    id: variables.id,
                    slug: 'osric-dane',
                    kind: 'codex_entry',
                    category: 'NPC',
                    title: 'Osric Dane',
                  }
                : null,
          },
        }),
      ),
    );
    renderReader('/codex/tree-of-light');
    expect(await screen.findByRole('link', { name: 'Osric Dane' })).toHaveAttribute(
      'href',
      '/codex/osric-dane',
    );
    expect(screen.getByText('NPC · see also')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Edit entry' })).toHaveAttribute(
      'href',
      `/codex/${entry.document.id}/edit`,
    );
  });

  it('hides Edit from readers without edit rights', async () => {
    renderReader('/codex/tree-of-light');
    await expectReader();
    expect(screen.queryByRole('link', { name: 'Edit entry' })).not.toBeInTheDocument();
  });
});
