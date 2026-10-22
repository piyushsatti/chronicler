import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDateFormatter } from '../../src/hooks/useDateFormatter.js';
import { useTheme } from '../../src/context/ThemeContext.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../src/context/theme.utils.js';
import { renderWithProviders } from '../test-utils.js';
function Probe() {
  const { formatDate, formatDateTime } = useDateFormatter();
  const { setPreferences } = useTheme();
  return (
    <>
      <p>{formatDate('2026-03-08T04:30:00Z')}</p>
      <p>{formatDateTime('2026-03-08T04:30:00Z')}</p>
      <p>{formatDate('2026-03-08')}</p>
      <input
        aria-label="Unchanged local input"
        type="datetime-local"
        defaultValue="2026-03-08T01:30"
      />
      <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
        Change zone
      </button>
    </>
  );
}
describe('saved timezone formatter', () => {
  it('loads saved preferences and updates mounted output without changing civil dates or local input', async () => {
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(<Probe />);
    expect(await screen.findByText('07 Mar 2026')).toBeVisible();
    expect(screen.getByText('08 Mar 2026')).toBeVisible();
    expect(screen.getByText(/23:30/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change zone' }));
    expect(screen.getAllByText('08 Mar 2026')).toHaveLength(2);
    expect(screen.getByText(/10:00/)).toBeVisible();
    expect(screen.queryByText('2026-03-08')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unchanged local input')).toHaveValue(
      '2026-03-08T01:30',
    );
  });
});
