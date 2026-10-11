import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NavDrawer } from '../../src/chrome/NavDrawer.js';
import { PRIMARY_DESTINATIONS } from '../../src/chrome/destinations.js';

describe('NavDrawer', () => {
  it('opens the drawer and lists destinations', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NavDrawer destinations={PRIMARY_DESTINATIONS} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Quests' })).toHaveAttribute(
      'href',
      '/quests',
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NavDrawer destinations={PRIMARY_DESTINATIONS} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
