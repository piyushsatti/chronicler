import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import {
  formatInstant,
  longDateLabel,
  monthLabel as civilMonthLabel,
  personLabels,
  pluralize,
  statusLabel,
  weekdayColumn,
} from '../../../utils/format.js';
import type { CalendarView } from '../adapters/calendarAdapter.js';
import { moveCivilMonth } from '../calendarState.js';
import { useCalendarPage } from '../hooks/useCalendarPage.js';
import styles from './calendar.module.css';

const PAGE_SIZE = 50;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const STATUSES = ['', 'open', 'full', 'played', 'closed', 'cancelled'] as const;

function namedDate(date: CalendarView['gameDate']): string | null {
  return date ? `${date.day} ${date.periodName}, ${date.year} ${date.eraAbbrev}` : null;
}

/** Search and status filters above the calendar; Enter in the search box applies it. */
function CalendarFilters({
  page,
  total,
}: {
  page: ReturnType<typeof useCalendarPage>;
  total: number | undefined;
}): React.JSX.Element | null {
  const state = page.state;
  const [draft, setDraft] = useState(state?.q ?? '');
  if (!state) return null;
  return (
    <form
      role="search"
      aria-label="Search quests"
      onSubmit={(event) => {
        event.preventDefault();
        page.update({ q: draft, page: undefined });
      }}
    >
      <FilterBar
        label="Filter quests"
        count={total === undefined ? undefined : pluralize(total, 'quest')}
      >
        <FilterBar.Search
          label="Search quests"
          placeholder="Search quests"
          value={draft}
          onValueChange={setDraft}
        />
        <FilterBar.Group label="Status">
          {STATUSES.map((status) => (
            <Chip
              key={status || 'all'}
              selected={state.status === status}
              onClick={() => page.update({ status, page: undefined })}
            >
              {status ? statusLabel(status) : 'All statuses'}
            </Chip>
          ))}
        </FilterBar.Group>
      </FilterBar>
    </form>
  );
}

export function CalendarPage(): React.JSX.Element {
  const page = useCalendarPage();
  const questDmLabels = personLabels((page.quests.data?.items ?? []).map((quest) => quest.dm));
  const dates = useDateFormatter();
  const state = page.state;
  const grid = page.calendar.data?.gameCalendar.monthGrid ?? [];
  const unmapped = grid.filter((cell) => cell.gameDay === null).length;
  const selectedCell = state?.day
    ? grid.find((cell) => cell.realDate === state.day)
    : undefined;
  const monthLabel = state ? civilMonthLabel(state.month) : '';
  const scopeLabel = state?.day ? formatInstant(state.day) : monthLabel;
  return (
    <PageShell title="Calendar" context="war-room">
      <SingleRegionPage page="calendar">
        {!state ? (
          <div className="stack">
            <p role="alert">This calendar link contains an invalid date or filter.</p>
            <Button onClick={page.reset}>Open current month</Button>
          </div>
        ) : (
          <div className={`stack ${styles.wrap}`} data-gap="5">
            <p className="type-body">
              Quests by date, set against the campaign calendar. Times follow your{' '}
              <Link to="/settings">time zone setting</Link>.
            </p>
            <CalendarFilters
              key={state.q}
              page={page}
              total={page.quests.data?.total}
            />
            <div className={styles.layout}>
              <section
                className={`card stack ${styles.panel} ${styles.monthCard}`}
                data-gap="4"
                aria-label="Campaign calendar"
              >
                <div className={styles.monthHead}>
                  <h2 className="type-heading" aria-live="polite">
                    {monthLabel}
                  </h2>
                  <div className="row" data-gap="2" data-align="center">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Previous month"
                      disabled={state.month === '0000-01'}
                      onClick={() =>
                        page.update({
                          month: moveCivilMonth(state.month, -1),
                          day: undefined,
                          page: undefined,
                        })
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={state.month === page.today.slice(0, 7)}
                      onClick={() =>
                        page.update({
                          month: page.today.slice(0, 7),
                          day: undefined,
                          page: undefined,
                        })
                      }
                    >
                      Today
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Next month"
                      disabled={state.month === '9999-11'}
                      onClick={() =>
                        page.update({
                          month: moveCivilMonth(state.month, 1),
                          day: undefined,
                          page: undefined,
                        })
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
                {page.calendar.isError ? (
                  <StatePanel
                    variant="inline"
                    status="error"
                    error={toAppError(page.calendar.error, 'calendar:read')}
                    onRetry={page.retryCalendar}
                    retryLabel="Retry calendar"
                  />
                ) : page.calendar.isPending ? (
                  <StatePanel variant="inline" status="loading" />
                ) : (
                  <>
                    <p className="type-caption">
                      Today in the campaign:{' '}
                      {namedDate(page.calendar.data.gameCalendar.currentGameDate) ??
                        'not recorded'}
                    </p>
                    <div className="stack" data-gap="1">
                      <div
                        className={`${styles.weekdays} type-label`}
                        aria-hidden="true"
                      >
                        {WEEKDAYS.map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      {page.quests.isSuccess && page.quests.data.total === 0 &&
                      !state.day && !state.q && !state.status && !state.dmId && !state.regionId ? (
                        <p className="type-caption">No quests this month</p>
                      ) : null}
                      <div
                        className={styles.days}
                        role="list"
                        aria-label={`Days in ${monthLabel}`}
                      >
                        {grid.length
                          ? Array.from(
                              { length: weekdayColumn(grid[0]!.realDate) },
                              (_, i) => <span key={`blank-${i}`} aria-hidden="true" />,
                            )
                          : null}
                        {grid.map((cell) => {
                          const label = formatInstant(cell.realDate);
                          const selected = state.day === cell.realDate;
                          return (
                            <div role="listitem" key={cell.realDate}>
                              <button
                                type="button"
                                className={styles.day}
                                aria-pressed={selected}
                                aria-label={
                                  cell.gameDay === null
                                    ? `${label}, no game day recorded`
                                    : `${label}, game day ${cell.gameDay}`
                                }
                                data-today={
                                  cell.realDate === page.today ? '1' : undefined
                                }
                                data-unmapped={cell.gameDay === null ? '1' : undefined}
                                onClick={() =>
                                  page.update({
                                    day: selected ? undefined : cell.realDate,
                                    page: undefined,
                                  })
                                }
                              >
                                <time
                                  className={`type-ui ${styles.dayNumber}`}
                                  dateTime={cell.realDate}
                                >
                                  {Number(cell.realDate.slice(8, 10))}
                                </time>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className={`type-caption ${styles.legend}`}>
                      {unmapped > 0 ? (
                        <span>
                          Dashed days have no recorded game day
                          {unmapped === 1 ? ' (1 day).' : ` (${unmapped} days).`}
                        </span>
                      ) : null}
                    </p>
                  </>
                )}
              </section>

              <div className="stack" data-gap="5">
                {state.day ? (
                  <section
                    className={`card stack ${styles.panel}`}
                    data-gap="2"
                    aria-label="Selected date"
                  >
                    <h2 className="type-title">{longDateLabel(state.day)}</h2>
                    {page.calendar.isPending || page.calendar.isError ? null : (
                      <p className="type-body">
                        {namedDate(page.calendar.data.gameDate) ??
                          'No game date is recorded for this day.'}
                      </p>
                    )}
                    <div className="row" data-wrap="1" data-gap="2">
                      {selectedCell && selectedCell.gameDay !== null ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            page.update({
                              gameDay: String(selectedCell.gameDay),
                              realPage: undefined,
                            })
                          }
                        >
                          Other dates for game day {selectedCell.gameDay}
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => page.update({ day: undefined, page: undefined })}
                      >
                        Show whole month
                      </Button>
                    </div>
                  </section>
                ) : null}

                <section
                  className={`card stack ${styles.panel}`}
                  data-gap="3"
                  aria-label="Quest schedule"
                >
                  <div className="stack" data-gap="1">
                    <h2 className="type-title">Quest schedule</h2>
                    <p className="type-caption">{scopeLabel}</p>
                  </div>
                  {state.dmId || state.regionId ? (
                    <div className="row" data-wrap="1" data-gap="2" data-align="center">
                      <p className="type-caption">
                        This link also filters {state.dmId ? 'by DM' : ''}
                        {state.dmId && state.regionId ? ' and ' : ''}
                        {state.regionId ? 'by region' : ''}.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          page.update({
                            dmId: undefined,
                            regionId: undefined,
                            page: undefined,
                          })
                        }
                      >
                        Clear linked filters
                      </Button>
                    </div>
                  ) : null}
                  {page.quests.isError ? (
                    <StatePanel
                      variant="inline"
                      status="error"
                      error={toAppError(page.quests.error, 'calendar:quests')}
                      onRetry={page.retryQuests}
                      retryLabel="Retry quests"
                    />
                  ) : page.quests.isPending ? (
                    <StatePanel variant="inline" status="loading" />
                  ) : (
                    <>
                      <p className="type-caption" hidden={page.quests.data.total === 0}>
                        {pluralize(page.quests.data.total, 'quest')}
                        {page.quests.data.total > PAGE_SIZE
                          ? `, page ${state.page} of ${Math.ceil(page.quests.data.total / PAGE_SIZE)}`
                          : ''}
                      </p>
                      {page.quests.data.items.length ? (
                        <ul className={styles.questList}>
                          {page.quests.data.items.map((quest, index) => (
                            <li key={quest.id} className={styles.questRow}>
                              <div
                                className="row"
                                data-justify="between"
                                data-align="center"
                                data-gap="2"
                              >
                                <Link
                                  className="type-title"
                                  to={`/quests/${encodeURIComponent(quest.shortCode)}`}
                                >
                                  {quest.briefDocument?.title ?? quest.shortCode}
                                </Link>
                                <Chip size="sm" tone="line">
                                  {statusLabel(quest.displayStatus ?? quest.status)}
                                </Chip>
                              </div>
                              <span className="type-caption">
                                {dates.formatScheduled(quest.scheduledAt)},{' '}
                                {quest.filledCount} of{' '}
                                {pluralize(quest.slotsMax, 'seat')} filled
                                {quest.dm ? `, run by ${questDmLabels[index]}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <StatePanel
                          variant="inline"
                          status="empty"
                          emptyMessage={
                            page.quests.data.total
                              ? 'No quests on this page.'
                              : state.day
                                ? 'No quests are scheduled for this day.'
                                : 'No quests are scheduled this month.'
                          }
                          action={
                            page.quests.data.total ? undefined : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  page.update({
                                    month: moveCivilMonth(state.month, 1),
                                    day: undefined,
                                    page: undefined,
                                  })
                                }
                              >
                                Show next month
                              </Button>
                            )
                          }
                        />
                      )}
                      {page.quests.data.total > PAGE_SIZE || state.page > 1 ? (
                        <div className="row" data-wrap="1" data-gap="2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={state.page <= 1}
                            onClick={() =>
                              page.update({ page: String(state.page - 1) })
                            }
                          >
                            Previous quests
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={state.page * PAGE_SIZE >= page.quests.data.total}
                            onClick={() =>
                              page.update({ page: String(state.page + 1) })
                            }
                          >
                            Next quests
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section
                  className={`card stack ${styles.panel}`}
                  data-gap="3"
                  aria-label="Find real dates"
                >
                  <h2 className="type-title">Find real dates for a game day</h2>
                  <form
                    key={state.gameDay ?? ''}
                    className="row"
                    data-gap="2"
                    data-align="end"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      page.update({
                        gameDay: String(data.get('gameDay') ?? ''),
                        realPage: undefined,
                      });
                    }}
                  >
                    <div data-grow="1">
                      <Field
                        label="Game day"
                        type="number"
                        inputMode="numeric"
                        name="gameDay"
                        min={-2_147_483_648}
                        max={2_147_483_647}
                        step={1}
                        required
                        defaultValue={state.gameDay}
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      Find dates
                    </Button>
                  </form>
                  {state.gameDay === undefined ? null : page.realDates.isError ? (
                    <StatePanel
                      variant="inline"
                      status="error"
                      error={toAppError(page.realDates.error, 'calendar:real-dates')}
                      onRetry={page.retryRealDates}
                      retryLabel="Retry dates"
                    />
                  ) : page.realDates.isPending ? (
                    <StatePanel variant="inline" status="loading" />
                  ) : (
                    <>
                      <p className="type-caption">
                        Game day {state.gameDay} falls on{' '}
                        {pluralize(page.realDates.data.total, 'stored date')}
                        {page.realDates.data.total > PAGE_SIZE
                          ? ` · Page ${state.realPage}`
                          : ''}
                      </p>
                      {page.realDates.data.items.length ? (
                        <ul className={styles.dateList}>
                          {page.realDates.data.items.map((date) => (
                            <li key={date}>
                              <Chip
                                size="sm"
                                tone="line"
                                selected={state.day === date}
                                onClick={() =>
                                  page.update({
                                    month: date.slice(0, 7),
                                    day: date,
                                    page: undefined,
                                  })
                                }
                              >
                                {formatInstant(date)}
                              </Chip>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <StatePanel
                          variant="inline"
                          status="empty"
                          emptyMessage="No real dates are stored for this game day."
                        />
                      )}
                      {page.realDates.data.total > PAGE_SIZE || state.realPage > 1 ? (
                        <div className="row" data-wrap="1" data-gap="2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={state.realPage <= 1}
                            onClick={() =>
                              page.update({ realPage: String(state.realPage - 1) })
                            }
                          >
                            Previous dates
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={
                              state.realPage * PAGE_SIZE >= page.realDates.data.total
                            }
                            onClick={() =>
                              page.update({ realPage: String(state.realPage + 1) })
                            }
                          >
                            Next dates
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
