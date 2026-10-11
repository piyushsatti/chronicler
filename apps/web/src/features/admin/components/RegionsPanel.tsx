import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { useRegionsPanel } from '../hooks/useRegionsPanel.js';

export function RegionsPanel({
  view,
}: {
  view: ReturnType<typeof useRegionsPanel>;
}): React.JSX.Element {
  const {
    regions,
    name,
    setName,
    kind,
    setKind,
    message,
    editing,
    setEditing,
    editName,
    setEditName,
    editKind,
    setEditKind,
    editArchon,
    setEditArchon,
    create,
    saveEdit,
  } = view;

  if (regions.isError) {
    return <StatePanel status="error" error={regions.error} />;
  }
  if (regions.isLoading || !regions.data) {
    return <StatePanel status="loading" />;
  }

  return (
    <Card className="stack" data-testid="regions-panel" data-el="admin.regionsPanel">
      <h3 className="type-heading">Regions</h3>
      <p className="type-caption">
        Create regions and edit name / kind / archon (legacy /admin/regions detail).
      </p>
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Name</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="stack">
          <span className="type-label">Kind</span>
          <select
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="uncharted">Uncharted</option>
            <option value="archon">Archon</option>
            <option value="server">Server</option>
          </select>
        </label>
        <Button
          type="button"
          disabled={create.isPending || !name.trim()}
          onClick={() => create.mutate()}
        >
          Create region
        </Button>
      </div>
      {message ? <p className="type-caption">{message}</p> : null}
      {create.isError ? <StatePanel status="error" error={create.error} /> : null}
      {editing ? (
        <div className="card stack" data-el="admin.regionDetailEditor">
          <h4 className="type-heading">Edit {editing.name}</h4>
          <label className="stack">
            <span className="type-label">Name</span>
            <input
              className="field"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label className="stack">
            <span className="type-label">Kind</span>
            <select
              className="field"
              value={editKind}
              onChange={(e) => setEditKind(e.target.value)}
            >
              <option value="uncharted">Uncharted</option>
              <option value="archon">Archon</option>
              <option value="server">Server</option>
            </select>
          </label>
          <label className="stack">
            <span className="type-label">Archon member id</span>
            <input
              className="field"
              value={editArchon}
              onChange={(e) => setEditArchon(e.target.value)}
              placeholder="UUID or empty"
            />
          </label>
          <div className="row">
            <Button
              type="button"
              disabled={saveEdit.isPending || !editName.trim()}
              onClick={() => saveEdit.mutate()}
            >
              Save region
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
          {saveEdit.isError ? (
            <StatePanel status="error" error={saveEdit.error} />
          ) : null}
        </div>
      ) : null}
      {regions.data.length === 0 ? (
        <EmptyState kind="no-regions" message="No regions yet." />
      ) : (
        <ul className="stack">
          {regions.data.map((region) => (
            <li key={region.id} className="card row" data-justify="between">
              <div className="stack">
                <p className="type-title">{region.name}</p>
                <p className="type-caption">
                  {region.kind}
                  {region.charterDeadline ? ` · charter ${region.charterDeadline}` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(region);
                  setEditName(region.name);
                  setEditKind(region.kind);
                  setEditArchon('');
                }}
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
