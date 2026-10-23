import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { NotFoundPage } from '../../../src/features/errors/pages/NotFoundPage.js';
import { renderWithProviders } from '../../test-utils.js';

describe('NotFoundPage', () => {
  it('renders an empty StatePanel below the PageHeader with Home and Search actions', () => {
    renderWithProviders(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    const message = screen.getByText(
      'This page doesn’t exist. It may have moved, or the link may be wrong.',
    );
    expect(message.closest('[data-state="empty"]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Search the chronicle' })).toHaveAttribute(
      'href',
      '/search',
    );
  });
});
