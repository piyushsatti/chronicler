import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs } from '../../../src/components/primitives/Tabs.js';

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
});
