import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EditorSummaryLinks } from '../../../src/features/editor/EditorSummaryLinks.js';
import { MemoryRouter } from 'react-router-dom';

function Harness({
  disabled = false,
  readOnly = false,
  hiddenLinks = false,
}: {
  disabled?: boolean;
  readOnly?: boolean;
  hiddenLinks?: boolean;
}) {
  const [characterId, setCharacter] = useState<string | null>('prior');
  const page = {
    total: 1,
    offset: 0,
    loading: false,
    error: null,
    retry: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
  };
  return (
    <MemoryRouter>
      <EditorSummaryLinks
        disabled={disabled}
        view={{
          active: true,
          editable: !readOnly,
          hiddenLinks,
          search: '',
          setSearch: vi.fn(),
          selected: readOnly
            ? [{ id: 'quest', title: 'Visible linked quest', shortCode: 'Q1' }]
            : [],
          add: vi.fn(),
          remove: vi.fn(),
          characterId,
          setCharacter,
          quests: { ...page, items: [] },
          characters: {
            ...page,
            items: [{ id: 'lyra', name: 'Lyra', shortCode: 'C1' }],
          },
        }}
      />
    </MemoryRouter>
  );
}

it('preserves an off-page current character and changes through the menu including no character', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByText('Choose quests and character'));
  const trigger = screen.getByRole('button', { name: /^Summary character/ });
  expect(trigger).toHaveTextContent('Current selected character');
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Lyra' }));
  expect(trigger).toHaveTextContent('Lyra');
  await userEvent.click(trigger);
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'No character (owning DM)' }),
  );
  expect(trigger).toHaveTextContent('No character (owning DM)');
});

it('disables the summary character menu with the editor fieldset', () => {
  render(<Harness disabled />);
  fireEvent.click(screen.getByText('Choose quests and character'));
  expect(screen.getByRole('button', { name: /^Summary character/ })).toBeDisabled();
});

it('opens the collapsed linking controls and focuses the quest search from the empty state', async () => {
  render(<Harness />);
  const search = screen.getByRole('textbox', { name: 'Find a quest' });
  expect(search.closest('details')).not.toHaveAttribute('open');
  await userEvent.click(screen.getByRole('button', { name: 'Find a quest' }));
  expect(search.closest('details')).toHaveAttribute('open');
  expect(search).toHaveFocus();
  expect(screen.getByRole('button', { name: /^Summary character/ })).toBeVisible();
});

it('shows readable linked quests without claiming hidden account data when nothing is missing', () => {
  render(<Harness readOnly />);
  expect(screen.getByRole('link', { name: 'Visible linked quest' })).toHaveAttribute(
    'href',
    '/quests/Q1',
  );
  expect(screen.queryByText(/hidden from your account/)).not.toBeInTheDocument();
  expect(
    screen.getByText('Existing quest and character links are kept when you save.'),
  ).toBeVisible();
});

it('explains hidden linked quests only when the source reports missing access', () => {
  render(<Harness readOnly hiddenLinks />);
  expect(
    screen.getByText(/Some linked quests are hidden from your account/),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Visible linked quest' })).toBeVisible();
});
