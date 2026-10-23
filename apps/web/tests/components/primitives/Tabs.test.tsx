import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TabNav, Tabs } from '../../../src/components/primitives/Tabs.js';
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

  it('has one skin: the top-nav pill, active filled with ink', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');
    expect(css).toMatch(
      /\.tabs\[data-component\] \.tabs__tab:is\(\[aria-selected='true'\], \[aria-current='page'\]\) \{\s*background: var\(--color-text\);\s*color: var\(--color-bg-deep\);/,
    );
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

  it('scrolls instead of clipping, keeps the focus ring inside, and fades the hidden edge', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');
    const list = css.match(/\.tabs\[data-component\] > \.tabs__list \{([^}]*)\}/)?.[1] ?? '';
    expect(list).toContain('overflow-x: auto');
    expect(list).toContain('padding: var(--sp-1)');
    expect(css).toMatch(/\.tabs__list\[data-overflow='end'\] \{\s*mask-image/);
  });
});
