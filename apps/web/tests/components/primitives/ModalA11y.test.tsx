import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Modal } from '../../../src/components/primitives/Modal.js';

function Nested(): React.JSX.Element {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <main>
      <button onClick={() => setOuter(true)}>Open outer</button>
      <Modal
        open={outer}
        title="Outer"
        description="Outer description"
        onClose={() => setOuter(false)}
      >
        <button onClick={() => setInner(true)}>Open inner</button>
        <Modal open={inner} title="Inner" onClose={() => setInner(false)}>
          <p>Inner body</p>
        </Modal>
      </Modal>
    </main>
  );
}

describe('Modal accessibility (Base UI Dialog)', () => {
  it('portals to body, labels and describes the dialog, hides the background and locks scroll', async () => {
    const user = userEvent.setup();
    const { container } = render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Open outer' }));
    const dialog = screen.getByRole('dialog', { name: 'Outer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Outer description');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('[data-component="Modal"]')).not.toBeNull();
    // Background is removed from the accessibility tree while the dialog is open.
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Open outer' })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-base-ui-scroll-locked');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open outer' })).toHaveFocus());
  });

  it('Escape closes only the top dialog of a nested stack', async () => {
    const user = userEvent.setup();
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Open outer' }));
    const outer = screen.getByRole('dialog', { name: 'Outer' });
    const innerOpener = within(outer).getByRole('button', { name: 'Open inner' });
    await user.click(innerOpener);
    await screen.findByRole('dialog', { name: 'Inner' });
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    await waitFor(() => expect(innerOpener).toHaveFocus());
  });

  it('closes from the Close button and the backdrop', async () => {
    const user = userEvent.setup();
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Open outer' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open outer' }));
    await screen.findByRole('dialog', { name: 'Outer' });
    const backdrop = document.querySelector('.pr-modal__backdrop');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
