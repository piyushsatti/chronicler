import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { lazyElement } from '../../src/chrome/lazyElement.js';

describe('lazyElement', () => {
  it('shows a skeleton inside the page shell while the route chunk loads', () => {
    const { container } = render(lazyElement(() => new Promise(() => undefined)));
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    expect(
      container.querySelector('.page-shell [data-component="Skeleton"]'),
    ).not.toBeNull();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('renders the page once it loads', async () => {
    render(lazyElement(async () => ({ default: () => <h1>Loaded page</h1> })));
    expect(
      await screen.findByRole('heading', { name: 'Loaded page' }),
    ).toBeInTheDocument();
  });
});
