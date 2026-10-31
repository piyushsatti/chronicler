import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import {
  calendarWindow,
  moveCivilMonth,
  parseCalendarState,
} from '../../../src/features/onboarding/calendarState.js';
import {
  loadCalendar,
  loadCalendarQuests,
  loadRealDates,
} from '../../../src/features/onboarding/adapters/calendarAdapter.js';
import {
  loadSeriesArc,
  loadSeriesAuthority,
} from '../../../src/features/onboarding/adapters/seriesAdapter.js';
import { loadRetainedDocument } from '../../../src/features/onboarding/adapters/retainedDocumentAdapter.js';
import good from '../../fixtures/wire/onboarding/retained-good.json';

describe('Calendar URL and server reads', () => {
  it('calendar quest windows use the member zone across DST', async () => {
    const seen: unknown[] = [];
    server.use(
      graphql.query('RetainedCalendarQuests', ({ variables }) => {
        seen.push(variables);
        return HttpResponse.json({ data: { quests: { total: 0, items: [] } } });
      }),
    );
    for (const [day, from, to, hours, evening] of [
      ['2026-10-14', '2026-10-14T05:00:00Z', '2026-10-15T05:00:00Z', 24, '2026-10-15T01:00:00Z'],
      ['2026-03-08', '2026-03-08T06:00:00Z', '2026-03-09T05:00:00Z', 23, '2026-03-09T01:00:00Z'],
      ['2026-11-01', '2026-11-01T05:00:00Z', '2026-11-02T06:00:00Z', 25, '2026-11-02T02:00:00Z'],
    ] as const) {
      const state = parseCalendarState(new URLSearchParams({ day }), day);
      if (!state.success) throw state.error;
      await loadCalendarQuests(state.data, 'America/Chicago');
      expect(seen.at(-1)).toEqual({
        filters: { scheduledFrom: from, scheduledTo: to },
        offset: 0,
      });
      expect((Date.parse(to) - Date.parse(from)) / 3_600_000).toBe(hours);
      expect(Date.parse(evening)).toBeGreaterThanOrEqual(Date.parse(from));
      expect(Date.parse(evening)).toBeLessThan(Date.parse(to));
      const lastMillisecond = Date.parse(to) - 1;
      expect(lastMillisecond).toBeGreaterThanOrEqual(Date.parse(from));
      expect(lastMillisecond).toBeLessThan(Date.parse(to));
    }
  });
  it('restores legacy date/search and every server filter/page without changing civil boundaries', async () => {
    const state = parseCalendarState(
      new URLSearchParams(
        'date=2026-10-14&search=salt&status=open&page=2&realPage=3&gameDay=-1&dmId=00000000-0000-4000-8000-000000000032&regionId=00000000-0000-4000-8000-000000000033',
      ),
      '2026-01-01',
    );
    if (!state.success) throw state.error;
    expect(calendarWindow(state.data, 'UTC')).toEqual({
      realFrom: '2026-10-01',
      realTo: '2026-11-01',
      selectedDate: '2026-10-14',
      scheduledFrom: '2026-10-14T00:00:00Z',
      scheduledTo: '2026-10-15T00:00:00Z',
    });
    const seen: unknown[] = [];
    server.use(
      graphql.query('RetainedCalendarQuests', ({ variables }) => {
        seen.push(variables);
        return HttpResponse.json({ data: { quests: { total: 51, items: [] } } });
      }),
      graphql.query('RetainedRealDates', ({ variables }) => {
        seen.push(variables);
        return HttpResponse.json({
          data: { realDates: { total: 101, items: ['2026-10-14'] } },
        });
      }),
    );
    expect(await loadCalendarQuests(state.data, 'UTC')).toEqual({ total: 51, items: [] });
    expect(await loadRealDates(-1, 3)).toEqual({ total: 101, items: ['2026-10-14'] });
    expect(seen).toEqual([
      {
        filters: {
          scheduledFrom: '2026-10-14T00:00:00Z',
          scheduledTo: '2026-10-15T00:00:00Z',
          search: 'salt',
          status: 'open',
          dmId: good.arc.createdBy,
          regionId: good.document.id,
        },
        offset: 50,
      },
      { gameDay: -1, offset: 100 },
    ]);
  });
  it.each([
    'day=2026-02-30',
    'month=2026-10&day=2026-11-01',
    'page=0',
    'gameDay=2147483648',
    'dmId=historical',
    'status=unknown',
    'month=9999-12',
  ])('rejects invalid location %s', (query) => {
    expect(parseCalendarState(new URLSearchParams(query), '2026-10-20').success).toBe(
      false,
    );
  });
  it('uses civil leap/month transitions without computing game dates', () => {
    const leapDay = parseCalendarState(
      new URLSearchParams('day=2024-02-29'),
      '2024-01-01',
    );
    if (!leapDay.success) throw leapDay.error;
    expect(calendarWindow(leapDay.data, 'UTC')).toMatchObject({
      realFrom: '2024-02-01',
      realTo: '2024-03-01',
      scheduledFrom: '2024-02-29T00:00:00Z',
      scheduledTo: '2024-03-01T00:00:00Z',
    });
    expect(moveCivilMonth('2026-01', -1)).toBe('2025-12');
    const state = parseCalendarState(
      new URLSearchParams('month=2026-12'),
      '2026-01-01',
    );
    if (!state.success) throw state.error;
    expect(calendarWindow(state.data, 'UTC').scheduledTo).toBe('2027-01-01T00:00:00Z');
  });
  it('keeps zero-day fields and missing mappings from the server, and rejects fabricated/incomplete names', async () => {
    const state = parseCalendarState(
      new URLSearchParams('day=2026-10-14'),
      '2026-01-01',
    );
    if (!state.success) throw state.error;
    server.use(
      graphql.query('RetainedCalendar', () =>
        HttpResponse.json({
          data: {
            gameCalendar: { ...good.calendar, currentGameDay: 0 },
            gameDate: null,
          },
        }),
      ),
    );
    const result = await loadCalendar(state.data);
    expect(result.gameCalendar.currentGameDay).toBe(0);
    expect(result.gameCalendar.monthGrid[1].gameDay).toBeNull();
    expect(result.gameDate).toBeNull();
    server.use(
      graphql.query('RetainedCalendar', () =>
        HttpResponse.json({
          data: {
            gameCalendar: { ...good.calendar, currentGameDate: { year: 0, day: 1 } },
            gameDate: null,
          },
        }),
      ),
    );
    await expect(loadCalendar(state.data)).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('retained Series and Guild identities', () => {
  it('reads all nested Quest pages with actual opaque short codes', async () => {
    const offsets: unknown[] = [];
    server.use(
      graphql.query('RetainedSeriesArc', ({ variables }) => {
        offsets.push(variables.offset);
        const offset = Number(variables.offset);
        const quests = Array.from({ length: offset === 0 ? 50 : 1 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + offset + 100).padStart(12, '0')}`,
          shortCode: `opaque-code-${index + offset}`,
          status: 'open',
          displayStatus: 'open',
          scheduledAt: '2026-10-14T18:00:00Z',
          slotsMax: 4,
          dm: null,
          participants: [],
          briefDocument: { title: `Quest ${index + offset}`, effectiveBody: null },
        }));
        return HttpResponse.json({
          data: { questArc: { ...good.arc, questCount: 51, quests } },
        });
      }),
    );
    expect((await loadSeriesArc(good.arc.id))?.quests).toHaveLength(51);
    expect(offsets).toEqual([0, 50]);
  });
  it('fails a nonadvancing or changed series instead of claiming a complete list', async () => {
    server.use(
      graphql.query('RetainedSeriesArc', () =>
        HttpResponse.json({
          data: { questArc: { ...good.arc, questCount: 1, quests: [] } },
        }),
      ),
    );
    await expect(loadSeriesArc(good.arc.id)).rejects.toMatchObject({ kind: 'invalid' });
  });
  it.each([
    ['pending', false],
    ['rejected', false],
    ['approved', true],
  ])('admits create from current approved DM facts (%s)', async (status, allowed) => {
    server.use(
      graphql.query('RetainedSeriesAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: good.arc.createdBy, roles: ['dm'], status: 'active' },
              dmProfile: { status },
            },
          },
        }),
      ),
    );
    expect((await loadSeriesAuthority('dm')).canCreate).toBe(allowed);
  });
  it('resolves exact UUID and slug to the actual canonical reader and never searches unknown codes', async () => {
    expect((await loadRetainedDocument(good.document.id))?.href).toBe(
      '/codex/salt-road-guild',
    );
    expect((await loadRetainedDocument(good.document.slug))?.id).toBe(good.document.id);
    expect(await loadRetainedDocument('historic-G-12')).toBeNull();
    server.use(
      graphql.query('RetainedDocumentBySlug', () =>
        HttpResponse.json({
          data: {
            document: {
              ...good.document,
              slug: 'actual ruling',
              kind: 'rule',
              category: 'ruling',
            },
          },
        }),
      ),
    );
    expect((await loadRetainedDocument('alias'))?.href).toBe(
      '/rules/rulings/actual%20ruling',
    );
  });
});
