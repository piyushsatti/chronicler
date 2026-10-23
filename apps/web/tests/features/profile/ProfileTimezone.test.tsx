import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { graphql, HttpResponse } from 'msw';
import { DMProfilePage } from '../../../src/features/profile/pages/ProfilePages.js';
import { useTheme } from '../../../src/context/ThemeContext.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import quest from '../../fixtures/wire/quest/board-good.json';
function ZoneControl() {
  const { setPreferences } = useTheme();
  return (
    <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
      Change zone
    </button>
  );
}
describe('Profile session timezone', () => {
  it('updates cached sessions in the selected zone', async () => {
    let reads = 0;
    server.use(
      graphql.query('DmTableSchedule', () => {
        reads++;
        return HttpResponse.json({
          data: {
            quests: {
              items: quest.items
                .slice(0, 1)
                .map((item) => ({ ...item, scheduledAt: '2026-03-08T04:30:00Z' })),
              total: quest.total,
            },
          },
        });
      }),
    );
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(
      <>
        <Routes>
          <Route path="/dms/:shortCode" element={<DMProfilePage />} />
        </Routes>
        <ZoneControl />
      </>,
      { route: '/dms/@mira' },
    );
    expect(await screen.findByText(/Sat 7 Mar 2026, 23:30/)).toBeVisible();
    const before = reads;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change zone' }));
    expect(screen.getByText(/Sun 8 Mar 2026, 10:00/)).toBeVisible();
    expect(reads).toBe(before);
  });
});
