import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { AdminTimeAnchorView } from '../types.js';
import type { useTimeAnchorPanel } from '../hooks/useTimeAnchorPanel.js';

export function TimeAnchorPanel({
  view,
}: {
  view: ReturnType<typeof useTimeAnchorPanel>;
}): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const {
    BLANK,
    anchors,
    editingId,
    setEditingId,
    form,
    setForm,
    message,
    save,
  } = view;

  if (anchors.isError) {
    return <AdminReadFailure error={anchors.error} retry={anchors.retry} />;
  }
  if (anchors.isLoading || !anchors.data) return <StatePanel status="loading" />;

  const startEdit = (anchor: AdminTimeAnchorView): void => {
    setEditingId(anchor.id);
    setForm({
      realUtc: anchor.realUtc,
      epochDay: String(anchor.epochDay),
      rate: String(anchor.rate),
      note: anchor.note ?? '',
    });
  };

  return (
    <Card
      className="stack"
      data-component="TimeAnchorPanel"
      data-el="admin.timeAnchorPanel"
    >
      <div className="row" data-justify="between">
        <h3 className="type-heading">Time anchors</h3>
        <Button
          type="button"
          size="sm"
          disabled={save.isPending}
          onClick={() => {
            setEditingId('new');
            setForm(BLANK);
          }}
        >
          New anchor
        </Button>
      </div>
      <p className="type-caption">
        Saving an anchor recalculates future dates in the game calendar.
      </p>
      <AdminPagination page={view.pagination} />
      {message ? (
        <p className="type-caption" role="status">
          {message}
        </p>
      ) : null}
      {editingId ? (
        <div className="stack card">
          <label className="stack">
            <span className="type-label">Real UTC</span>
            <input
              disabled={save.isPending}
              className="field-input"
              type="text"
              placeholder="2026-01-01T00:00:00Z"
              value={form.realUtc}
              onChange={(e) => setForm((f) => ({ ...f, realUtc: e.target.value }))}
            />
          </label>
          <div className="row" data-wrap="1">
            <label className="stack">
              <span className="type-label">Epoch day</span>
              <input
                disabled={save.isPending}
                className="field-input"
                value={form.epochDay}
                onChange={(e) => setForm((f) => ({ ...f, epochDay: e.target.value }))}
              />
            </label>
            <label className="stack">
              <span className="type-label">Rate</span>
              <input
                disabled={save.isPending}
                className="field-input"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              />
            </label>
          </div>
          <label className="stack">
            <span className="type-label">Note</span>
            <input
              disabled={save.isPending}
              className="field-input"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>
          <div className="row">
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                setEditingId(null);
                setForm(BLANK);
              }}
            >
              Cancel
            </Button>
          </div>
          {save.isError ? <StatePanel status="error" error={save.error} /> : null}
        </div>
      ) : null}
      {anchors.data.length === 0 ? (
        <EmptyState kind="generic" message="No time anchors yet." />
      ) : (
        <ul className="stack">
          {anchors.data.map((a) => (
            <li key={a.id} className="card row" data-justify="between" data-wrap="1">
              <div className="stack">
                <p className="type-title">{formatDateTime(a.realUtc)}</p>
                <p className="type-caption">
                  Game day {a.epochDay} · rate {a.rate}
                  {a.note ? ` · ${a.note}` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => startEdit(a)}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
