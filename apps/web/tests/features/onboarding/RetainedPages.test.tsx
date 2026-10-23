import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { server } from '../../../src/mocks/server.js';
import { CalendarPage } from '../../../src/features/onboarding/pages/CalendarPage.js';
import {
  GuildAliasPage,
  ScheduleAliasPage,
} from '../../../src/features/onboarding/pages/RetainedAliasesPage.js';
import { SeriesPage } from '../../../src/features/onboarding/pages/SeriesPage.js';
import { SeriesCreateAction } from '../../../src/components/domain/SeriesCreateAction.js';
import { SeriesRedirect } from '../../../src/features/onboarding/SeriesRedirect.js';
import { useSeriesPage } from '../../../src/hooks/useSeriesPage.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/onboarding/retained-good.json';

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}
function login() {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'fixture-only', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
  );
}
function me(roles: string[], id = good.arc.createdBy) {
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({
        data: {
          memberMe: { id, handle: 'fixture-dm', displayName: 'Fixture DM', roles },
        },
      }),
    ),
  );
}

beforeEach(() => {
  server.use(
    graphql.query('CurrentAdminAccess', () =>
      HttpResponse.json({
        errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
      }),
    ),
  );
});

describe('retained aliases preserve identity and intent', () => {
  it('converges Schedule onto Calendar preserving date, search, filters, pages and hash', async () => {
    renderWithProviders(
      <>
        <Routes>
          <Route path="/schedule" element={<ScheduleAliasPage />} />
          <Route path="/calendar" element={<p>Calendar destination</p>} />
        </Routes>
        <Location />
      </>,
      { route: '/schedule?date=2026-10-14&search=salt&status=open&page=2#quests' },
    );
    await screen.findByText('Calendar destination');
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      '/calendar?date=2026-10-14&search=salt&status=open&page=2&q=salt&day=2026-10-14#quests',
    );
  });
  it.each([good.document.id, good.document.slug])(
    'resolves the exact Guild identity %s through the same document reader',
    async (identity) => {
      renderWithProviders(
        <>
          <Routes>
            <Route path="/guilds/:shortCode/redirect" element={<GuildAliasPage />} />
            <Route path="/codex/:slug" element={<p>Canonical document</p>} />
          </Routes>
          <Location />
        </>,
        { route: `/guilds/${identity}/redirect?q=salt#history` },
      );
      await screen.findByText('Canonical document');
      expect(screen.getByLabelText('Location')).toHaveTextContent(
        '/codex/salt-road-guild?q=salt#history',
      );
    },
  );
  it('explains unresolvable historic codes and offers navigation', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/guilds/:shortCode" element={<GuildAliasPage />} />
      </Routes>,
      { route: '/guilds/unknown-G-12' },
    );
    await screen.findByText(/historical Guild link could not be resolved/);
    expect(screen.getByRole('link', { name: 'Browse the Codex' })).toHaveAttribute(
      'href',
      '/codex',
    );
  });
  it('converges the Guild directory with its search intent', async () => {
    renderWithProviders(
      <>
        <Routes>
          <Route path="/guilds" element={<GuildAliasPage />} />
          <Route path="/codex" element={<p>Codex destination</p>} />
        </Routes>
        <Location />
      </>,
      { route: '/guilds?search=salt#guilds' },
    );
    await screen.findByText('Codex destination');
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      '/codex?search=salt&q=salt#guilds',
    );
  });
});

describe('Calendar page', () => {
  it.each(['/calendar?month=2026-10', '/calendar?month=2026-10&status=open', '/calendar?day=2026-10-14'])(
    'labels a wholly empty month without treating a filtered empty result as one: %s',
    async (route) => {
      server.use(graphql.query('RetainedCalendarQuests', () => HttpResponse.json({
        data: { quests: { total: 0, items: [] } },
      })));
      renderWithProviders(<CalendarPage />, { route });
      await screen.findByText(/Today in the campaign:/);
      await within(screen.getByRole('region', { name: 'Filter quests' })).findByText('0 quests');
      if (route === '/calendar?month=2026-10') {
        expect(screen.getByText('No quests this month')).toBeVisible();
      } else {
        expect(screen.queryByText('No quests this month')).not.toBeInTheDocument();
      }
    },
  );
  it('restores named dates and full schedule paging, keeps legacy search when changing month', async () => {
    const seen: unknown[] = [];
    server.use(
      graphql.query('RetainedCalendarQuests', ({ variables }) => {
        seen.push(variables);
        return HttpResponse.json({ data: { quests: { total: 51, items: [] } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <CalendarPage />
        <Location />
      </>,
      { route: '/calendar?date=2026-10-14&search=salt&page=2' },
    );
    await screen.findByText(/Today in the campaign: 24 River, 4 PI/);
    expect(await screen.findByText('51 quests, page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toHaveValue(
      'salt',
    );
    expect(screen.getByRole('button', { name: 'Next quests' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous quests' }));
    await waitFor(() =>
      expect(screen.getByText('51 quests, page 1 of 2')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Location')).toHaveTextContent('q=salt'),
    );
    expect(screen.getByLabelText('Location')).toHaveTextContent('month=2026-11');
    expect(seen).toContainEqual({
      filters: {
        scheduledFrom: '2026-10-14T00:00:00Z',
        scheduledTo: '2026-10-15T00:00:00Z',
        search: 'salt',
      },
      offset: 50,
    });
    expect(seen).toContainEqual({
      filters: {
        scheduledFrom: '2026-11-01T00:00:00Z',
        scheduledTo: '2026-12-01T00:00:00Z',
        search: 'salt',
      },
      offset: 0,
    });
  });
  it('does not present a guessed game date for an unmapped day', async () => {
    renderWithProviders(<CalendarPage />, { route: '/calendar?day=2026-10-15' });
    expect(
      await screen.findByText('No game date is recorded for this day.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Thursday 15 October 2026' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Dashed days have no recorded game day (1 day).'),
    ).toBeInTheDocument();
    // Day cells show the day number; the ISO date stays machine-readable only.
    const day = screen.getByRole('button', {
      name: '15 Oct 2026, no game day recorded',
    });
    expect(day.querySelector('time')).toHaveTextContent(/^15$/);
    expect(day.querySelector('time')).toHaveAttribute('datetime', '2026-10-15');
    expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/2026-10-1\d/)).toBeNull();
  });
  it('still resolves a shared ?gameDay link into the real-date lookup', async () => {
    server.use(
      graphql.query('RetainedRealDates', () =>
        HttpResponse.json({
          data: { realDates: { total: 1, items: ['2026-10-14'] } },
        }),
      ),
    );
    renderWithProviders(<CalendarPage />, {
      route: '/calendar?month=2026-10&gameDay=113',
    });
    expect(
      await screen.findByText(/Game day 113 falls on 1 stored date/),
    ).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Game day' })).toHaveValue(113);
  });
  it('lays the month out under Monday-first weekday headers', async () => {
    renderWithProviders(<CalendarPage />, { route: '/calendar?month=2026-10' });
    expect(
      await screen.findByRole('heading', { name: 'October 2026' }),
    ).toBeInTheDocument();
    const days = await screen.findByRole('list', { name: 'Days in October 2026' });
    // The fixture grid starts on Wednesday 14 Oct: two blank cells precede it.
    expect(days.querySelectorAll(':scope > span[aria-hidden="true"]')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Status' })).toHaveTextContent(
      /All statuses.*Open.*Cancelled/,
    );
  });
  it('tells assistive tech which quest status filter is active', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />, { route: '/calendar?month=2026-10' });
    const status = await screen.findByRole('group', { name: 'Status' });
    expect(
      within(status).getByRole('button', { name: 'All statuses', pressed: true }),
    ).toBeVisible();
    await user.click(within(status).getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(
        within(status).getByRole('button', { name: 'Open', pressed: true }),
      ).toBeVisible(),
    );
    expect(
      within(status).getByRole('button', { name: 'All statuses', pressed: false }),
    ).toBeVisible();
  });
  it('rejects malformed location before dispatch and offers a reset', async () => {
    renderWithProviders(<CalendarPage />, { route: '/calendar?day=2026-02-30' });
    expect(screen.getByRole('alert')).toHaveTextContent('invalid date or filter');
    expect(
      screen.getByRole('button', { name: 'Open current month' }),
    ).toBeInTheDocument();
  });
  it('shows server failures and retries rather than treating them as an empty calendar', async () => {
    let attempts = 0;
    server.use(
      graphql.query('RetainedCalendar', () => {
        attempts++;
        return attempts === 1
          ? HttpResponse.json({
              errors: [{ message: 'opaque', extensions: { code: 'INTERNAL' } }],
            })
          : HttpResponse.json({
              data: { gameCalendar: good.calendar, gameDate: null },
            });
      }),
    );
    renderWithProviders(<CalendarPage />, { route: '/calendar?month=2026-10' });
    await screen.findByRole('button', { name: 'Retry calendar' });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry calendar' }));
    await screen.findByText(/Today in the campaign: 24 River/);
    expect(attempts).toBe(2);
  });
});

describe('Series ownership and command retry', () => {
  it('renames an owned series and creates through the returned canonical UUID', async () => {
    login();
    me(['dm']);
    const inputs: unknown[] = [];
    let name = good.arc.name;
    const createdId = '00000000-0000-4000-8000-000000000099';
    server.use(
      graphql.query('RetainedSeriesArc', ({ variables }) =>
        HttpResponse.json({
          data: { questArc: { ...good.arc, id: variables.id, name } },
        }),
      ),
      graphql.mutation('RetainedUpsertArc', ({ variables }) => {
        inputs.push(variables);
        name = variables.name;
        return HttpResponse.json({
          data: {
            upsertQuestArc: { ...good.arc, id: variables.id ?? createdId, name },
          },
        });
      }),
    );
    renderWithProviders(
      <>
        <Routes>
          <Route path="/series/:shortCode" element={<SeriesPage />} />
          <Route path="/quests" element={<SeriesCreateAction />} />
        </Routes>
        <Location />
      </>,
      { route: `/series/${good.arc.id}` },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rename series' }));
    const field = await screen.findByRole('textbox', { name: 'Series name' });
    await user.clear(field);
    await user.type(field, 'Renamed arc');
    await user.click(screen.getByRole('button', { name: 'Save series name' }));
    await screen.findByRole('heading', { name: 'Renamed arc' });
    expect(
      screen.queryByRole('button', { name: 'New series' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Quests' }));
    await user.click(await screen.findByRole('button', { name: 'New series' }));
    const create = await screen.findByRole('textbox', { name: 'New series name' });
    await user.type(create, 'New arc');
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Location')).toHaveTextContent(
        `/series/${createdId}`,
      ),
    );
    expect(inputs).toEqual([
      expect.objectContaining({
        id: good.arc.id,
        name: 'Renamed arc',
        meta: { idempotencyKey: expect.any(String) },
      }),
      expect.objectContaining({
        id: null,
        name: 'New arc',
        meta: { idempotencyKey: expect.any(String) },
      }),
    ]);
  });
  it('gives historic codes an explanation and only redirects actual UUID identities', async () => {
    const first = renderWithProviders(
      <Routes>
        <Route path="/series/:shortCode" element={<SeriesPage />} />
      </Routes>,
      { route: '/series/old-S-12' },
    );
    expect(
      screen.getByText(/This series link is out of date/),
    ).toBeInTheDocument();
    first.unmount();
    renderWithProviders(
      <>
        <Routes>
          <Route path="/series/:shortCode/redirect" element={<SeriesRedirect />} />
          <Route path="/series/:shortCode" element={<p>Current series</p>} />
        </Routes>
        <Location />
      </>,
      { route: `/series/${good.arc.id}/redirect?q=kept#quests` },
    );
    // Pure redirect: the canonical route is the first thing painted.
    expect(screen.getByText('Current series')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Quest series' })).toBeNull();
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      `/series/${good.arc.id}?q=kept#quests`,
    );
  });
  it('allows the current owner to rename while a held unapproved unrelated DM cannot create or rename', async () => {
    login();
    me(['dm'], good.document.id);
    server.use(
      graphql.query('RetainedSeriesAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: good.document.id, roles: ['dm'], status: 'active' },
              dmProfile: { status: 'pending' },
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/series/:shortCode" element={<SeriesPage />} />
      </Routes>,
      { route: `/series/${good.arc.id}` },
    );
    await screen.findByText('0 quests');
    expect(
      await screen.findByText('No quests belong to this series yet.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Browse the quest board' }),
    ).toHaveAttribute('href', '/quests');
    expect(
      screen.queryByRole('button', { name: 'Save series name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create series' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rename series' }),
    ).not.toBeInTheDocument();
  });
  it('reuses a lost-response key, rejects synchronous duplicate dispatch and retains current authority', async () => {
    login();
    me(['dm']);
    const keys: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.mutation('RetainedUpsertArc', async ({ variables }) => {
        keys.push(variables.meta.idempotencyKey);
        if (keys.length === 1) {
          await held;
          return HttpResponse.error();
        }
        return HttpResponse.json({
          data: { upsertQuestArc: { ...good.arc, name: variables.name } },
        });
      }),
    );
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useSeriesPage(good.arc.id), {
      wrapper,
    });
    await waitFor(() => expect(result.current.canRename).toBe(true));
    let first = Promise.resolve(false);
    await act(async () => {
      first = result.current.save(good.arc.id, 'New name');
      expect(await result.current.save(good.arc.id, 'New name')).toBe(false);
    });
    await waitFor(() => expect(keys).toHaveLength(1));
    await act(async () => {
      release();
      expect(await first).toBe(false);
    });
    await act(async () => {
      expect(await result.current.save(good.arc.id, 'New name')).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await act(async () => {
      expect(await result.current.save(good.document.id, 'Wrong target')).toBe(false);
    });
    expect(keys).toHaveLength(2);
    unmount();
    client.clear();
  });
});
