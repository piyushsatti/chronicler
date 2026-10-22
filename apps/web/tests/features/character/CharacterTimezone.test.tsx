import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { graphql, HttpResponse } from 'msw';
import { CharacterPage } from '../../../src/features/character/pages/CharacterPage.js';
import { CharacterActivityPanel } from '../../../src/features/character/components/CharacterActivityPanel.js';
import { useTheme } from '../../../src/context/ThemeContext.js';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import wire from '../../fixtures/wire/character/good.json';
function ZoneControl() {
  const { setPreferences } = useTheme();
  return (
    <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
      Change zone
    </button>
  );
}
describe('Character timestamp timezone', () => {
  it('updates the persisted mirror and log dates across midnight without changing their cached instants', async () => {
    let mirrorReads = 0;
    let activityReads = 0;
    server.use(
      graphql.query('Character', () => {
        mirrorReads++;
        return HttpResponse.json({
          data: {
            character: {
              ...wire,
              ddbMirror: {
                level: null,
                xp: null,
                classes: 'Wizard',
                species: null,
                background: null,
                syncedAt: '2026-03-08T04:30:00Z',
              },
            },
          },
        });
      }),
      graphql.query('CharacterActivity', () => {
        activityReads++;
        return HttpResponse.json({
          data: {
            characterLogs: {
              items: [
                {
                  id: wire.id,
                  body: 'Existing log',
                  createdAt: '2026-03-08T04:30:00Z',
                },
              ],
              total: 1,
            },
            downtimeProjects: { items: [], total: 0 },
          },
        });
      }),
    );
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/New_York' }, null);
    renderWithProviders(
      <>
        <Routes>
          <Route path="/characters/:code" element={<CharacterPage />} />
        </Routes>
        <CharacterActivityPanel characterId={wire.id} owner={false} />
        <ZoneControl />
      </>,
      { route: '/characters/C-101' },
    );
    expect(await screen.findByText(/Last synchronized.*07 Mar 2026/)).toBeVisible();
    expect(await screen.findByText('07 Mar 2026', { exact: true })).toBeVisible();
    const reads = { mirrorReads, activityReads };
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change zone' }));
    expect(screen.getByText(/Last synchronized.*08 Mar 2026/)).toBeVisible();
    expect(screen.getByText('08 Mar 2026', { exact: true })).toBeVisible();
    expect({ mirrorReads, activityReads }).toEqual(reads);
  });
});
