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
  it('opens a non-table community Document through its canonical link', async () => {
    reader();
    expect(await screen.findByRole('heading', { name: entry.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(screen.getByText('stories').tagName).toBe('STRONG');
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
    expect(await screen.findByText('No body available for this viewer.')).toBeVisible();
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
    expect(screen.getByRole('link', { name: '← Community' })).toHaveAttribute(
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
