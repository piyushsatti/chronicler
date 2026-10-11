import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useCreationCatalogPanel } from '../hooks/useCreationCatalogPanel.js';

export function CreationCatalogPanel({
  view,
}: {
  view: ReturnType<typeof useCreationCatalogPanel>;
}): React.JSX.Element {
  const {
    BLANK,
    catalog,
    regions,
    form,
    setForm,
    editing,
    setEditing,
    message,
    save,
    startEdit,
  } = view;

  if (catalog.isError) {
    return <StatePanel status="error" error={catalog.error} />;
  }
  if (catalog.isLoading || !catalog.data) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card className="stack" data-el="admin.creationCatalogPanel">
      <div className="row" data-justify="between">
        <h3 className="type-heading">Creation catalog</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setForm(BLANK);
            setEditing(true);
          }}
        >
          New option
        </Button>
      </div>
      <p className="type-caption">
        Retired or unavailable rows drop out of this list on refresh (same limitation as
        legacy).
      </p>
      {editing ? (
        <div className="stack">
          <label className="stack">
            <span className="type-label">Kind</span>
            <input
              className="field"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Name</span>
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Description</span>
            <textarea
              className="field"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Introduced by region</span>
            <select
              className="field"
              value={form.introducedByRegionId}
              onChange={(e) =>
                setForm((f) => ({ ...f, introducedByRegionId: e.target.value }))
              }
            >
              <option value="">None</option>
              {(regions.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
            />
            <span className="type-body">Available</span>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={form.retired}
              onChange={(e) => setForm((f) => ({ ...f, retired: e.target.checked }))}
            />
            <span className="type-body">Retired</span>
          </label>
          <div className="row">
            <Button
              type="button"
              disabled={save.isPending || !form.kind.trim() || !form.name.trim()}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setForm(BLANK);
              }}
            >
              Cancel
            </Button>
          </div>
          {save.isError ? <StatePanel status="error" error={save.error} /> : null}
        </div>
      ) : null}
      {message ? <p className="type-caption">{message}</p> : null}
      {catalog.data.length === 0 ? (
        <EmptyState kind="generic" message="No creation catalog options." />
      ) : (
        <ul className="stack">
          {catalog.data.map((entry) => (
            <li key={entry.id} className="card stack">
              <p className="type-title">{entry.name}</p>
              <p className="type-caption">{entry.kind}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startEdit(entry)}
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
