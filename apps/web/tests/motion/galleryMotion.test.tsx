import { HttpResponse } from 'msw';
import { signIn, mockGraphqlOps } from '../features/admin/authority-test-utils.js';
import goodMe from '../fixtures/wire/me/good.json';
import { GalleryPage } from '../../src/features/gallery/pages/GalleryPage.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils.js';
import { Motion } from '../../src/features/gallery/sections/Motion.js';
import { Effects } from '../../src/features/gallery/sections/Effects.js';
import { Cosmetics } from '../../src/features/gallery/sections/Cosmetics.js';
import { LAUNCH_MOTION_IDS } from '../../src/motion/catalog.js';

describe('Actual Gallery presentation demos', () => {
  it('renders all retained launch cues and the event cue beside their static pair', async () => {
    const { container } = renderWithProviders(<Motion />);
    const expected = [...LAUNCH_MOTION_IDS, 'quest-publish-burst'].sort();
    expect(
      [...container.querySelectorAll('[data-motion-demo]')]
        .map((node) => node.getAttribute('data-motion-demo'))
        .sort(),
    ).toEqual(expected);
    expect(
      [...container.querySelectorAll('[data-motion-demo-collapse]')]
        .map((node) => node.getAttribute('data-motion-demo-collapse'))
        .sort(),
    ).toEqual(expected);
    expect(
      container.querySelector(
        '[data-motion-demo="quest-publish-burst"] [data-active="1"]',
      ),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Play publish cue' }));
    const cue = container.querySelector(
      '[data-motion-demo="quest-publish-burst"] [data-active="1"]',
    );
    expect(cue).not.toBeNull();
    fireEvent.animationEnd(cue!);
    expect(
      container.querySelector(
        '[data-motion-demo="quest-publish-burst"] [data-active="1"]',
      ),
    ).toBeNull();
  });
  it('replays with the keyboard and exercises the actual phase selector', async () => {
    const { container } = renderWithProviders(<Motion />);
    const section = screen.getByLabelText('route-crossfade-lift');
    const original = container.querySelector(
      '[data-motion-demo="route-crossfade-lift"]',
    );
    within(section).getByRole('button', { name: 'Replay' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        container.querySelector('[data-motion-demo="route-crossfade-lift"]'),
      ).not.toBe(original),
    );
    await userEvent.click(
      within(section).getByRole('button', { name: 'Switch phase' }),
    );
    expect(
      container.querySelector(
        '[data-motion-demo="route-crossfade-lift"] [data-phase="out"]',
      ),
    ).not.toBeNull();
  });
  it('renders real ambient and role/selection samples, with no unavailable product drivers', () => {
    const { container } = renderWithProviders(
      <>
        <Effects />
        <Cosmetics />
      </>,
    );
    expect(container.querySelectorAll('[data-effect-demo]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-effect-demo-collapse]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-cosmetic-demo]')).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: /^Background effect/ }),
    ).toBeInTheDocument();
  });
  it('offers every readable effect choice and applies the selected preference', async () => {
    renderWithProviders(<Effects />);
    const picker = screen.getByRole('button', { name: /^Background effect/ });
    await userEvent.click(picker);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'None', 'Starfield', 'Glow pulse', 'Gradient sweep',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: /^Glow pulse$/ }));
    expect(picker).toHaveTextContent('Glow pulse');
    expect(document.documentElement).toHaveAttribute('data-bg-effect', 'glow-pulse');
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^None$/ }));
    expect(picker).toHaveTextContent('None');
    expect(document.documentElement).toHaveAttribute('data-bg-effect', 'none');
  });
  it('opens the retained Gallery for a server-admitted configured owner without stored roles', async () => {
    signIn([]);
    mockGraphqlOps(
      {
        CurrentAdminAccess: () =>
          HttpResponse.json({ data: { adminOperations: { activeAlertCount: 0 } } }),
      },
      { ...goodMe, roles: [] },
    );
    renderWithProviders(<GalleryPage />, { route: '/gallery' });
    expect(await screen.findByRole('heading', { name: 'Gallery' })).toBeInTheDocument();
  });
  it('keeps denied members outside Gallery content', async () => {
    signIn(['player']);
    renderWithProviders(<GalleryPage />, { route: '/gallery' });
    expect(await screen.findByRole('alert')).toHaveTextContent('The gallery is for staff');
    expect(screen.queryByRole('heading', { name: 'Gallery' })).not.toBeInTheDocument();
  });
});
