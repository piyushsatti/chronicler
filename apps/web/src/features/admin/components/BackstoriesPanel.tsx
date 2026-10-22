import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useBackstoriesPanel } from '../hooks/useBackstoriesPanel.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';

export function BackstoriesPanel({
  view,
}: {
  view: ReturnType<typeof useBackstoriesPanel>;
}): React.JSX.Element {
  const {
    BLANK,
    backstories,
    regions,
    form,
    setForm,
    editing,
    setEditing,
    message,
    save,
    startEdit,
  } = view;

  if (backstories.isError) {
    return <AdminReadFailure error={backstories.error} retry={backstories.retry} />;
  }
  if (backstories.isLoading || !backstories.data) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card className="stack" data-el="admin.backstoriesPanel">
      <div className="row" data-justify="between">
        <h3 className="type-heading">Backstories</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={save.isPending}
          onClick={() => {
            setForm(BLANK);
            setEditing(true);
          }}
        >
          New backstory
        </Button>
      </div>
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Cohort filter</span>
          <input
            className="field-input"
            value={view.cohort}
            onChange={(e) => view.setCohort(e.target.value)}
          />
        </label>
        <label className="stack">
          <span className="type-label">Region filter</span>
          <select
            className="field-input"
            value={view.regionId}
            onChange={(e) => view.setRegionId(e.target.value)}
          >
            <option value="">All regions</option>
            {(regions.data ?? []).map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {regions.isError ? <StatePanel status="error" error={regions.error} /> : null}
      <AdminPagination page={view.pagination} />
      {editing ? (
        <div className="stack">
          <label className="stack">
            <span className="type-label">Name</span>
            <input
              disabled={save.isPending}
              className="field-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Lore</span>
            <textarea
              disabled={save.isPending}
              className="field-input"
              rows={3}
              value={form.lore}
              onChange={(e) => setForm((f) => ({ ...f, lore: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Cohort</span>
            <input
              disabled={save.isPending}
              className="field-input"
              value={form.cohort}
              onChange={(e) => setForm((f) => ({ ...f, cohort: e.target.value }))}
            />
          </label>
          <label className="stack">
            <span className="type-label">Source region</span>
            <select
              disabled={save.isPending}
              className="field-input"
              value={form.sourceRegionId}
              onChange={(e) =>
                setForm((f) => ({ ...f, sourceRegionId: e.target.value }))
              }
            >
              <option value="">Select…</option>
              {(regions.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {form.backstoryId ? (
            <Checkbox
              label="Retired"
              disabled={save.isPending}
              checked={form.retired}
              onCheckedChange={(retired) => setForm((f) => ({ ...f, retired }))}
            />
          ) : null}
          <div className="row">
            <Button
              type="button"
              disabled={
                save.isPending ||
                !form.name.trim() ||
                !form.lore.trim() ||
                !form.cohort.trim() ||
                !form.sourceRegionId
              }
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
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
      {backstories.data.length === 0 ? (
        <EmptyState kind="generic" message="No backstories in catalog." />
      ) : (
        <ul className="stack">
          {backstories.data.map((row) => (
            <li key={row.id} className="card stack">
              <p className="type-title">{row.name}</p>
              <p className="type-caption">
                {row.cohort}
                {row.retired ? ' · retired' : ''}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => startEdit(row)}
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
