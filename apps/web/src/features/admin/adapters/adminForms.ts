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

export type CalendarForm = {
  eraName: string;
  eraAbbrev: string;
  daysPerWeek: string;
  weekdays: string;
  rate: string;
};
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
