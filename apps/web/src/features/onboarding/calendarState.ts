import { z } from 'zod';
import { nextCivilDay } from '../../utils/format.js';

const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => value < '9999-12');
const page = z.coerce.number().int().min(1).max(42_949_672);
const status = z.enum(['', 'open', 'full', 'played', 'closed', 'cancelled']);
const optionalId = z.string().uuid().optional();
const stateSchema = z
  .object({
    month,
    day: civilDate.optional(),
    q: z.string().trim().max(200),
    status,
    page,
    realPage: page,
    gameDay: z.coerce.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
    dmId: optionalId,
    regionId: optionalId,
  })
  .refine((state) => !state.day || state.day.startsWith(state.month), {
    message: 'The selected day must be in the selected month.',
  });
export type CalendarState = z.infer<typeof stateSchema>;

export function parseCalendarState(params: URLSearchParams, today: string) {
  const day = params.get('day') ?? params.get('date') ?? undefined;
  return stateSchema.safeParse({
    month: params.get('month') ?? day?.slice(0, 7) ?? today.slice(0, 7),
    day,
    q: params.get('q') ?? params.get('search') ?? '',
    status: params.get('status') ?? '',
    page: params.get('page') ?? 1,
    realPage: params.get('realPage') ?? 1,
    gameDay: params.get('gameDay') ?? undefined,
    dmId: params.get('dmId') ?? undefined,
    regionId: params.get('regionId') ?? undefined,
  });
}

export function moveCivilMonth(value: string, delta: number): string {
  const date = new Date(`${value}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

export function lastCivilDay(value: string): string {
  const date = new Date(`${moveCivilMonth(value, 1)}-01T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function calendarWindow(state: CalendarState) {
  const realFrom = `${state.month}-01`;
  const realTo = `${moveCivilMonth(state.month, 1)}-01`;
  const scheduleFrom = state.day ?? realFrom;
  const scheduleTo = state.day ? nextCivilDay(state.day) : realTo;
  return {
    realFrom,
    realTo,
    selectedDate: state.day ?? realFrom,
    scheduledFrom: `${scheduleFrom}T00:00:00Z`,
    scheduledTo: `${scheduleTo}T00:00:00Z`,
  };
}
