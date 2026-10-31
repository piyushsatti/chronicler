import { useEffect, useId, useRef } from 'react';
import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Select } from '../../../components/primitives/Select.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { CalendarPeriodDraft } from '../adapters/adminForms.js';
import type { useGameCalendarPanel } from '../hooks/useGameCalendarPanel.js';

const PERIOD_TYPES = [
  { value: 'month', label: 'Month' },
  { value: 'festival', label: 'Festival' },
] as const;

export function GameCalendarPanel({
  view,
}: {
  view: ReturnType<typeof useGameCalendarPanel>;
}): React.JSX.Element {
  const {
    GREYHAWK_PRESET,
    presetForm,
    calendar,
    form,
    setForm,
    periodIssues,
    eraIssues,
    periodsBlocked,
    newPeriod,
    definition,
    setDefinition,
    message,
    setMessage,
    save,
  } = view;
  const labelId = useId();
  const setPeriods = (
    update: (periods: CalendarPeriodDraft[]) => CalendarPeriodDraft[],
  ) => setForm((f) => ({ ...f, periods: update(f.periods) }));
  const editPeriod = (index: number, patch: Partial<CalendarPeriodDraft>) =>
    setPeriods((periods) =>
      periods.map((period, i) => (i === index ? { ...period, ...patch } : period)),
    );
  // Row controls carry `${period id}:${action}`, so focus can follow a row after it moves.
  const periodsEditor = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    periodsEditor.current
      ?.querySelector<HTMLButtonElement>(`[data-focus-key="${pendingFocus.current}"]`)
      ?.focus();
    pendingFocus.current = null;
  }, [form.periods]);
  const movePeriod = (index: number, offset: -1 | 1) => {
    const last = form.periods.length - 1;
    const to = index + offset;
    const moved = form.periods[index]!;
    // At an edge the same button is disabled; keep focus on the row's other move control.
    const action = offset < 0 ? (to === 0 ? 'down' : 'up') : to === last ? 'up' : 'down';
    pendingFocus.current = `${moved.id}:${action}`;
    setPeriods((periods) => {
      const next = [...periods];
      next.splice(index, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const removePeriod = (index: number) => {
    const next = form.periods.filter((_, i) => i !== index);
    const target = next[index] ?? next[index - 1];
    pendingFocus.current = target ? `${target.id}:remove` : 'add';
    setPeriods(() => next);
  };

  if (calendar.isError) {
    return <AdminReadFailure error={calendar.error} retry={calendar.retry} />;
  }
  if (calendar.isLoading || !calendar.data) return <StatePanel status="loading" />;

  return (
    <Card
      className="stack"
      data-component="GameCalendarPanel"
      data-el="admin.gameCalendarPanel"
    >
      <div className="row" data-justify="between" data-wrap="1">
        <h3 className="type-heading">Game calendar</h3>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={save.isPending}
          onClick={() => {
            setDefinition(GREYHAWK_PRESET);
            setForm(presetForm);
            setMessage('Greyhawk preset loaded (not saved yet).');
          }}
        >
          Load Greyhawk preset
        </Button>
      </div>
      <p className="type-caption">
        Edit calendar fields. Other definition settings are preserved.
      </p>
      {message ? (
        <p className="type-caption" role="status">
          {message}
        </p>
      ) : null}
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Era name</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={form.eraName}
            aria-invalid={eraIssues.name ? true : undefined}
            aria-describedby={eraIssues.name ? `${labelId}-era-name` : undefined}
            onChange={(e) => setForm((f) => ({ ...f, eraName: e.target.value }))}
          />
        </label>
        <label className="stack">
          <span className="type-label">Abbrev</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={form.eraAbbrev}
            aria-invalid={eraIssues.abbrev ? true : undefined}
            aria-describedby={eraIssues.abbrev ? `${labelId}-era-abbrev` : undefined}
            onChange={(e) => setForm((f) => ({ ...f, eraAbbrev: e.target.value }))}
          />
        </label>
        <label className="stack">
          <span className="type-label">Days / week</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={form.daysPerWeek}
            onChange={(e) => setForm((f) => ({ ...f, daysPerWeek: e.target.value }))}
          />
        </label>
        <label className="stack">
          <span className="type-label">Rate (real/game day)</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={form.rate}
            onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
          />
        </label>
      </div>
      {eraIssues.name ? (
        <p id={`${labelId}-era-name`} className="type-caption">
          {eraIssues.name}
        </p>
      ) : null}
      {eraIssues.abbrev ? (
        <p id={`${labelId}-era-abbrev`} className="type-caption">
          {eraIssues.abbrev}
        </p>
      ) : null}
      <label className="stack">
        <span className="type-label">Weekdays (comma-separated)</span>
        <input
          disabled={save.isPending}
          className="field-input"
          value={form.weekdays}
          onChange={(e) => setForm((f) => ({ ...f, weekdays: e.target.value }))}
        />
      </label>
      <div className="stack" ref={periodsEditor}>
        <span className="type-label" id={`${labelId}-periods`}>
          Periods
        </span>
        <p className="type-caption">
          Months and festivals in year order: 1 to 36 periods of 1 to 366 days each, up to
          3660 days a year.
        </p>
        {periodIssues.list ? (
          <p className="type-caption" role="alert">
            {periodIssues.list}
          </p>
        ) : null}
        {form.periods.length ? (
          <ol className="stack" aria-labelledby={`${labelId}-periods`}>
            {form.periods.map((period, index) => {
              const issue = periodIssues.rows[index];
              const rowId = `${labelId}-${period.id}`;
              const named = period.name.trim() || `period ${index + 1}`;
              return (
                <li key={period.id} className="stack" aria-label={`Period ${index + 1}`}>
                  <div className="row" data-wrap="1" data-align="end">
                    <label className="stack">
                      <span className="type-label">Name</span>
                      <input
                        disabled={save.isPending}
                        className="field-input"
                        value={period.name}
                        aria-invalid={issue?.name ? true : undefined}
                        aria-describedby={issue?.name ? `${rowId}-name` : undefined}
                        onChange={(e) => editPeriod(index, { name: e.target.value })}
                      />
                    </label>
                    <div className="stack">
                      <span className="type-label" id={`${rowId}-type`}>
                        Type
                      </span>
                      <Select
                        label={`Period ${index + 1} type`}
                        labelId={`${rowId}-type`}
                        disabled={save.isPending}
                        value={period.type}
                        options={PERIOD_TYPES}
                        onValueChange={(type) =>
                          editPeriod(index, {
                            type: type === 'festival' ? 'festival' : 'month',
                          })
                        }
                      />
                    </div>
                    <label className="stack">
                      <span className="type-label">Days</span>
                      <input
                        disabled={save.isPending}
                        className="field-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={366}
                        step={1}
                        value={period.days}
                        aria-invalid={issue?.days ? true : undefined}
                        aria-describedby={issue?.days ? `${rowId}-days` : undefined}
                        onChange={(e) => editPeriod(index, { days: e.target.value })}
                      />
                    </label>
                    <div className="row" data-gap="1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-focus-key={`${period.id}:up`}
                        aria-label={`Move ${named} up`}
                        disabled={save.isPending || index === 0}
                        onClick={() => movePeriod(index, -1)}
                      >
                        Move up
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-focus-key={`${period.id}:down`}
                        aria-label={`Move ${named} down`}
                        disabled={save.isPending || index === form.periods.length - 1}
                        onClick={() => movePeriod(index, 1)}
                      >
                        Move down
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-focus-key={`${period.id}:remove`}
                        aria-label={`Remove ${named}`}
                        disabled={save.isPending}
                        onClick={() => removePeriod(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  {issue?.name ? (
                    <p id={`${rowId}-name`} className="type-caption">
                      {issue.name}
                    </p>
                  ) : null}
                  {issue?.days ? (
                    <p id={`${rowId}-days`} className="type-caption">
                      {issue.days}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="row">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-focus-key="add"
            disabled={save.isPending}
            onClick={() => setPeriods((periods) => [...periods, newPeriod()])}
          >
            Add period
          </Button>
        </div>
      </div>
      <p className="type-caption">
        Moons preserved from loaded definition (
        {Array.isArray(definition.moons) ? definition.moons.length : 0} moons).
      </p>
      <Button
        type="button"
        disabled={save.isPending || periodsBlocked}
        onClick={() => save.mutate()}
      >
        Save calendar
      </Button>
      {save.isError ? <StatePanel status="error" error={save.error} /> : null}
    </Card>
  );
}
