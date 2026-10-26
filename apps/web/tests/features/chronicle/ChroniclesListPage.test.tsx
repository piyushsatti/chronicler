import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

async function openSearch(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const toggle = screen.queryByRole('button', { name: 'Search entries' });
  if (toggle?.getAttribute('aria-expanded') === 'false') await user.click(toggle);
  return screen.getByRole('searchbox', { name: 'Search entries' });
}

function expectChronicleToolbar(): void {
  expect(screen.getByRole('group', { name: 'Chronicle date range' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Search entries' })).toBeVisible();
}

describe('ChroniclesListPage', () => {
  it('renders publication-date timeline entries with shared range controls', async () => {
    renderWithProviders(<ChroniclesListPage />);
    expect((await screen.findAllByText('Session recap')).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Chronicle date range' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeVisible();
    expect(screen.getByText('Vault Delve — Session recap')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read entry: Vault Delve — Session recap' })).toHaveAttribute(
      'href',
      '/chronicles/vault-delve-summary',
    );
    expect(screen.getByRole('button', { name: 'Search entries' })).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(screen.getByText('Not yet dated')).toBeInTheDocument();
    expect(screen.queryByText('DMs only')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New entry' })).not.toBeInTheDocument();
  });

  it('uses the shared toolbar with the same segment size and spacing as Codex and Rules (owner item 8)', async () => {
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Vault Delve — Session recap');
    const toolbar = screen.getByRole('region', { name: 'Filter chronicles' });
    expect(toolbar).toHaveAttribute('data-component', 'PageToolbar');
    const segments = within(toolbar).getByRole('toolbar', { name: 'Chronicle date range' });
    expect(segments).toHaveAttribute('data-size', 'md');
    const heading = screen.getByRole('heading', { level: 1, name: 'Chronicles' });
    const stack = toolbar.parentElement?.parentElement;
    expect(stack).toHaveClass('stack');
    expect(stack).toHaveAttribute('data-gap', '5');
    expect(stack).toContainElement(heading);
  });

  it('disambiguates shared author names and keeps author handles searchable', async () => {
    const user = userEvent.setup();
    const seenHandles: string[] = [];
    server.use(
      graphql.query('ChronicleAuthorName', ({ variables }) => {
        const handle = String(variables.handle);
        seenHandles.push(handle);
        return HttpResponse.json({
          data: {
            memberProfile: {
              member: { handle, displayName: 'Dev' },
            },
          },
        });
      }),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('Dev (@mira)')).toBeVisible();
    expect(screen.getByText('Dev (@ash)')).toBeVisible();
    await user.type(await openSearch(user), 'mira');
    expect(screen.getByText('Vault Delve — Session recap')).toBeVisible();
    expect(screen.queryByText("Ash's table notes")).not.toBeInTheDocument();
    expect(seenHandles).toEqual(expect.arrayContaining(['mira', 'ash']));
  });

  it('filters the timeline by search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChroniclesListPage />);
    await screen.findByText('Vault Delve — Session recap');
    await user.type(await openSearch(user), 'table notes');
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
    expectChronicleToolbar();
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });

  it('shows the empty timeline state with a configured era', async () => {
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
    expect(await screen.findByText('No chronicle entries yet.')).toBeInTheDocument();
    expectChronicleToolbar();
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
    expectChronicleToolbar();
    expect(screen.queryByText('Vault Delve — Session recap')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New entry' })).not.toBeInTheDocument();
    release();
    const newEntry = await screen.findByRole('link', { name: 'New entry' });
    expect(newEntry).toHaveAttribute('href', '/summaries/new');
    // The small header action keeps the title-to-lede spacing the Rules page has.
    expect(newEntry).toHaveClass('btn', 'btn--primary', 'btn--sm');
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
    expect(screen.queryByRole('link', { name: 'New entry' })).not.toBeInTheDocument();
  });

  it('shows a lock only for dm_only visibility, independent of category', async () => {
    const user = userEvent.setup();
    const privateEntry = {
      ...goodList.items[0],
      id: '6e000000-0000-4000-8000-000000000099',
      slug: 'private-session-recap',
      title: 'Private session recap',
      category: 'session',
      visibility: 'dm_only',
      publishedAt: '2026-09-14T12:00:00Z',
    };
    const publicDmEntry = {
      ...goodList.items[1],
      visibility: 'public',
      publishedAt: '2026-09-14T11:00:00Z',
    };
    const publicSessionEntry = {
      ...goodList.items[0],
      id: '6e000000-0000-4000-8000-000000000098',
      slug: 'public-session-recap',
      title: 'Public session recap',
      visibility: 'public',
      publishedAt: '2026-09-14T10:00:00Z',
    };
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            documents: { items: [privateEntry, publicDmEntry, publicSessionEntry], total: 3 },
            gameCalendar: { definition: null },
          },
        }),
      ),
    );
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByText('Private session recap')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Entry types' })).toBeVisible();
    expect(screen.getByText('DMs only')).toBeVisible();
    const privateCard = screen.getByRole('heading', { name: 'Private session recap' }).closest('article');
    expect(privateCard).not.toBeNull();
    expect(within(privateCard as HTMLElement).getByText('DM recap')).toBeVisible();
    expect(screen.getByText("Ash's table notes")).toBeVisible();
    const publicDm = screen.getByRole('heading', { name: "Ash's table notes" }).closest('article');
    expect(publicDm).not.toBeNull();
    expect(within(publicDm as HTMLElement).getByText('DM recap')).toBeVisible();
    expect(within(publicDm as HTMLElement).queryByText('DMs only')).not.toBeInTheDocument();
    await user.type(await openSearch(user), 'Private session recap');
    expect(screen.queryByRole('group', { name: 'Entry types' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: 'New entry' })).not.toBeInTheDocument();
    first.unmount();
    status = 'approved';
    renderWithProviders(<ChroniclesListPage />);
    expect(await screen.findByRole('link', { name: 'New entry' })).toBeVisible();
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
    expect(screen.queryByRole('link', { name: 'New entry' })).not.toBeInTheDocument();
  });

  it('searches all 101 loaded rows by arc, region, author and title', async () => {
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
    await screen.findByText('101 entries');
    expect(offsets).toEqual([0, 100]);
    expect(screen.getByText('Second-page-only chronicle')).toBeInTheDocument();
    const search = await openSearch(user);
    for (const query of ['Late arc', 'Late region', 'late-author', 'Second-page-only']) {
      await user.clear(search);
      await user.type(search, query);
      expect(screen.getByText('Second-page-only chronicle')).toBeInTheDocument();
      expect(screen.queryByText('First-page chronicle 1')).not.toBeInTheDocument();
    }
  });

  it('uses publication dates independently of the in-world calendar', async () => {
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
    expect(await screen.findByText('2 entries')).toBeInTheDocument();
    expect(screen.getByText('Not yet dated')).toBeInTheDocument();
  });
  it('groups newest publication dates first and places undated entries last', async () => {
    const base = goodList.items[0];
    const row = (id: string, title: string, publishedAt: string | null, occurredAt: string | null) => ({
      ...base,
      id,
      slug: title.toLowerCase().replace(/\W+/g, '-'),
      title,
      publishedAt,
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
                row(
                  '6e000000-0000-4000-8000-000000000001',
                  'Older session',
                  '2026-09-03T18:00:00Z',
                  '2026-09-03T18:00:00Z',
                ),
                row(
                  '6e000000-0000-4000-8000-000000000002',
                  'Newer session',
                  '2026-10-12T18:00:00Z',
                  '2026-10-12T18:00:00Z',
                ),
                row('6e000000-0000-4000-8000-000000000003', 'Loose note', null, null),
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
      ...document.querySelectorAll('[data-el="chronicles.publicationDate"]'),
    ].map((header) => header.textContent);
    expect(headers).toEqual(['12 October 2026', '3 September 2026', 'Not yet dated']);
  });

  it('groups publication instants by the viewer’s calendar date, not UTC or the last edit', async () => {
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
                  publishedAt: '2026-11-01T03:00:00Z',
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
      ...document.querySelectorAll('[data-el="chronicles.publicationDate"]'),
    ].map((header) => header.textContent);
    expect(headers).toEqual(['31 October 2026', '10 September 2026']);
  });
});
