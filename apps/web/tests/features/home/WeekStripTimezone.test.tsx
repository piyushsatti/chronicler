import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekStrip } from '../../../src/features/home/components/WeekStrip.js';
import { useTheme } from '../../../src/context/ThemeContext.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';
import { renderWithProviders } from '../../test-utils.js';
function ZoneControl() {
  const { setPreferences } = useTheme();
  return (
    <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
      Change zone
    </button>
  );
}
afterEach(() => vi.useRealTimers());
describe('WeekStrip zoned civil days', () => {
  it('groups today and sessions across midnight and the spring DST gap, then reacts to preference changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-08T04:30:00Z'));
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(
      <>
        <WeekStrip
          quests={[
            { scheduledAt: '2026-03-08T04:45:00Z' },
            { scheduledAt: '2026-03-08T06:30:00Z' },
            { scheduledAt: '2026-03-08T07:30:00Z' },
            { scheduledAt: '2026-03-09T03:30:00Z' },
            { scheduledAt: '2026-03-09T04:00:00Z' },
          ]}
        />
        <ZoneControl />
      </>,
    );
    let days = within(
      screen.getByRole('list', { name: 'Next 7 days schedule' }),
    ).getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent('Sat 7');
    expect(within(days[0]).getByText('1')).toBeVisible();
    expect(days[1]).toHaveTextContent('Sun 8');
    expect(within(days[1]).getByText('3')).toBeVisible();
    expect(days[2]).toHaveTextContent('Mon 9');
    expect(within(days[2]).getByText('1')).toBeVisible();
    expect(days[6]).toHaveTextContent('Fri 13');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change zone' }));
    days = within(
      screen.getByRole('list', { name: 'Next 7 days schedule' }),
    ).getAllByRole('listitem');
    expect(days[0]).toHaveTextContent('Sun 8');
    expect(within(days[0]).getByText('3')).toBeVisible();
    expect(days[1]).toHaveTextContent('Mon 9');
    expect(within(days[1]).getByText('2')).toBeVisible();
  });
  it('counts both repeated autumn hours once each without duplicating the civil day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T04:30:00Z'));
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(
      <WeekStrip
        quests={[
          { scheduledAt: '2026-11-01T05:30:00Z' },
          { scheduledAt: '2026-11-01T06:30:00Z' },
        ]}
      />,
    );
    const days = within(
      screen.getByRole('list', { name: 'Next 7 days schedule' }),
    ).getAllByRole('listitem');
    expect(days[0]).toHaveTextContent('Sun 1');
    expect(within(days[0]).getByText('2')).toBeVisible();
    expect(days[1]).toHaveTextContent('Mon 2');
    expect(days[6]).toHaveTextContent('Sat 7');
  });
});
