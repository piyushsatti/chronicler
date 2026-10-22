import { z } from 'zod';
import type {
  RetainedCalendarQuery,
  RetainedCalendarQuestsQuery,
  RetainedRealDatesQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { calendarWindow, type CalendarState } from '../calendarState.js';
import CALENDAR from './calendar.graphql?raw';
import QUESTS from './calendarQuests.graphql?raw';
import REAL_DATES from './calendarRealDates.graphql?raw';

const namedDate = z.object({
  eraAbbrev: z.string().min(1),
  year: z.number().int(),
  periodName: z.string().min(1),
  periodIndex: z.number().int().nonnegative(),
  periodType: z.enum(['month', 'festival']),
  day: z.number().int().positive(),
});
const calendarSchema = z.object({
  gameCalendar: z.object({
    currentGameDay: z.number().int().nullable(),
    currentGameDate: namedDate.nullable(),
    monthGrid: z.array(
      z.object({
        realDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        gameDay: z.number().int().nullable(),
      }),
    ),
  }),
  gameDate: namedDate.nullable(),
});
const questSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().min(1),
  status: z.string(),
  displayStatus: z.string().nullable(),
  scheduledAt: z.string().datetime({ offset: true }),
  slotsMax: z.number().int().nonnegative(),
  filledCount: z.number().int().nonnegative(),
  dm: z.object({ handle: z.string(), displayName: z.string() }).nullable(),
  briefDocument: z.object({ title: z.string() }).nullable(),
});
const questsSchema = z.object({
  items: z.array(questSchema),
  total: z.number().int().nonnegative(),
});
const realDatesSchema = z.object({
  items: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  total: z.number().int().nonnegative(),
});
export type CalendarView = z.infer<typeof calendarSchema>;
type CalendarQuestsView = z.infer<typeof questsSchema>;
type CalendarRealDatesView = z.infer<typeof realDatesSchema>;

export async function loadCalendar(state: CalendarState): Promise<CalendarView> {
  try {
    const { realFrom, realTo, selectedDate } = calendarWindow(state);
    return calendarSchema.parse(
      await graphqlRequest<RetainedCalendarQuery>(CALENDAR, {
        realFrom,
        realTo,
        selectedDate,
      }),
    );
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'calendar:dates',
    );
  }
}
export async function loadCalendarQuests(
  state: CalendarState,
): Promise<CalendarQuestsView> {
  try {
    const window = calendarWindow(state);
    const filters = {
      scheduledFrom: window.scheduledFrom,
      scheduledTo: window.scheduledTo,
      ...(state.status ? { status: state.status } : {}),
      ...(state.q ? { search: state.q } : {}),
      ...(state.dmId ? { dmId: state.dmId } : {}),
      ...(state.regionId ? { regionId: state.regionId } : {}),
    };
    const wire = await graphqlRequest<RetainedCalendarQuestsQuery>(QUESTS, {
      filters,
      offset: (state.page - 1) * 50,
    });
    return questsSchema.parse(wire.quests);
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'calendar:quests',
    );
  }
}
export async function loadRealDates(
  gameDay: number,
  page: number,
): Promise<CalendarRealDatesView> {
  try {
    const wire = await graphqlRequest<RetainedRealDatesQuery>(REAL_DATES, {
      gameDay,
      offset: (page - 1) * 50,
    });
    return realDatesSchema.parse(wire.realDates);
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'calendar:real-dates',
    );
  }
}
