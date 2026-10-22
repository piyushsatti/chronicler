import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useGameCalendarPanel } from '../hooks/useGameCalendarPanel.js';

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
    definition,
    setDefinition,
    message,
    setMessage,
    save,
  } = view;

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
            onChange={(e) => setForm((f) => ({ ...f, eraName: e.target.value }))}
          />
        </label>
        <label className="stack">
          <span className="type-label">Abbrev</span>
          <input
            disabled={save.isPending}
            className="field-input"
            value={form.eraAbbrev}
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
      <label className="stack">
        <span className="type-label">Weekdays (comma-separated)</span>
        <input
          disabled={save.isPending}
          className="field-input"
          value={form.weekdays}
          onChange={(e) => setForm((f) => ({ ...f, weekdays: e.target.value }))}
        />
      </label>
      <p className="type-caption">
        Periods / moons preserved from loaded definition (
        {Array.isArray(definition.periods) ? definition.periods.length : 0} periods,{' '}
        {Array.isArray(definition.moons) ? definition.moons.length : 0} moons).
      </p>
      <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        Save calendar
      </Button>
      {save.isError ? <StatePanel status="error" error={save.error} /> : null}
    </Card>
  );
}
