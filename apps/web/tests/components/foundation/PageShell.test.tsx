import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageShell } from '../../../src/components/foundation/PageShell.js';
import { NotFoundPage } from '../../../src/features/errors/pages/NotFoundPage.js';
import { WelcomePage } from '../../../src/features/onboarding/pages/WelcomePage.js';
import { renderWithProviders } from '../../test-utils.js';

const css = (file: string): string =>
  readFileSync(join(process.cwd(), 'src/styles', file), 'utf8');

describe('PageShell', () => {
  it('renders the eyebrow above the title inside the page container', () => {
    render(
      <PageShell eyebrow="Inbox" title="Notifications">
        <p>Body</p>
      </PageShell>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Notifications' });
    const header = title.closest('.page-header');
    expect(header?.firstElementChild).toHaveTextContent('Inbox');
    expect(title.closest('.page')).not.toBeNull();
  });

  it('renders the same frame with and without a context; context only adds ctx-*', () => {
    const { container: plain } = render(<PageShell title="A">x</PageShell>);
    const { container: ctx } = render(
      <PageShell title="B" context="tavern" max="wide" className="hf2">
        x
      </PageShell>,
    );
    const plainRoot = plain.firstElementChild;
    const ctxRoot = ctx.firstElementChild;
    expect(plainRoot).toHaveClass('page-root');
    expect(ctxRoot).toHaveClass('page-root', 'ctx-tavern', 'hf2');
    for (const root of [plainRoot, ctxRoot]) {
      const frame = root?.firstElementChild;
      expect(frame).toHaveClass('page');
      // `max` is accepted for old call sites but there is one width.
      expect(frame).not.toHaveAttribute('data-max');
    }
  });

  it('reads the frame width and gutters from layout tokens only', () => {
    // main[data-shell-main] is a column flex container; auto margins alone
    // shrink the frame to its content (RC1), so it must declare a width.
    expect(css('base.css')).toMatch(
      /\.page \{[^}]*inline-size: 100%;[^}]*max-inline-size: var\(--page-max\)/,
    );
    expect(css('tokens.css')).toMatch(/--page-max: 73\.75rem/);
    expect(css('atlas.css')).not.toMatch(/\.page\[data-max/);
    expect(css('atlas-vendor/atlas-components.css')).not.toMatch(/\.hf2 \.page \{/);
    expect(css('shell.css')).toMatch(/:root:has\(\.site-chrome\) \{\s*scrollbar-gutter: stable/);
  });

  it('strips bullets only from layout lists, not Markdown prose', () => {
    expect(css('layout.css')).toMatch(/ul\.stack,\s*ol\.stack \{[^}]*list-style: none/);
    expect(css('atlas-content.css')).toMatch(/\.cr-prose ul \{ list-style: disc/);
    expect(css('atlas-content.css')).toMatch(/li::marker \{ color: var\(--color-text-3\)/);
  });
});

describe('pages render inside PageShell with a title', () => {
  it('NotFound', () => {
    renderWithProviders(<NotFoundPage />, { route: '/nope' });
    const title = screen.getByRole('heading', { level: 1, name: 'Page not found' });
    expect(title.closest('.page')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Search the chronicle' })).toHaveAttribute(
      'href',
      '/search',
    );
  });

  it('Welcome', () => {
    renderWithProviders(<WelcomePage />, { route: '/welcome' });
    const title = screen.getByRole('heading', {
      level: 1,
      name: 'Find your place at the table',
    });
    expect(title.closest('.page')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Continue with Discord' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Browse as guest' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
