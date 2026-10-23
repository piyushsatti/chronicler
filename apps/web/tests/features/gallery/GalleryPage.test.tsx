import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from '../../../src/features/gallery/pages/GalleryPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from '../admin/authority-test-utils.js';

afterEach(() => vi.unstubAllEnvs());

describe('Gallery reference', () => {
  it('keeps every reference section reachable without an empty duplicate tab', async () => {
    signIn();
    renderWithProviders(<GalleryPage />, { route: '/gallery' });
    const sections = await screen.findByRole('tablist', { name: 'Gallery sections' });
    expect(within(sections).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Primitives', 'Identity', 'Motion', 'Effects',
    ]);
    expect(screen.getByRole('list', { name: 'Primitives examples' }).children).toHaveLength(33);
    expect(screen.getByRole('region', { name: 'Page header example' })).toHaveTextContent('Example');

    await userEvent.click(within(sections).getByRole('tab', { name: 'Identity' }));
    expect(screen.getByRole('list', { name: 'Identity examples' }).children).toHaveLength(3);
    expect(screen.getByRole('heading', { name: /^Identity presentation$/ })).toBeInTheDocument();

    await userEvent.click(within(sections).getByRole('tab', { name: 'Motion' }));
    expect(screen.getByRole('region', { name: 'Motion catalog' })).toBeInTheDocument();
    expect(screen.getByText('1 example')).toBeInTheDocument();
    await userEvent.click(within(sections).getByRole('tab', { name: 'Effects' }));
    expect(screen.getByRole('region', { name: 'Ambient effects catalog' })).toBeInTheDocument();
    expect(screen.getByText('1 example')).toBeInTheDocument();
  });

  it('narrows the reference to an interactive example and restores all examples', async () => {
    signIn();
    renderWithProviders(<GalleryPage />, { route: '/gallery' });
    const picker = await screen.findByRole('button', { name: /^Show example/ });
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Modal$/ }));
    expect(screen.getByRole('list', { name: 'Primitives examples' }).children).toHaveLength(1);
    expect(screen.getByText('1 of 33 examples')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(screen.getByRole('dialog', { name: 'Gallery modal' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Gallery modal' })).not.toBeInTheDocument();
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^All examples$/ }));
    expect(screen.getByRole('list', { name: 'Primitives examples' }).children).toHaveLength(33);
  });

  it('sends production visits to not found before mounting staff reference content', async () => {
    vi.stubEnv('DEV', false);
    renderWithProviders(
      <Routes>
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/404" element={<h1>Page not found</h1>} />
      </Routes>,
      { route: '/gallery' },
    );
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Gallery sections' })).not.toBeInTheDocument();
  });
});
