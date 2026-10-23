import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
