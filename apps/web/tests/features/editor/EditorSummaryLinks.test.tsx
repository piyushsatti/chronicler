import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EditorSummaryLinks } from '../../../src/features/editor/EditorSummaryLinks.js';

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [characterId, setCharacter] = useState<string | null>('prior');
  const page = { total: 1, offset: 0, loading: false, error: null, retry: vi.fn(), previous: vi.fn(), next: vi.fn() };
  return <EditorSummaryLinks disabled={disabled} view={{
    active: true, editable: true, search: '', setSearch: vi.fn(), selected: [], add: vi.fn(), remove: vi.fn(), characterId, setCharacter,
    quests: { ...page, items: [] },
    characters: { ...page, items: [{ id: 'lyra', name: 'Lyra', shortCode: 'C1' }] },
  }} />;
}

it('preserves an off-page current character and changes through the menu including no character', async () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: /^Summary character/ });
  expect(trigger).toHaveTextContent('Current selected character');
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Lyra' }));
  expect(trigger).toHaveTextContent('Lyra');
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'No character (owning DM)' }));
  expect(trigger).toHaveTextContent('No character (owning DM)');
});

it('disables the summary character menu with the editor fieldset', () => {
  render(<Harness disabled />);
  expect(screen.getByRole('button', { name: /^Summary character/ })).toBeDisabled();
});
