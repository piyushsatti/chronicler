import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../../src/components/primitives/Modal.js';

// Base UI moves focus (initial, Tab wrap, return) one animation frame after
// the triggering event. jsdom's requestAnimationFrame waits ~16ms, so
// assertions right after a user-event step race it. Run frames as macrotasks
// so user-event's own awaits flush them.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Example(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <button onClick={() => setOpen(true)}>Open form</button>
      <Modal open={open} title="Edit profile" onClose={() => setOpen(false)}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button onClick={() => setOpen(false)}>Save profile</button>
      </Modal>
    </>
  );
}

function NestedExample(): React.JSX.Element {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button onClick={() => setOuter(true)}>Open outer</button>
      <Modal open={outer} title="Outer" onClose={() => setOuter(false)}>
        <button onClick={() => setInner(true)}>Open inner</button>
        <Modal open={inner} title="Inner" onClose={() => setInner(false)}>
          <button>Inner action</button>
        </Modal>
      </Modal>
    </>
  );
}

function SiblingExample(): React.JSX.Element {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  return (
    <>
      <button onClick={() => setFirst(true)}>Open first</button>
      {first ? (
        <Modal open title="First" onClose={() => setFirst(false)}>
          <button onClick={() => setSecond(true)}>Open second</button>
        </Modal>
      ) : null}
      <Modal open={second} title="Second" onClose={() => setSecond(false)}>
        <button onClick={() => setFirst(false)}>Remove underlying dialog</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('contains keyboard focus, preserves typing focus and restores its opener', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const opener = screen.getByRole('button', { name: 'Open form' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Save profile' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    await user.keyboard('Ada');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ada');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps focus and Escape in the inner dialog and restores each opener in order', async () => {
    const user = userEvent.setup();
    render(<NestedExample />);
    const outerOpener = screen.getByRole('button', { name: 'Open outer' });
    await user.click(outerOpener);
    const innerOpener = screen.getByRole('button', { name: 'Open inner' });
    await user.click(innerOpener);
    const inner = screen.getByRole('dialog', { name: 'Inner' });
    const innerClose = within(inner).getByRole('button', { name: 'Close' });
    expect(innerClose).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(inner).getByRole('button', { name: 'Inner action' })).toHaveFocus();
    await user.tab();
    expect(innerClose).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    expect(innerOpener).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(outerOpener).toHaveFocus();
  });

  it('does not steal focus when an underlying sibling unmounts and retains the surviving opener', async () => {
    const user = userEvent.setup();
    render(<SiblingExample />);
    const opener = screen.getByRole('button', { name: 'Open first' });
    await user.click(opener);
    const secondOpener = screen.getByRole('button', { name: 'Open second' });
    await user.click(secondOpener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Second' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument();
    expect(secondOpener).toHaveFocus();
    await user.click(secondOpener);
    const second = screen.getByRole('dialog', { name: 'Second' });
    expect(within(second).getByRole('button', { name: 'Close' })).toHaveFocus();
    const remove = within(second).getByRole('button', {
      name: 'Remove underlying dialog',
    });
    await user.click(remove);
    expect(screen.queryByRole('dialog', { name: 'First' })).not.toBeInTheDocument();
    expect(remove).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
