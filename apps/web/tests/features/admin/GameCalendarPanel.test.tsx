import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { beforeEach, expect, it } from 'vitest';
import { GameCalendarPanel } from '../../../src/features/admin/components/GameCalendarPanel.js';
import { useGameCalendarPanel } from '../../../src/features/admin/hooks/useGameCalendarPanel.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

function Panel() {
  return <GameCalendarPanel view={useGameCalendarPanel()} />;
}

let saved: unknown[];
beforeEach(() => {
  signIn();
  saved = [];
  server.use(
    graphql.query('AdminGameCalendar', () =>
      HttpResponse.json({ data: { gameCalendar: { definition: null, currentGameDay: null } } }),
    ),
    graphql.mutation('UpdateGameCalendar', ({ variables }) => {
      saved.push(variables.definition);
      return HttpResponse.json({ data: { updateGameCalendar: { definition: variables.definition } } });
    }),
  );
});

function periods() {
  return within(screen.getByRole('list', { name: 'Periods' }));
}

it('saves a month added to a world with no calendar', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await user.type(await screen.findByRole('textbox', { name: 'Era name' }), 'Pi Era');
  await user.type(screen.getByRole('textbox', { name: 'Abbrev' }), 'PI');
  await user.click(screen.getByRole('button', { name: 'Add period' }));
  const row = within(periods().getByRole('listitem', { name: 'Period 1' }));
  await user.type(row.getByRole('textbox', { name: 'Name' }), 'Thaw');
  await user.type(row.getByRole('spinbutton', { name: 'Days' }), '30');
  await user.click(screen.getByRole('button', { name: 'Save calendar' }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toEqual({
    era: { name: 'Pi Era', abbrev: 'PI' },
    periods: [{ name: 'Thaw', type: 'month', days: 30 }],
  });
});

it('explains missing periods and out-of-range days inline and blocks the save', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  expect(await screen.findByText('Add at least one period.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save calendar' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add period' }));
  expect(screen.queryByText('Add at least one period.')).toBeNull();
  const row = within(periods().getByRole('listitem', { name: 'Period 1' }));
  await user.type(row.getByRole('textbox', { name: 'Name' }), 'Thaw');
  await user.type(row.getByRole('spinbutton', { name: 'Days' }), '0');
  expect(row.getByText('Days must be a whole number from 1 to 366.')).toBeVisible();
  expect(row.getByRole('spinbutton', { name: 'Days' })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: 'Save calendar' })).toBeDisabled();
  expect(saved).toHaveLength(0);
});

it('fills the period rows from the Greyhawk preset and reorders and removes rows', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await user.click(await screen.findByRole('button', { name: 'Load Greyhawk preset' }));
  expect(periods().getAllByRole('listitem')).toHaveLength(16);
  const first = within(periods().getByRole('listitem', { name: 'Period 1' }));
  expect(first.getByRole('textbox', { name: 'Name' })).toHaveValue('Needfest');
  expect(first.getByRole('button', { name: /^Type/ })).toHaveTextContent('Festival');
  expect(first.getByRole('spinbutton', { name: 'Days' })).toHaveValue(7);
  await user.click(first.getByRole('button', { name: 'Move Needfest down' }));
  expect(
    within(periods().getByRole('listitem', { name: 'Period 1' })).getByRole('textbox', { name: 'Name' }),
  ).toHaveValue('Fireseek');
  await user.click(
    within(periods().getByRole('listitem', { name: 'Period 1' })).getByRole('button', { name: 'Remove Fireseek' }),
  );
  expect(periods().getAllByRole('listitem')).toHaveLength(15);
  await user.click(screen.getByRole('button', { name: 'Save calendar' }));
  await waitFor(() => expect(saved).toHaveLength(1));
  const definition = saved[0] as { periods: { name: string }[] };
  expect(definition.periods[0]).toEqual({ name: 'Needfest', type: 'festival', days: 7 });
  expect(definition.periods).toHaveLength(15);
});

it('surfaces the API rejection when the server refuses a definition the editor allowed', async () => {
  server.use(
    graphql.mutation('UpdateGameCalendar', () =>
      HttpResponse.json({
        errors: [{ message: 'invalid calendar definition', extensions: { code: 'INVALID' } }],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await user.type(await screen.findByRole('textbox', { name: 'Era name' }), 'Pi Era');
  await user.type(screen.getByRole('textbox', { name: 'Abbrev' }), 'PI');
  await user.click(screen.getByRole('button', { name: 'Add period' }));
  const row = within(periods().getByRole('listitem', { name: 'Period 1' }));
  await user.type(row.getByRole('textbox', { name: 'Name' }), 'Thaw');
  await user.type(row.getByRole('spinbutton', { name: 'Days' }), '30');
  await user.click(screen.getByRole('button', { name: 'Save calendar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The server rejected this calendar. Check the era name, abbreviation and periods, then save again.',
  );
});

it('requires the era inline whenever the save writes periods', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await user.click(await screen.findByRole('button', { name: 'Add period' }));
  const row = within(periods().getByRole('listitem', { name: 'Period 1' }));
  await user.type(row.getByRole('textbox', { name: 'Name' }), 'Thaw');
  await user.type(row.getByRole('spinbutton', { name: 'Days' }), '30');
  expect(screen.getByText('Enter an era name.')).toBeVisible();
  expect(screen.getByText('Enter an era abbreviation.')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Era name' })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: 'Save calendar' })).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Era name' }), 'Pi Era');
  await user.type(screen.getByRole('textbox', { name: 'Abbrev' }), 'P'.repeat(33));
  expect(screen.queryByText('Enter an era name.')).toBeNull();
  expect(screen.getByText('Era abbreviations can be at most 32 characters.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save calendar' })).toBeDisabled();
  await user.clear(screen.getByRole('textbox', { name: 'Abbrev' }));
  await user.type(screen.getByRole('textbox', { name: 'Abbrev' }), 'PI');
  expect(screen.getByRole('button', { name: 'Save calendar' })).toBeEnabled();
  expect(saved).toHaveLength(0);
});

it('converts a legacy months calendar to periods when only the era is edited', async () => {
  server.use(
    graphql.query('AdminGameCalendar', () =>
      HttpResponse.json({
        data: {
          gameCalendar: {
            definition: {
              epoch: 'Old Era',
              months: [
                { name: 'Deepwinter', days: 30 },
                { name: 'Thaw', days: 31 },
              ],
            },
            currentGameDay: 3,
          },
        },
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await screen.findByRole('list', { name: 'Periods' });
  expect(
    periods()
      .getAllByRole('textbox', { name: 'Name' })
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual(['Deepwinter', 'Thaw']);
  await user.type(screen.getByRole('textbox', { name: 'Era name' }), 'Pi Era');
  await user.type(screen.getByRole('textbox', { name: 'Abbrev' }), 'PI');
  await user.click(screen.getByRole('button', { name: 'Save calendar' }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toEqual({
    epoch: 'Old Era',
    era: { name: 'Pi Era', abbrev: 'PI' },
    periods: [
      { name: 'Deepwinter', type: 'month', days: 30 },
      { name: 'Thaw', type: 'month', days: 31 },
    ],
  });
});

it('names row controls after their period and keeps focus with the moved or next row', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Panel />);
  await user.click(await screen.findByRole('button', { name: 'Load Greyhawk preset' }));
  expect(screen.getByRole('button', { name: 'Move Needfest up' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Move Needfest down' }));
  expect(screen.getByRole('button', { name: 'Move Needfest down' })).toHaveFocus();
  expect(
    within(periods().getByRole('listitem', { name: 'Period 2' })).getByRole('textbox', { name: 'Name' }),
  ).toHaveValue('Needfest');
  await user.click(screen.getByRole('button', { name: 'Move Needfest up' }));
  // Back at the top edge "Move up" is disabled, so focus stays on the row's other move control.
  expect(screen.getByRole('button', { name: 'Move Needfest down' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Remove Needfest' }));
  expect(screen.getByRole('button', { name: 'Remove Fireseek' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Remove Sunsebb' }));
  expect(screen.getByRole('button', { name: "Remove Ready'reat" })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Add period' }));
  expect(screen.getByRole('button', { name: 'Remove period 15' })).toBeVisible();
});
