import { act, screen } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CommunityEntryPage } from '../../../src/features/community/pages/CommunityEntryPage.js';
import { routes } from '../../../src/features/community/feature.js';
import { documentHref } from '../../../src/utils/documentHref.js';
import { server } from '../../../src/mocks/server.js';
import entry from '../../fixtures/wire/community/entry-good.json';
import { renderWithProviders } from '../../test-utils.js';

function reader() {
  return renderWithProviders(
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>,
    { route: documentHref(entry) ?? '/' },
  );
}

describe('Community document reader', () => {
  it('does not present a DM table document as a community post', async () => {
    server.use(graphql.query('CommunityEntry', () => HttpResponse.json({ data: { document: { ...entry, category: 'dm_table' } } })));
    reader();
    expect(await screen.findByRole('heading', { name: 'Post not found' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: entry.title })).not.toBeInTheDocument();
  });

  it('opens a non-table community Document through its canonical link', async () => {
    reader();
    expect(await screen.findByRole('heading', { name: entry.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(screen.getByText('stories').tagName).toBe('STRONG');
    const authorLinks = await screen.findAllByRole('link', { name: 'Mira · @mira' });
    expect(authorLinks).toHaveLength(2);
    for (const link of authorLinks) expect(link).toHaveAttribute('href', '/players/@mira');
    expect(screen.getAllByRole('link', { name: 'Community' })).toHaveLength(1);
    expect(screen.queryByText('Back to the community directory')).not.toBeInTheDocument();
  });

  it('loads only a few shared posts from the same author and excludes the current post', async () => {
    let filters: unknown;
    server.use(graphql.query('CommunityEntryRelated', ({ variables }) => {
      filters = variables;
      return HttpResponse.json({ data: { documents: { items: [entry, { ...entry, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', slug: 'another-post', title: 'Another story' }] } } });
    }));
    reader();
    expect(await screen.findByRole('link', { name: 'Another story' })).toHaveAttribute('href', '/community/entries/another-post');
    expect(filters).toEqual({ authorId: entry.authorId });
    expect(screen.queryByRole('link', { name: entry.title })).not.toBeInTheDocument();
  });

  it('uses an actionable empty related-post state', async () => {
    reader();
    expect(await screen.findByText('There are no other shared posts by this author yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find community posts' })).toHaveAttribute('href', '/search?kinds=community');
  });

  it('keeps the post readable when related posts fail and retries only that section', async () => {
    let fail = true;
    server.use(graphql.query('CommunityEntryRelated', () => fail ? HttpResponse.json({ errors: [{ message: 'unavailable', extensions: { code: 'INTERNAL' } }] }) : HttpResponse.json({ data: { documents: { items: [entry] } } })));
    reader();
    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeVisible();
    const retry = await screen.findByRole('button', { name: 'Retry posts' });
    fail = false;
    await act(async () => { retry.click(); });
    expect(await screen.findByText('There are no other shared posts by this author yet.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  it('keeps the loading state until the adapter returns', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('CommunityEntry', async () => {
        await pending;
        return HttpResponse.json({ data: { document: entry } });
      }),
    );
    reader();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    release();
    expect(await screen.findByRole('heading', { name: entry.title })).toBeVisible();
  });

  it('shows the server-supplied empty body state', async () => {
    server.use(
      graphql.query('CommunityEntry', () =>
        HttpResponse.json({ data: { document: { ...entry, effectiveBody: null } } }),
      ),
    );
    reader();
    expect(await screen.findByText('Nothing to read here yet.')).toBeVisible();
  });

  it('hides the prior body when a later read loses permission', async () => {
    const { queryClient } = reader();
    await screen.findByRole('heading', { name: entry.title });
    server.use(
      graphql.query('CommunityEntry', () =>
        HttpResponse.json({
          data: { document: entry },
          errors: [{ message: 'private details', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['communityEntry', entry.slug] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Sign in to see this|You don’t have access to this/,
    );
    expect(screen.queryByText('stories')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: entry.title }),
    ).not.toBeInTheDocument();
  });

  it('handles a missing route identity without requesting an empty slug', async () => {
    let reads = 0;
    server.use(
      graphql.query('CommunityEntry', () => {
        reads += 1;
        return HttpResponse.json({ data: { document: entry } });
      }),
    );
    renderWithProviders(<CommunityEntryPage />);
    expect(
      await screen.findByText(
        "This community post doesn't exist, or it isn't shared with you.",
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Community' })).toHaveAttribute(
      'href',
      '/community',
    );
    expect(reads).toBe(0);
  });

  it('rejects a different Document kind', async () => {
    server.use(
      graphql.query('CommunityEntry', () =>
        HttpResponse.json({ data: { document: { ...entry, kind: 'summary' } } }),
      ),
    );
    reader();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server returned data this screen cannot use.',
    );
    expect(screen.queryByText('stories')).not.toBeInTheDocument();
  });
});
