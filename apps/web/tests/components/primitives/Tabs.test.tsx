import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TabNav, Tabs } from '../../../src/components/primitives/Tabs.js';
import { PageToolbar } from '../../../src/components/primitives/PageToolbar.js';
import { scrollEdges } from '../../../src/components/primitives/useScrollEdges.js';

describe('Tabs', () => {
  it('uses one tab stop and supports wrapped arrows, Home and End with linked panels', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        items={[
          { id: 'one', label: 'Overview', panel: 'Overview content' },
          { id: 'two', label: 'History', panel: 'History content' },
          { id: 'three', label: 'Settings', panel: 'Settings content' },
        ]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Settings' });
    expect(tabs[2]).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('Settings content');
    await user.keyboard('{Home}{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'History' })).toHaveTextContent(
      'History content',
    );
    await user.keyboard('{End}{ArrowRight}');
    expect(tabs[0]).toHaveFocus();
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it('follows a controlled value and reports changes', async () => {
    const user = userEvent.setup();
    function Demo(): React.JSX.Element {
      const [tab, setTab] = useState('dms');
      return (
        <>
          <p>Showing {tab}</p>
          <Tabs
            aria-label="Community sections"
            value={tab}
            onValueChange={setTab}
            items={[
              { id: 'muster', label: 'Muster', panel: 'Muster content' },
              { id: 'dms', label: 'DMs', panel: 'DM content' },
            ]}
          />
        </>
      );
    }
    render(<Demo />);
    expect(screen.getByRole('tablist', { name: 'Community sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'DMs' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Muster' }));
    expect(screen.getByText('Showing muster')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Muster' })).toHaveTextContent('Muster content');
  });

  it('keeps linked panels and keyboard selection when the track is inside a page toolbar', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        aria-label="Community sections"
        items={[
          { id: 'muster', label: 'Free this week', panel: 'Muster content' },
          { id: 'dms', label: 'DMs', panel: 'DM content' },
        ]}
        renderTrack={(track) => <PageToolbar label="Community toolbar" segments={track} count="12 members" />}
      />,
    );
    const toolbar = screen.getByRole('region', { name: 'Community toolbar' });
    const list = screen.getByRole('tablist', { name: 'Community sections' });
    expect(toolbar).toContainElement(list);
    expect(toolbar).toContainElement(screen.getByText('12 members'));
    expect(list).not.toContainElement(screen.getByText('12 members'));
    await user.tab();
    await user.keyboard('{ArrowRight}');
    const tab = screen.getByRole('tab', { name: 'DMs' });
    const panel = screen.getByRole('tabpanel', { name: 'DMs' });
    expect(tab).toHaveFocus();
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('DM content');
    expect(toolbar).not.toContainElement(panel);
  });

  it('Tabs.Nav marks the current route link with aria-current', () => {
    render(
      <MemoryRouter>
        <TabNav
          aria-label="Admin sections"
          items={[
            { to: '/admin/members', label: 'Members', current: true },
            { to: '/admin/world', label: 'World', current: false },
          ]}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'World' })).not.toHaveAttribute('aria-current');
  });

  it('shares one roving tab stop and supports arrow, Home/End, and Tab return for route links', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <button type="button">Before</button>
        <TabNav
          aria-label="Admin sections"
          items={[
            { to: '/admin/members', label: 'Members', current: false },
            { to: '/admin/world', label: 'World', current: true },
            { to: '/admin/roles', label: 'Roles', current: false },
          ]}
        />
        <button type="button">After</button>
      </MemoryRouter>,
    );
    const members = screen.getByRole('link', { name: 'Members' });
    const world = screen.getByRole('link', { name: 'World' });
    const roles = screen.getByRole('link', { name: 'Roles' });
    expect(members).toHaveAttribute('href', '/admin/members');
    expect([members, world, roles].map((link) => link.tabIndex)).toEqual([-1, 0, -1]);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await user.tab();
    expect(world).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(roles).toHaveFocus();
    await user.keyboard('{Home}');
    expect(members).toHaveFocus();
    await user.keyboard('{End}');
    expect(roles).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(roles).toHaveFocus();
  });

  it('uses the shared 40px track, inset 32px indicator, and reduced-motion rule', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');
    expect(css).toMatch(/\.segmented-track \{[\s\S]*?height: var\(--segment-track-size\);[\s\S]*?padding: 3px;/);
    expect(css).toMatch(/\.segmented-pill \{[\s\S]*?height: var\(--segment-highlight-size\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.segmented-pill \{ transition: none;/);
    expect(css).not.toMatch(/pr-tabs__tab|tabs\.list/);
  });
});

describe('tab row overflow', () => {
  it('reports which edges hide tabs', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe('');
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 500, clientWidth: 300 })).toBe('end');
    expect(scrollEdges({ scrollLeft: 100, scrollWidth: 500, clientWidth: 300 })).toBe(
      'start end',
    );
    expect(scrollEdges({ scrollLeft: 200, scrollWidth: 500, clientWidth: 300 })).toBe('start');
  });

  it('keeps the shared segmented track scrollable and the focus ring inside', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');
    const track = css.match(/\.segmented-track \{([^}]*)\}/)?.[1] ?? '';
    expect(track).toContain('overflow-x: auto');
    expect(track).toContain('padding: 3px');
    expect(css).toMatch(/\.segmented-option:focus-visible \{[^}]*outline-offset: -3px;/);
  });
});
