import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { graphql, HttpResponse } from 'msw';
import { routes } from '../../../src/features/rules/feature.js';
import { server } from '../../../src/mocks/server.js';
import { editorHarness } from '../editor/editor-test-utils.js';
import good from '../../fixtures/wire/rules/list-good.json';

function renderAt(path: string) {
  const harness = editorHarness(path, '*');
  return render(
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>,
    { wrapper: harness.wrapper },
  );
}

const guide = good.items.find((item) => item.category !== 'ruling')!;
const ruling = good.items.find((item) => item.category === 'ruling')!;

describe('rule detail families', () => {
  it('shows a guide on its guide URL', async () => {
    renderAt(`/rules/guides/${guide.slug}`);
    expect(await screen.findByText(guide.effectiveBody!)).toBeInTheDocument();
    // The way back sits above the title, not under it.
    const back = screen.getByRole('link', { name: 'Rules' });
    const title = screen.getByRole('heading', { level: 1, name: guide.title });
    expect(
      back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Edit guide' })).not.toBeInTheDocument();
  });

  it('does not serve a guide on a ruling URL', async () => {
    renderAt(`/rules/rulings/${guide.slug}`);
    expect(
      await screen.findByText(
        'This ruling may have been removed, or the link is out of date.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute(
      'href',
      '/rules',
    );
    expect(screen.getByRole('link', { name: 'Back to rules' })).toHaveAttribute(
      'href',
      '/rules',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ruling not found' }),
    ).toBeVisible();
    expect(screen.queryByText(guide.effectiveBody!)).not.toBeInTheDocument();
  });

  it('does not serve a ruling on a guide URL', async () => {
    renderAt(`/rules/guides/${ruling.slug}`);
    expect(
      await screen.findByText(
        'This guide may have been removed, or the link is out of date.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a ruling body as Markdown without its front matter', async () => {
    server.use(
      graphql.query('RuleDetail', () =>
        HttpResponse.json({
          data: {
            documentBacklinks: [],
            document: {
              ...ruling,
              status: 'published',
              visibility: 'public',
              effectiveBody:
                '---\nsummary: Cover rules\n---\n- **Half cover** applies\n- Full cover blocks',
            },
          },
        }),
      ),
    );
    renderAt(`/rules/rulings/${ruling.slug}`);
    const item = await screen.findByText('Half cover');
    expect(item.tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(/summary:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('shows only guides linked to the ruling in its reading rail', async () => {
    server.use(
      graphql.query('RulesList', () =>
        HttpResponse.json({
          data: {
            documents: {
              items: [
                ...good.items,
                {
                  ...guide,
                  id: '33333333-3333-4333-8333-333333333333',
                  slug: 'unrelated-guide',
                  title: 'Unrelated guide',
                },
              ],
              total: 3,
            },
          },
        }),
      ),
      graphql.query('RuleDetail', () =>
        HttpResponse.json({
          data: {
            document: ruling,
            documentBacklinks: [{ documentId: guide.id }],
          },
        }),
      ),
    );
    renderAt(`/rules/rulings/${ruling.slug}`);
    expect(await screen.findByText(ruling.effectiveBody!)).toBeVisible();
    // Owner item 16: no side rail; the list sits below the full-width body.
    expect(document.querySelector('.detail-layout__rail')).toBeNull();
    const rail = await screen.findByRole('region', { name: 'Related guides' });
    expect(
      screen.getByText(ruling.effectiveBody!).compareDocumentPosition(rail) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('.reading-column')).toBeNull();
    expect(
      await within(rail).findByRole('link', { name: guide.title }),
    ).toHaveAttribute('href', `/rules/guides/${guide.slug}`);
    expect(
      within(rail).queryByRole('link', { name: ruling.title }),
    ).not.toBeInTheDocument();
    expect(
      within(rail).queryByRole('link', { name: 'Unrelated guide' }),
    ).not.toBeInTheDocument();
  });

  it('gives missing ruling text and related guides an empty state and a next action', async () => {
    server.use(
      graphql.query('RuleDetail', () =>
        HttpResponse.json({
          data: {
            document: { ...ruling, effectiveBody: null },
            documentBacklinks: [],
          },
        }),
      ),
    );
    renderAt(`/rules/rulings/${ruling.slug}`);
    expect(
      await screen.findByText('No ruling text is available for this viewer.'),
    ).toBeVisible();
    expect(
      await screen.findByText('No related guides are available for this ruling yet.'),
    ).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Browse rules' })).toHaveLength(2);
  });

  it('keeps the ruling header and parent link when access is denied', async () => {
    server.use(
      graphql.query('RuleDetail', () =>
        HttpResponse.json({
          errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    renderAt('/rules/rulings/restricted');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to see this');
    expect(screen.getByRole('heading', { level: 1, name: 'Ruling' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute(
      'href',
      '/rules',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
