import { graphql, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/features/chronicle/feature.js';
import { parseChronicleDetail } from '../../../src/features/chronicle/adapters/chronicleAdapter.js';
import { server } from '../../../src/mocks/server.js';
import detail from '../../fixtures/wire/chronicle/detail-good.json';
import list from '../../fixtures/wire/chronicle/list-good.json';
import calendar from '../../fixtures/wire/chronicle/calendar-good.json';
import memberProfile from '../../fixtures/wire/profile/member-profile-good.json';
import { DEFAULT_PREFERENCES, savePrefs } from '../../../src/context/theme.utils.js';
import { renderWithProviders } from '../../test-utils.js';

// Author query starts after the chronicle, so both 10s waits need more than 15s.
const identityFindMs = 10_000;
const identityCaseMs = 25_000;

function reader(path: string) {
  return renderWithProviders(
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>,
    { route: path },
  );
}

describe('Summary and Chronicle reader', () => {
  it.each([
    '/chronicles/vault-delve',
    '/summaries/vault-delve',
    `/chronicles/${detail.id}`,
    `/summaries/${detail.id}`,
  ])(
    'reads %s by the correct server identity',
    async (path) => {
      const requests: Record<string, unknown>[] = [];
      server.use(
        graphql.query('ChronicleDetail', ({ variables }) => {
          requests.push(variables);
          return HttpResponse.json({
            data: { [variables.byId ? 'byId' : 'bySlug']: detail },
          });
        }),
      );
      reader(path);
      expect(
        await screen.findByRole(
          'heading',
          { name: detail.title },
          { timeout: identityFindMs },
        ),
      ).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Into the vault' })).toBeVisible();
      expect(screen.getByText('our party').tagName).toBe('STRONG');
      expect(screen.getByText('Deep Roads')).toBeVisible();
      const facts = within(screen.getByLabelText('Session details'));
      expect(facts.getByRole('link', { name: 'The vault expedition' })).toHaveAttribute(
        'href',
        '/quests/qa-played-orchard',
      );
      expect(facts.getByRole('link', { name: 'Quest details' })).toHaveAttribute(
        'href',
        '/quests/Q-14',
      );
      expect(facts.getAllByRole('link', { name: 'View roster' })[0]).toHaveAttribute(
        'href',
        '/quests/qa-played-orchard',
      );
      expect(facts.getByRole('link', { name: 'Dalmond' })).toHaveAttribute(
        'href',
        `/regions/${detail.summaryDerived.regions[0].id}`,
      );
      expect(
        await within(screen.getByRole('region', { name: 'Author' })).findByRole(
          'link',
          { name: 'Mira' },
          { timeout: identityFindMs },
        ),
      ).toHaveAttribute('href', '/players/@mira');
      expect(screen.getByText('Played 18 Oct 2026')).toBeVisible();
      expect(screen.getByRole('link', { name: 'Thorn' })).toHaveAttribute(
        'href',
        '/characters/C-13',
      );
      expect(
        screen.queryByRole('link', { name: 'Edit entry' }),
      ).not.toBeInTheDocument();
      expect(requests[0]).toMatchObject(
        path.includes(detail.id)
          ? { id: detail.id, byId: true, slug: '' }
          : { slug: 'vault-delve', byId: false },
      );
    },
    identityCaseMs,
  );

  it('gives the identity reader time for the title wait and the later author wait', () => {
    expect(identityCaseMs).toBeGreaterThan(identityFindMs + identityFindMs);
  });

  it('shows the back link, kind chip, game date, author row and Quest details bar', async () => {
    reader('/chronicles/vault-delve');
    expect(await screen.findByRole('heading', { name: detail.title })).toBeVisible();
    expect(screen.getByRole('link', { name: /All chronicles/ })).toHaveAttribute(
      'href',
      '/chronicles',
    );
    const bar = screen.getByRole('region', { name: 'Quest details' });
    expect(within(bar).getByText('Quest details')).toBeVisible();
    expect(within(bar).getByText(/Quests summarized/)).toBeVisible();
    expect(within(bar).getByRole('link', { name: 'Q-14' })).toHaveAttribute(
      'href',
      '/quests/Q-14',
    );
    expect(within(bar).getByRole('link', { name: 'Dalmond' })).toHaveAttribute(
      'href',
      `/regions/${detail.summaryDerived.regions[0].id}`,
    );
    expect(within(bar).getByText(/^DM ·/)).toBeVisible();
    expect(
      (await screen.findAllByRole('link', { name: 'Mira' })).length,
    ).toBeGreaterThan(1);
    // Session details and Related entries stay.
    expect(screen.getByLabelText('Session details')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Related entries' })).toBeVisible();
  });

  it('puts Written by and Related entries in one row under the title, body full width (owner item 17)', async () => {
    reader('/chronicles/vault-delve');
    const title = await screen.findByRole('heading', { level: 1, name: detail.title });
    const author = screen.getByRole('region', { name: 'Author' });
    const related = screen.getByRole('region', { name: 'Related entries' });
    const row = author.parentElement!;
    expect(row).toHaveAttribute('data-el', 'chronicle.about');
    expect(related.parentElement).toBe(row);
    expect(
      title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const body = document.querySelector('.summary-prose')!;
    expect(
      row.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('.detail-layout__rail')).toBeNull();
    expect(document.querySelector('.reading-column')).toBeNull();
  });

  it('puts the in-game date in the header', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              summaryDerived: {
                ...detail.summaryDerived,
                gameDate: {
                  eraAbbrev: 'Pw',
                  year: 102,
                  periodName: 'Oktavros',
                  periodIndex: 7,
                  periodType: 'month',
                  day: 1,
                },
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    await screen.findByRole('heading', { name: detail.title });
    expect(document.querySelector('[data-el="chronicle.gameDate"]')).toHaveTextContent(
      'Pw 102 · Oktavros 1',
    );
  });

  it('omits the Quest details bar when there are no quests, regions or DMs', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: { bySlug: { ...detail, summaryDerived: null } },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    await screen.findByRole('heading', { name: detail.title });
    expect(
      screen.queryByRole('region', { name: 'Quest details' }),
    ).not.toBeInTheDocument();
  });

  it('shows loading until a server response arrives', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('ChronicleDetail', async () => {
        await pending;
        return HttpResponse.json({ data: { bySlug: detail } });
      }),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    release();
    expect(await screen.findByRole('heading', { name: detail.title })).toBeVisible();
  });

  it.each(['canEditBody', 'canEditMetadata'])(
    'offers Edit only when server grants %s',
    async (capability) => {
      server.use(
        graphql.query('ChronicleDetail', () =>
          HttpResponse.json({ data: { bySlug: { ...detail, [capability]: true } } }),
        ),
      );
      reader('/chronicles/vault-delve');
      expect(await screen.findByRole('link', { name: 'Edit entry' })).toHaveAttribute(
        'href',
        `/summaries/${detail.id}/edit`,
      );
    },
  );

  it('handles a readable summary with no effective body', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: { bySlug: { ...detail, effectiveBody: null, summaryDerived: null } },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    expect(
      await screen.findByText('No readable body is available for this entry.'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Browse Chronicles' }).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [{ data: { bySlug: null } }, 'That item could not be found.'],
    [
      { errors: [{ message: 'private', extensions: { code: 'FORBIDDEN' } }] },
      /Sign in to see this|You don’t have access to this/,
    ],
    [
      { data: { bySlug: { ...detail, kind: 'rule' } } },
      'The server returned data this screen cannot use.',
    ],
  ])(
    'handles unavailable or invalid Documents without leaking a body',
    async (response, message) => {
      server.use(graphql.query('ChronicleDetail', () => HttpResponse.json(response)));
      reader('/chronicles/vault-delve');
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByText('our party')).not.toBeInTheDocument();
    },
  );

  it('omits a genuinely empty details card without inferring frontmatter relationships', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              frontmatter: { quest: 'Q-999' },
              summaryDerived: {
                quests: [],
                regions: [],
                players: [],
                dms: [],
                arc: null,
                occurredAt: null,
                gameDate: null,
                gameDay: null,
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    await screen.findByRole('heading', { name: detail.title });
    expect(screen.queryByLabelText('Session details')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Into the vault' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Q-999' })).not.toBeInTheDocument();
  });

  it('keeps a details card for a real game day of zero', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              summaryDerived: {
                quests: [],
                regions: [],
                players: [],
                dms: [],
                gameDay: 0,
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByLabelText('Session details')).toHaveTextContent(
      'Game day0',
    );
  });

  it('shows a generic author name with their handle and real avatar', async () => {
    server.use(
      graphql.query('MemberProfile', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              ...memberProfile,
              member: {
                ...memberProfile.member,
                displayName: 'Member',
                avatarUrl: '/mira.png',
              },
            },
          },
        }),
      ),
    );
    reader('/summaries/vault-delve');
    const author = await screen.findByRole('region', { name: 'Author' });
    expect(
      await within(author).findByRole('link', { name: /Member \(@mira\)/ }),
    ).toHaveAttribute('href', '/players/@mira');
    expect(within(author).getByRole('img', { name: 'Member (@mira)' })).toHaveAttribute(
      'src',
      '/mira.png',
    );
    expect(within(author).getByRole('heading', { name: 'Written by' })).toBeVisible();
  });

  it('labels the author with a handle when the public author profile is unavailable', async () => {
    server.use(
      graphql.query('MemberProfile', () =>
        HttpResponse.json({
          data: { memberProfile: null },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    const author = await screen.findByRole('region', { name: 'Author' });
    expect(
      within(author).getByRole('link', { name: 'Unnamed member (@mira)' }),
    ).toHaveAttribute('href', '/players/@mira');
  });

  it('uses publication in the viewer time zone when the played date is a sentinel', async () => {
    savePrefs({ ...DEFAULT_PREFERENCES, timezone: 'America/Los_Angeles' }, null);
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              publishedAt: '2026-09-14T00:30:00Z',
              summaryDerived: {
                ...detail.summaryDerived,
                occurredAt: '2099-01-01T00:00:00Z',
              },
            },
          },
        }),
      ),
    );
    reader('/summaries/vault-delve');
    expect(await screen.findByText(/Published 13 Sept? 2026/)).toBeVisible();
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated 19 Oct/)).not.toBeInTheDocument();
  });

  it('omits the facts card when the date is the only session detail', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              summaryDerived: {
                quests: [],
                regions: [],
                dms: [],
                players: [],
                occurredAt: '2026-10-18T10:00:00Z',
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByText('Played 18 Oct 2026')).toBeVisible();
    expect(screen.queryByLabelText('Session details')).not.toBeInTheDocument();
  });

  it('relates only entries from the same author or region rather than unrelated arc matches', async () => {
    server.use(
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: {
            gameCalendar: calendar,
            documents: {
              total: 3,
              items: [
                {
                  ...list.items[1],
                  title: 'By the same author',
                  author: { handle: 'mira' },
                  summaryDerived: { regions: [] },
                },
                {
                  ...list.items[0],
                  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  title: 'Unrelated entry',
                  author: { handle: 'ash' },
                  summaryDerived: { regions: [], arc: 'Deep Roads' },
                },
                {
                  ...list.items[0],
                  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  slug: 'same-region',
                  title: 'From this region',
                  author: { handle: 'ash' },
                  summaryDerived: {
                    regions: [
                      { id: 'other-region', name: 'Elsewhere' },
                      ...detail.summaryDerived.regions,
                    ],
                  },
                },
              ],
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    const related = await screen.findByRole('region', { name: 'Related entries' });
    expect(
      await within(related).findByRole('link', { name: /By the same author/ }),
    ).toHaveAttribute('href', '/chronicles/dm-table-notes');
    expect(
      within(related).getByRole('link', { name: /From this region/ }),
    ).toHaveAttribute('href', '/chronicles/same-region');
    expect(
      within(related).queryByRole('link', { name: /Unrelated entry/ }),
    ).not.toBeInTheDocument();
  });

  it('gives an action when no related entries or author are recorded', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: { bySlug: { ...detail, author: null, summaryDerived: null } },
        }),
      ),
      graphql.query('ChronicleList', () =>
        HttpResponse.json({
          data: { documents: { items: [], total: 0 }, gameCalendar: calendar },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    const related = await screen.findByRole('region', { name: 'Related entries' });
    expect(
      await within(related).findByText(
        'No other entries by this author or from these regions are available.',
      ),
    ).toBeVisible();
    expect(
      within(related).getByRole('link', { name: 'Browse Chronicles' }),
    ).toHaveAttribute('href', '/chronicles');
    expect(screen.getByText('No author is recorded for this entry.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Meet the community' })).toHaveAttribute(
      'href',
      '/community',
    );
  });

  it('rejects an empty authoritative quest code rather than constructing a guessed URL', () => {
    expect(
      parseChronicleDetail({
        ...detail,
        summaryDerived: {
          ...detail.summaryDerived,
          quests: [
            {
              id: '12345678-1234-4234-8234-123456789012',
              shortCode: '',
              title: null,
            },
          ],
        },
      }).ok,
    ).toBe(false);
  });

  it('does not guess relationships or editing permission from frontmatter', () => {
    const parsed = parseChronicleDetail({
      ...detail,
      frontmatter: { quest: 'Q-99', players: ['C-99'], canEditBody: true },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.canEdit).toBe(false);
      expect(
        parsed.data.summary?.players?.map((player) => player.characterShortCode),
      ).toEqual(['C-13']);
    }
    expect(parseChronicleDetail({ ...detail, canEditBody: undefined }).ok).toBe(false);
  });
});
