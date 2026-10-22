import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { loadHomeLanes } from '../../../src/features/home/adapters/homeLanesAdapter.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/home/lanes-good.json';

function quests(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...good.quests.items[0],
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    scheduledAt: new Date(Date.UTC(2026, 9, 22, 12, index)).toISOString(),
  }));
}

function firstPage(items = quests(51)) {
  return {
    ...good,
    questBoard: { ...good.questBoard, total: 91 },
    quests: { items: items.slice(0, 12), total: items.length },
    recentlyClosedQuests: { ...good.recentlyClosedQuests, total: 42 },
    communityDirectory: good.communityDirectory,
  };
}

describe('Home upcoming window pagination', () => {
  it('retains12 previews and authoritative totals while completing all51 schedule entries', async () => {
    const items = quests(51);
    const requests: Record<string, unknown>[] = [];
    server.use(
      graphql.query('HomeWarRoom', () => HttpResponse.json({ data: firstPage(items) })),
      graphql.query('HomeUpcoming', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({
          data: { quests: { items: items.slice(12), total: 51 } },
        });
      }),
    );
    const result = await loadHomeLanes();
    expect(result.upcoming).toHaveLength(12);
    expect(result.upcomingSchedule).toEqual(
      items.map(({ id, scheduledAt }) => ({ id, scheduledAt })),
    );
    expect(result.totals).toEqual({
      questBoard: 91,
      upcoming: 51,
      recentlyClosed: 42,
      dmsAccepting: 1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ offset: 12 });
  });

  it('advances offsets by actual page size with one fixed window and no duplicate entries', async () => {
    const items = quests(213);
    const windows: Record<string, unknown>[] = [];
    server.use(
      graphql.query('HomeWarRoom', ({ variables }) => {
        windows.push(variables);
        return HttpResponse.json({ data: firstPage(items) });
      }),
      graphql.query('HomeUpcoming', ({ variables }) => {
        windows.push(variables);
        const offset = Number(variables.offset);
        return HttpResponse.json({
          data: { quests: { items: items.slice(offset, offset + 100), total: 213 } },
        });
      }),
    );
    const result = await loadHomeLanes();
    expect(result.upcomingSchedule).toHaveLength(213);
    expect(new Set(result.upcomingSchedule.map((item) => item.id)).size).toBe(213);
    expect(windows.slice(1).map((v) => v.offset)).toEqual([12, 112, 212]);
    for (const window of windows.slice(1)) {
      expect(window.upcomingFrom).toBe(windows[0]?.upcomingFrom);
      expect(window.upcomingTo).toBe(windows[0]?.upcomingTo);
    }
  });

  it.each(['duplicate', 'empty', 'changed total', 'overrun', 'invalid date'])(
    'rejects a %s later page instead of returning partial schedule counts',
    async (failure) => {
      const items = quests(51);
      const page = {
        items: items.slice(12).map(({ id, scheduledAt }) => ({ id, scheduledAt })),
        total: 51,
      };
      if (failure === 'duplicate') page.items[0] = { ...items[0]! };
      if (failure === 'empty') page.items = [];
      if (failure === 'changed total') page.total = 50;
      if (failure === 'overrun') page.items.push({ ...items[50]! });
      if (failure === 'invalid date') page.items[0]!.scheduledAt = 'not a date';
      server.use(
        graphql.query('HomeWarRoom', () =>
          HttpResponse.json({ data: firstPage(items) }),
        ),
        graphql.query('HomeUpcoming', () =>
          HttpResponse.json({ data: { quests: page } }),
        ),
      );
      await expect(loadHomeLanes()).rejects.toMatchObject({ kind: 'invalid' });
    },
  );

  it('fails the whole load when a later page is forbidden', async () => {
    server.use(
      graphql.query('HomeWarRoom', () => HttpResponse.json({ data: firstPage() })),
      graphql.query('HomeUpcoming', () =>
        HttpResponse.json({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }),
      ),
    );
    await expect(loadHomeLanes()).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('stops after an abort without continuing to the next page or returning partial data', async () => {
    const controller = new AbortController();
    let pages = 0;
    const items = quests(213);
    server.use(
      graphql.query('HomeWarRoom', () => HttpResponse.json({ data: firstPage(items) })),
      graphql.query('HomeUpcoming', () => {
        pages++;
        controller.abort();
        return HttpResponse.json({
          data: { quests: { items: items.slice(12, 112), total: 213 } },
        });
      }),
    );
    await expect(loadHomeLanes(controller.signal)).rejects.toBeDefined();
    expect(pages).toBe(1);
  });

  it.each([
    {
      label: 'member',
      token: 'home-test-original',
      header: 'Bearer home-test-original',
    },
    { label: 'guest', token: null, header: '' },
  ])(
    'pins the $label actor across requests when storage changes',
    async ({ token, header }) => {
      const authorizations: Array<string | null> = [];
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      server.use(
        graphql.query('HomeWarRoom', ({ request }) => {
          authorizations.push(request.headers.get('Authorization'));
          localStorage.setItem(TOKEN_KEY, 'home-test-other');
          return HttpResponse.json({ data: firstPage() });
        }),
        graphql.query('HomeUpcoming', ({ request }) => {
          authorizations.push(request.headers.get('Authorization'));
          return HttpResponse.json({
            data: { quests: { items: quests(51).slice(12), total: 51 } },
          });
        }),
      );
      await loadHomeLanes();
      expect(authorizations).toEqual([header, header]);
    },
  );
});

function dmCandidates(count: number, eligible: (index: number) => boolean) {
  return Array.from({ length: count }, (_, index) => ({
    ...good.communityDirectory.entries[0],
    memberId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    handle: `dm-${String(index).padStart(3, '0')}`,
    displayName: `DM ${index}`,
    acceptingPlayers: true,
    isDm: eligible(index),
  }));
}

describe('Home qualified accepting DMs', () => {
  it.each([
    { name: 'all unapproved', count: 5, eligible: () => false, offsets: [] },
    { name: 'exact preview boundary', count: 12, eligible: () => true, offsets: [] },
    {
      name: 'first approved after candidate12',
      count: 13,
      eligible: (i: number) => i === 12,
      offsets: [12],
    },
    {
      name: 'mixed eligible population',
      count: 51,
      eligible: (i: number) => i % 3 === 0,
      offsets: [12],
    },
    { name: 'exact full later page', count: 112, eligible: () => true, offsets: [12] },
    {
      name: 'multiple candidate pages',
      count: 213,
      eligible: (i: number) => i % 2 === 0,
      offsets: [12, 112, 212],
    },
  ])(
    'counts only server-qualified DMs across $name',
    async ({ count, eligible, offsets }) => {
      const entries = dmCandidates(count, eligible);
      const readOffsets: unknown[] = [];
      server.use(
        graphql.query('HomeWarRoom', () =>
          HttpResponse.json({
            data: {
              ...good,
              communityDirectory: { entries: entries.slice(0, 12), total: count },
            },
          }),
        ),
        graphql.query('HomeAcceptingDms', ({ variables }) => {
          readOffsets.push(variables.offset);
          const offset = Number(variables.offset);
          return HttpResponse.json({
            data: {
              communityDirectory: {
                entries: entries.slice(offset, offset + 100),
                total: count,
              },
            },
          });
        }),
      );
      const result = await loadHomeLanes();
      const qualified = entries.filter((entry) => entry.isDm);
      expect(result.totals.dmsAccepting).toBe(qualified.length);
      expect(result.dmsAccepting.map((entry) => entry.memberId)).toEqual(
        qualified.slice(0, 12).map((entry) => entry.memberId),
      );
      expect(readOffsets).toEqual(offsets);
    },
  );

  it.each(['duplicate', 'empty', 'changed total', 'overrun', 'invalid eligibility'])(
    'rejects a %s DM candidate page instead of publishing a partial qualified count',
    async (failure) => {
      const entries = dmCandidates(24, (i) => i >= 12);
      const page: { entries: unknown[]; total: number } = {
        entries: entries.slice(12),
        total: 24,
      };
      if (failure === 'duplicate') page.entries[0] = entries[0];
      if (failure === 'empty') page.entries = [];
      if (failure === 'changed total') page.total = 23;
      if (failure === 'overrun') page.entries.push(entries[23]);
      if (failure === 'invalid eligibility')
        page.entries[0] = { ...entries[12], isDm: 'approved' };
      server.use(
        graphql.query('HomeWarRoom', () =>
          HttpResponse.json({
            data: {
              ...good,
              communityDirectory: { entries: entries.slice(0, 12), total: 24 },
            },
          }),
        ),
        graphql.query('HomeAcceptingDms', () =>
          HttpResponse.json({ data: { communityDirectory: page } }),
        ),
      );
      await expect(loadHomeLanes()).rejects.toMatchObject({ kind: 'invalid' });
    },
  );

  it('fails the complete Home load when a later DM page is forbidden', async () => {
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: {
            ...good,
            communityDirectory: { ...good.communityDirectory, total: 24 },
          },
        }),
      ),
      graphql.query('HomeAcceptingDms', () =>
        HttpResponse.json({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }),
      ),
    );
    await expect(loadHomeLanes()).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('aborts the candidate scan without later requests or partial success', async () => {
    const entries = dmCandidates(213, () => true);
    const controller = new AbortController();
    let pages = 0;
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: {
            ...good,
            communityDirectory: { entries: entries.slice(0, 12), total: 213 },
          },
        }),
      ),
      graphql.query('HomeAcceptingDms', () => {
        pages++;
        controller.abort();
        return HttpResponse.json({
          data: { communityDirectory: { entries: entries.slice(12, 112), total: 213 } },
        });
      }),
    );
    await expect(loadHomeLanes(controller.signal)).rejects.toBeDefined();
    expect(pages).toBe(1);
  });
});
