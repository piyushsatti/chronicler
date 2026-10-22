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
      <PageShell eyebrow="Inbox" title="Notifications" max="wide">
        <p>Body</p>
      </PageShell>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Notifications' });
    const shell = title.parentElement;
    expect(shell).toHaveClass('page-shell');
    expect(shell).toHaveAttribute('data-max', 'wide');
    expect(shell?.firstElementChild).toHaveTextContent('Inbox');
  });

  it('keeps the no-context shell full width inside the flex main', () => {
    // main[data-shell-main] is a column flex container; auto margins alone
    // shrink the shell to its content (RC1), so it must declare a width.
    expect(css('base.css')).toMatch(/\.page-shell \{[^}]*inline-size: 100%/);
    expect(css('shell.css')).toMatch(/\.page,\s*\.page-shell,/);
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
    expect(title.closest('.page-shell')).not.toBeNull();
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
    expect(title.closest('.page-shell')).not.toBeNull();
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
