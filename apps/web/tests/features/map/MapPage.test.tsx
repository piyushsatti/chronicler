import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { renderWithProviders } from '../../test-utils.js';

describe('MapPage', () => {
  it('exposes map page host and hexes region under compact viewport', async () => {
    renderWithProviders(<MapPage />);
    expect(
      await screen.findByRole('heading', { name: 'Map' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: /hex/i })).toBeInTheDocument();
    const host = document.querySelector('[data-page="map"]');
    expect(host).toBeTruthy();
    expect(host).toHaveAttribute('data-page-arrangement', 'single-pane');
    expect(document.querySelector('[data-page-region="hexes"]')).toBeTruthy();
    expect(document.querySelector('[data-page-region="features"]')).toBeNull();
  });
});

