import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { ChroniclesListPage } from '../../../src/features/chronicle/pages/ChroniclesListPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import goodMe from '../../fixtures/wire/me/good.json';
import goodList from '../../fixtures/wire/chronicle/list-good.json';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';

function signIn(): void {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-one', exp: Date.now() / 1000 + 3600 }))}.test`,
  );
}

/** Narrow layouts fold the filter groups behind a toggle. */
async function openFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const toggle = screen.queryByRole('button', { name: /^Filters/ });
  if (toggle?.getAttribute('aria-expanded') === 'false') await user.click(toggle);
}

describe('ChroniclesListPage', () => {
  it('renders timeline chips and season groups from the chronicle list', async () => {
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('SESSION')).toBeInTheDocument();
    await openFilters(userEvent.setup());
    expect(screen.getByText('DM RECAP')).toBeInTheDocument();
    expect(screen.getByText('AE 412 · FROSTMELT')).toBeInTheDocument();
    expect(screen.getByText('Vault Delve — Session recap')).toBeInTheDocument();
    expect(screen.getByLabelText('Search entries')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Arc' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Region' })).toBeInTheDocument();
    expect(screen.getByText('CY · 2 ENTRIES')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New entry' })).not.toBeInTheDocument();
  });

  it('filters the timeline by search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Vault Delve — Session recap');
    await user.type(screen.getByLabelText('Search entries'), 'table notes');
    expect(screen.queryByText('Vault Delve — Session recap')).not.toBeInTheDocument();
    expect(screen.getByText("Ash's table notes")).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });

  it('uses the configured era on an empty timeline', async () => {
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            documents: { items: [], total: 0 },
            gameCalendar: { definition: { era: { abbrev: 'CY' } } },
          },
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('CY · 0 ENTRIES')).toBeInTheDocument();
  });

  it('waits for validated membership then offers a new entry to a player', async () => {
    signIn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('MemberMe', async () => {
        await pending;
        return HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: ['player'] } },
        });
      }),
    );
    renderWithProviders(<ChroniclesListPage />);
    await waitFor(() =>
      expect(screen.getByLabelText('Loading chronicles')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Vault Delve — Session recap')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New entry' })).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('link', { name: '+ New entry' })).toHaveAttribute(
      'href',
      '/summaries/new',
    );
  });

  it('offers no new entry to accounts the summary editor would deny', async () => {
    signIn();
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: { ...goodMe, roles: ['verifier'] } } }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('Vault Delve — Session recap')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New entry' })).not.toBeInTheDocument();
  });

  it('offers a new entry to a DM only once the DM profile is approved', async () => {
    signIn();
    let status = 'pending';
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: { ...goodMe, roles: ['dm'] } } }),
      ),
      graphql.query('QuestAuthoringAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: goodMe.id, roles: ['dm'], status: 'active' },
              dmProfile: { status },
            },
          },
        }),
      ),
    );
    const first = renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('Vault Delve — Session recap')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New entry' })).not.toBeInTheDocument();
    first.unmount();
    status = 'approved';
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByRole('link', { name: '+ New entry' })).toBeVisible();
  });

  it('does not grant a create affordance when membership fails', async () => {
    signIn();
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          errors: [{ message: 'Inactive member', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Vault Delve — Session recap')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ New entry' })).not.toBeInTheDocument();
  });

  it('filters the complete101-row timeline using Arc, Region, Author and text unique to the second page', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...goodList.items[0],
      id: `6e000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: `complete-summary-${index + 1}`,
      title:
        index === 100
          ? 'Second-page-only chronicle'
          : 'First-page chronicle ' + (index + 1),
      author: { handle: index === 100 ? 'late-author' : 'common-author' },
      summaryDerived: {
        ...goodList.items[0].summaryDerived,
        arc: index === 100 ? 'Late arc' : 'Common arc',
        regions: [
          {
            id: index === 100 ? 'late-region' : 'common-region',
            name: index === 100 ? 'Late region' : 'Common region',
          },
        ],
      },
    }));
    const offsets: unknown[] = [];
    server.use(
      graphql.query('ChronicleList', ({ variables }) => {
        offsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            documents: {
              items: rows.slice(
                Number(variables.offset),
                Number(variables.offset) + 100,
              ),
              total: rows.length,
            },
            gameCalendar: { definition: { era: { abbrev: 'CY' } } },
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('CY · 101 ENTRIES');
    expect(offsets).toEqual([0, 100]);
    expect(screen.getByText('Second-page-only chronicle')).toBeInTheDocument();
    await openFilters(user);
    for (const name of ['Late arc', 'Late region', '@late-author']) {
      await user.click(screen.getByRole('button', { name }));
      // The active filter is announced, not only drawn.
      expect(screen.getByRole('button', { name, pressed: true })).toBeVisible();
      expect(screen.getByText('Second-page-only chronicle')).toBeInTheDocument();
      expect(screen.queryByText('First-page chronicle 1')).not.toBeInTheDocument();
    }
    await user.type(screen.getByLabelText('Search entries'), 'Second-page-only');
    expect(screen.getByText('Second-page-only chronicle')).toBeInTheDocument();
    expect(screen.queryByText('First-page chronicle 100')).not.toBeInTheDocument();
  });

  it('keeps entry dates separate from an absent calendar era', async () => {
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            documents: goodList,
            gameCalendar: { definition: null },
          },
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('GAME TIMELINE · 2 ENTRIES')).toBeInTheDocument();
    expect(screen.getByText('AE 412 · FROSTMELT')).toBeInTheDocument();
  });
  it('files entries without a game date under the real month they happened', async () => {
    const base = goodList.items[0];
    const undatedRow = (id: string, title: string, occurredAt: string | null) => ({
      ...base,
      id,
      slug: title.toLowerCase().replace(/\W+/g, '-'),
      title,
      updatedAt: undefined,
      summaryDerived: {
        ...base.summaryDerived,
        occurredAt,
        gameDay: null,
        gameDate: null,
      },
    });
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            documents: {
              items: [
                undatedRow(
                  '6e000000-0000-4000-8000-000000000001',
                  'Older session',
                  '2026-09-03T18:00:00Z',
                ),
                undatedRow(
                  '6e000000-0000-4000-8000-000000000002',
                  'Newer session',
                  '2026-10-12T18:00:00Z',
                ),
                undatedRow('6e000000-0000-4000-8000-000000000003', 'Loose note', null),
              ],
              total: 3,
            },
            gameCalendar: { definition: null },
          },
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Newer session');
    const headers = [
      ...document.querySelectorAll('[data-el="chronicles.seasonHeader"]'),
    ].map((header) => header.firstElementChild?.textContent);
    expect(headers).toEqual(['October 2026', 'September 2026', 'Not yet dated']);
  });

  it('files undated entries by the viewer’s zone and publish date, not UTC or the last edit', async () => {
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/Los_Angeles' }, null);
    const base = goodList.items[0];
    const row = (
      id: string,
      title: string,
      fields: { occurredAt: string | null; publishedAt?: string; updatedAt?: string },
    ) => ({
      ...base,
      id,
      slug: title.toLowerCase().replace(/\W+/g, '-'),
      title,
      updatedAt: fields.updatedAt,
      publishedAt: fields.publishedAt ?? null,
      summaryDerived: {
        ...base.summaryDerived,
        occurredAt: fields.occurredAt,
        gameDay: null,
        gameDate: null,
      },
    });
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            documents: {
              items: [
                // 31 Oct, 20:00 in Los Angeles is already 1 Nov in UTC.
                row('6e000000-0000-4000-8000-000000000011', 'Halloween session', {
                  occurredAt: '2026-11-01T03:00:00Z',
                }),
                // Published in September, fixed for a typo today: stays in September.
                row('6e000000-0000-4000-8000-000000000012', 'Old note', {
                  occurredAt: null,
                  publishedAt: '2026-09-10T18:00:00Z',
                  updatedAt: '2026-10-22T08:00:00Z',
                }),
              ],
              total: 2,
            },
            gameCalendar: { definition: null },
          },
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Halloween session');
    const headers = [
      ...document.querySelectorAll('[data-el="chronicles.seasonHeader"]'),
    ].map((header) => header.firstElementChild?.textContent);
    expect(headers).toEqual(['October 2026', 'September 2026']);
  });
});
