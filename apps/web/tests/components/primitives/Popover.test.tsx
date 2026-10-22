import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Popover } from '../../../src/components/primitives/Popover.js';

function Example(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>Outside text</p>
      <Popover open={open} onOpenChange={setOpen} ariaLabel="Filters" trigger="Filters">
        <label>
          Keyword
          <input />
        </label>
      </Popover>
    </>
  );
}

describe('Popover', () => {
  it('moves focus into the popup and returns it to the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Filters' });
    await user.click(trigger);
    const popup = screen.getByRole('dialog', { name: 'Filters' });
    expect(popup).toHaveClass('pop-content');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Keyword' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('portals the popup outside the trigger subtree and closes on outside press', async () => {
    const user = userEvent.setup();
    const { container } = render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const popup = screen.getByRole('dialog', { name: 'Filters' });
    expect(container.contains(popup)).toBe(false);
    await user.click(screen.getByText('Outside text'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
