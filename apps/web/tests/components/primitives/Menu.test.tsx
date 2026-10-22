import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from '../../../src/components/primitives/Menu.js';

const names = ['Apple', 'Banana', 'Cherry', 'Damson'];

function setup(onSelect = vi.fn()) {
  const user = userEvent.setup();
  render(
    <Menu
      ariaLabel="Fruit"
      trigger="Pick fruit"
      className="hf2"
      itemClassName="pf-opt"
      items={names.map((name) => ({ key: name, label: name, onSelect: () => onSelect(name) }))}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Pick fruit' });
  return { user, trigger, onSelect };
}

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  trigger.focus();
  await user.keyboard('{Enter}');
  const menu = await screen.findByRole('menu', { name: 'Fruit' });
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Apple' })).toHaveFocus());
  return menu;
}

describe('Menu', () => {
  it('renders the menu skin and caller item classes', async () => {
    const { user, trigger } = setup();
    expect(trigger).toHaveClass('pop-trigger');
    const menu = await openWithKeyboard(user, trigger);
    expect(menu).toHaveClass('pop-content', 'hf2');
    expect(menu).toHaveAttribute('data-variant', 'menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByRole('menuitem', { name: 'Apple' })).toHaveClass('pf-opt');
  });

  it('moves with ArrowDown/ArrowUp and Home/End', async () => {
    const { user, trigger } = setup();
    await openWithKeyboard(user, trigger);
    const item = (name: string) => screen.getByRole('menuitem', { name });
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(item('Banana')).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(item('Apple')).toHaveFocus());
    await user.keyboard('{End}');
    await waitFor(() => expect(item('Damson')).toHaveFocus());
    await user.keyboard('{Home}');
    await waitFor(() => expect(item('Apple')).toHaveFocus());
  });

  it('jumps by typeahead', async () => {
    const { user, trigger } = setup();
    await openWithKeyboard(user, trigger);
    await user.keyboard('c');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Cherry' })).toHaveFocus());
  });

  it('selects with Enter, closes and returns focus to the trigger', async () => {
    const { user, trigger, onSelect } = setup();
    await openWithKeyboard(user, trigger);
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Banana' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('Banana'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger, onSelect } = setup();
    await openWithKeyboard(user, trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the empty label when there are no items', async () => {
    const user = userEvent.setup();
    render(
      <Menu ariaLabel="Regions" trigger="Add region" items={[]} emptyLabel={<p>No more regions</p>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Add region' }));
    expect(await screen.findByText('No more regions')).toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});
