import { useId } from 'react';
import { AdminReadFailure } from './AdminReadFailure.js';
import { AdminPagination } from './AdminPagination.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { humanizeKey } from '../../../utils/format.js';
import type { useCreationCatalogPanel } from '../hooks/useCreationCatalogPanel.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Select } from '../../../components/primitives/Select.js';

export function CreationCatalogPanel({
  view,
}: {
  view: ReturnType<typeof useCreationCatalogPanel>;
}): React.JSX.Element {
  const labelId = useId();
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
    return <AdminReadFailure error={catalog.error} retry={catalog.retry} />;
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
          disabled={save.isPending}
          onClick={() => {
            setForm(BLANK);
            setEditing(true);
          }}
        >
          New option
        </Button>
      </div>
      <p className="type-caption">Includes retired and unavailable options.</p>
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Kind filter</span>
          <input
            className="field-input"
            value={view.filterKind}
            onChange={(e) => view.setFilterKind(e.target.value)}
          />
        </label>
        <div className="stack">
          <span className="type-label" id={`${labelId}-filter`}>Region filter</span>
          <Select
            label="Region filter"
            labelId={`${labelId}-filter`}
            value={view.filterRegion}
            onValueChange={view.setFilterRegion}
            options={[
              { value: '', label: 'All regions' },
              ...(regions.data ?? []).map((region) => ({ value: region.id, label: region.name })),
            ]}
          />
        </div>
      </div>
      {regions.isError ? <StatePanel status="error" error={regions.error} /> : null}
      <AdminPagination page={view.pagination} />
      {editing ? (
        <div className="stack">
          <label className="stack">
            <span className="type-label">Kind</span>
            <input
              disabled={save.isPending}
              className="field-input"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            />
          </label>
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
            <span className="type-label">Description</span>
            <textarea
              disabled={save.isPending}
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="stack">
            <span className="type-label" id={`${labelId}-introduced`}>Introduced by region</span>
            <Select
              label="Introduced by region"
              labelId={`${labelId}-introduced`}
              disabled={save.isPending}
              value={form.introducedByRegionId}
              onValueChange={(introducedByRegionId) =>
                setForm((f) => ({ ...f, introducedByRegionId }))
              }
              options={[
                { value: '', label: 'None' },
                ...(regions.data ?? []).map((region) => ({ value: region.id, label: region.name })),
              ]}
            />
          </div>
          <Checkbox
            label="Available"
            disabled={save.isPending}
            checked={form.available}
            onCheckedChange={(available) => setForm((f) => ({ ...f, available }))}
          />
          <Checkbox
            label="Retired"
            disabled={save.isPending}
            checked={form.retired}
            onCheckedChange={(retired) => setForm((f) => ({ ...f, retired }))}
          />
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
      {catalog.data.length === 0 ? (
        <EmptyState kind="generic" message="No creation catalog options." />
      ) : (
        <ul className="stack">
          {catalog.data.map((entry) => (
            <li key={entry.id} className="card stack">
              <p className="type-title">{entry.name}</p>
              <p className="type-caption">
                {humanizeKey(entry.kind)} ·{' '}
                {entry.available ? 'Available' : 'Unavailable'}
                {entry.retired ? ' · Retired' : ''}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={save.isPending}
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
