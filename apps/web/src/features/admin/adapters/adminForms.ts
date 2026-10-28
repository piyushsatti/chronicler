import { z } from 'zod';
import { safeAppError } from '../../../errors/toAppError.js';

export type RegionDraft = {
  name: string;
  kind: string;
  documentId: string;
  charterDeadline: string;
  archons: string;
};
export function regionInput(draft: RegionDraft) {
  const archonMemberIds = [...new Set(draft.archons.split(/[\s,]+/).filter(Boolean))];
  const documentId = draft.documentId.trim() || null;
  const charterDeadline = draft.charterDeadline.trim() || null;
  if (
    !draft.name.trim() ||
    draft.name.trim().length > 200 ||
    !z.string().uuid().nullable().safeParse(documentId).success ||
    !z.array(z.string().uuid()).safeParse(archonMemberIds).success
  ) {
    throw safeAppError(
      'Enter a region name and valid Document and member UUIDs. Every archon UUID must be valid.',
      'admin:region',
    );
  }
  if (
    charterDeadline &&
    !z.string().datetime({ offset: true }).safeParse(charterDeadline).success
  )
    throw safeAppError(
      'Enter the charter deadline as a date and time with a timezone.',
      'admin:region',
    );
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    documentId,
    charterDeadline,
    archonMemberIds,
  };
}

/** `id` is a client-only row identity for keys and focus; it is never written. */
export type CalendarPeriodDraft = {
  id: string;
  name: string;
  type: 'month' | 'festival';
  days: string;
};
let periodDraftCount = 0;
export function newCalendarPeriodDraft(): CalendarPeriodDraft {
  periodDraftCount += 1;
  return { id: `period-${periodDraftCount}`, name: '', type: 'month', days: '' };
}
export type CalendarForm = {
  eraName: string;
  eraAbbrev: string;
  daysPerWeek: string;
  weekdays: string;
  rate: string;
  periods: CalendarPeriodDraft[];
};
function parseCalendarPeriods(value: unknown): CalendarPeriodDraft[] {
  const periods = z
    .array(
      z.object({
        name: z.string().optional(),
        type: z.string().optional(),
        days: z.number().optional(),
      }),
    )
    .safeParse(value);
  if (!periods.success) return [];
  return periods.data.map((period) => ({
    id: newCalendarPeriodDraft().id,
    name: period.name ?? '',
    type: period.type === 'festival' ? 'festival' : 'month',
    days: period.days === undefined ? '' : String(period.days),
  }));
}
/** Mirrors the API's period limits so the editor can explain them inline; the API stays the authority. */
export function calendarPeriodIssues(periods: readonly CalendarPeriodDraft[]): {
  list: string | null;
  rows: { name: string | null; days: string | null }[];
} {
  const rows = periods.map((period) => {
    const days = Number(period.days);
    return {
      name: !period.name.trim()
        ? 'Enter a period name.'
        : [...period.name.trim()].length > 200
          ? 'Period names can be at most 200 characters.'
          : null,
      days:
        period.days.trim() && Number.isInteger(days) && days >= 1 && days <= 366
          ? null
          : 'Days must be a whole number from 1 to 366.',
    };
  });
  const yearLength = periods.reduce((sum, period) => sum + (Number(period.days) || 0), 0);
  const list =
    periods.length < 1
      ? 'Add at least one period.'
      : periods.length > 36
        ? 'A calendar can have at most 36 periods.'
        : yearLength > 3660
          ? `A year can have at most 3660 days; these periods add up to ${yearLength}.`
          : null;
  return { list, rows };
}
export function hasCalendarPeriodIssues(issues: ReturnType<typeof calendarPeriodIssues>): boolean {
  return issues.list !== null || issues.rows.some((row) => row.name || row.days);
}
function periodValues(periods: readonly CalendarPeriodDraft[]) {
  return JSON.stringify(periods.map(({ name, type, days }) => [name, type, days]));
}
function isLegacyCalendar(definition: Record<string, unknown>): boolean {
  return 'months' in definition && !('periods' in definition);
}
function calendarFormChanged(original: CalendarForm, form: CalendarForm): boolean {
  return (
    form.eraName !== original.eraName ||
    form.eraAbbrev !== original.eraAbbrev ||
    form.daysPerWeek !== original.daysPerWeek ||
    form.weekdays !== original.weekdays ||
    form.rate !== original.rate ||
    periodValues(form.periods) !== periodValues(original.periods)
  );
}
/** True unless an untouched legacy `{epoch, months}` definition is saved back as it is. */
export function calendarWritesPeriods(
  definition: Record<string, unknown>,
  form: CalendarForm,
): boolean {
  return (
    !isLegacyCalendar(definition) ||
    calendarFormChanged(parseCalendarForm(definition), form)
  );
}
/** The API requires the era whenever the definition carries `periods`. */
export function calendarEraIssues(
  form: CalendarForm,
  writesPeriods: boolean,
): { name: string | null; abbrev: string | null } {
  if (!writesPeriods) return { name: null, abbrev: null };
  const name = form.eraName.trim(),
    abbrev = form.eraAbbrev.trim();
  return {
    name: !name
      ? 'Enter an era name.'
      : [...name].length > 200
        ? 'Era names can be at most 200 characters.'
        : null,
    abbrev: !abbrev
      ? 'Enter an era abbreviation.'
      : [...abbrev].length > 32
        ? 'Era abbreviations can be at most 32 characters.'
        : null,
  };
}
export function parseCalendarForm(definition: Record<string, unknown>): CalendarForm {
  const era = z
    .object({ name: z.string().optional(), abbrev: z.string().optional() })
    .safeParse(definition.era);
  const weekdays = z.array(z.string()).safeParse(definition.weekdays);
  return {
    eraName: era.success ? (era.data.name ?? '') : '',
    eraAbbrev: era.success ? (era.data.abbrev ?? '') : '',
    daysPerWeek:
      typeof definition.days_per_week === 'number'
        ? String(definition.days_per_week)
        : '',
    weekdays: weekdays.success ? weekdays.data.join(', ') : '',
    rate:
      typeof definition.rate_real_days_per_game_day === 'number'
        ? String(definition.rate_real_days_per_game_day)
        : '',
    periods: parseCalendarPeriods(definition.periods ?? definition.months),
  };
}
export function calendarInput(
  definition: Record<string, unknown>,
  form: CalendarForm,
): Record<string, unknown> {
  const original = parseCalendarForm(definition);
  const next = { ...definition };
  if (form.eraName !== original.eraName || form.eraAbbrev !== original.eraAbbrev) {
    const era = z.record(z.string(), z.unknown()).safeParse(definition.era);
    next.era = {
      ...(era.success ? era.data : {}),
      name: form.eraName.trim(),
      abbrev: form.eraAbbrev.trim(),
    };
  }
  if (form.daysPerWeek !== original.daysPerWeek) {
    const value = Number(form.daysPerWeek);
    if (!form.daysPerWeek.trim() || !Number.isSafeInteger(value) || value <= 0)
      throw safeAppError(
        'Days per week must be a positive whole number.',
        'admin:calendar',
      );
    next.days_per_week = value;
  }
  if (form.rate !== original.rate) {
    const value = Number(form.rate);
    if (!form.rate.trim() || !Number.isFinite(value) || value <= 0)
      throw safeAppError('Rate must be a positive finite number.', 'admin:calendar');
    next.rate_real_days_per_game_day = value;
  }
  if (form.weekdays !== original.weekdays)
    next.weekdays = form.weekdays
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  const issues = calendarPeriodIssues(form.periods);
  if (hasCalendarPeriodIssues(issues))
    throw safeAppError(
      issues.list ?? 'Fix the highlighted periods before saving.',
      'admin:calendar',
    );
  const writesPeriods = calendarWritesPeriods(definition, form);
  const era = calendarEraIssues(form, writesPeriods);
  if (era.name || era.abbrev)
    throw safeAppError(era.name ?? era.abbrev ?? '', 'admin:calendar');
  if (
    (writesPeriods && isLegacyCalendar(definition)) ||
    periodValues(form.periods) !== periodValues(original.periods)
  ) {
    // The API reads any definition with `months` as legacy and ignores its era, so a
    // changed legacy calendar is written in the current shape: `periods` replaces `months`.
    delete next.months;
    next.periods = form.periods.map((period) => ({
      name: period.name.trim(),
      type: period.type,
      days: Number(period.days),
    }));
  }
  return next;
}
export function timeAnchorInput(form: {
  realUtc: string;
  epochDay: string;
  rate: string;
  note: string;
}) {
  const epochDay = Number(form.epochDay),
    rate = Number(form.rate);
  if (
    !z.string().datetime({ offset: true }).safeParse(form.realUtc).success ||
    !form.epochDay.trim() ||
    !Number.isSafeInteger(epochDay) ||
    !form.rate.trim() ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw safeAppError(
      'Enter an RFC3339 time with a timezone, a whole epoch day, and a positive finite rate.',
      'admin:time-anchor',
    );
  }
  return { realUtc: form.realUtc, epochDay, rate, note: form.note.trim() || null };
}

const GREYHAWK_PRESET: Record<string, unknown> = {
  era: { name: 'Common Year', abbrev: 'CY' },
  days_per_week: 7,
  weekdays: [
    'Starday',
    'Sunday',
    'Moonday',
    'Godsday',
    'Waterday',
    'Earthday',
    'Freeday',
  ],
  periods: [
    { name: 'Needfest', type: 'festival', days: 7 },
    { name: 'Fireseek', type: 'month', days: 28 },
    { name: 'Readying', type: 'month', days: 28 },
    { name: 'Coldeven', type: 'month', days: 28 },
    { name: 'Growfest', type: 'festival', days: 7 },
    { name: 'Planting', type: 'month', days: 28 },
    { name: 'Flocktime', type: 'month', days: 28 },
    { name: 'Wealsun', type: 'month', days: 28 },
    { name: 'Richfest', type: 'festival', days: 7 },
    { name: 'Reaping', type: 'month', days: 28 },
    { name: 'Goodmonth', type: 'month', days: 28 },
    { name: 'Harvester', type: 'month', days: 28 },
    { name: 'Brewfest', type: 'festival', days: 7 },
    { name: 'Patchwall', type: 'month', days: 28 },
    { name: "Ready'reat", type: 'month', days: 28 },
    { name: 'Sunsebb', type: 'month', days: 28 },
  ],
  leap: null,
  rate_real_days_per_game_day: 1,
  moons: [
    { name: 'Luna', cycle_days: 28 },
    { name: 'Celene', cycle_days: 91 },
  ],
};

export const calendarPreset = {
  definition: GREYHAWK_PRESET,
  form: parseCalendarForm(GREYHAWK_PRESET),
};
