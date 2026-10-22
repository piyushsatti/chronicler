import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { AdminPagination } from './AdminPagination.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey } from '../../../utils/format.js';
import type { useRegionsPanel } from '../hooks/useRegionsPanel.js';

export function RegionsPanel({
  view,
}: {
  view: ReturnType<typeof useRegionsPanel>;
}): React.JSX.Element {
  const { regions, editing, create, saveEdit } = view;
  const { formatDate } = useDateFormatter();
  if (regions.isError)
    return <AdminReadFailure error={regions.error} retry={regions.retry} />;
  if (!regions.data) return <StatePanel status="loading" />;
  return (
    <Card className="stack" data-testid="regions-panel" data-el="admin.regionsPanel">
      <h3 className="type-heading">Regions</h3>
      <div className="row">
        <label className="stack">
          <span className="type-label">Region kind</span>
          <select
            className="field-input"
            value={view.filterKind}
            onChange={(e) => view.setFilterKind(e.target.value)}
          >
            <option value="">All kinds</option>
            {['uncharted', 'archon', 'server'].map((kind) => (
              <option key={kind} value={kind}>
                {humanizeKey(kind)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" data-wrap="1">
        <label className="stack">
          <span className="type-label">Name</span>
          <input
            className="field-input"
            value={view.name}
            disabled={create.isPending}
            onChange={(e) => view.setName(e.target.value)}
          />
        </label>
        <label className="stack">
          <span className="type-label">Kind</span>
          <select
            className="field-input"
            value={view.kind}
            disabled={create.isPending}
            onChange={(e) => view.setKind(e.target.value)}
          >
            {['uncharted', 'archon', 'server'].map((kind) => (
              <option key={kind} value={kind}>
                {humanizeKey(kind)}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={view.commandPending || !view.name.trim()}
          onClick={() => create.mutate()}
        >
          Create region
        </Button>
      </div>
      {view.message ? (
        <p className="type-caption" role="status">
          {view.message}
        </p>
      ) : null}
      {create.isError ? <StatePanel status="error" error={create.error} /> : null}
      {editing ? (
        <div className="card stack" data-el="admin.regionDetailEditor">
          <h4 className="type-heading">Edit {editing.region.name}</h4>
          {editing.status === 'loading' ? (
            <StatePanel status="loading" />
          ) : editing.status === 'error' ? (
            <>
              <StatePanel status="error" error={editing.error} />
              <Button
                type="button"
                onClick={() => {
                  void view.beginEdit(editing.region);
                }}
              >
                Reload region assignments
              </Button>
            </>
          ) : (
            <>
              <label className="stack">
                <span className="type-label">Name</span>
                <input
                  className="field-input"
                  disabled={saveEdit.isPending}
                  value={editing.draft.name}
                  onChange={(e) =>
                    view.setDraft({ ...editing.draft, name: e.target.value })
                  }
                />
              </label>
              <p className="type-caption">Kind: {humanizeKey(editing.region.kind)}</p>
              <label className="stack">
                <span className="type-label">Region Document UUID</span>
                <input
                  className="field-input"
                  disabled={saveEdit.isPending}
                  value={editing.draft.documentId}
                  onChange={(e) =>
                    view.setDraft({ ...editing.draft, documentId: e.target.value })
                  }
                />
              </label>
              <label className="stack">
                <span className="type-label">Charter deadline</span>
                <input
                  className="field-input"
                  disabled={saveEdit.isPending}
                  value={editing.draft.charterDeadline}
                  placeholder="2026-10-20T12:00:00Z"
                  onChange={(e) =>
                    view.setDraft({ ...editing.draft, charterDeadline: e.target.value })
                  }
                />
              </label>
              <label className="stack">
                <span className="type-label">Archon member UUIDs, one per line</span>
                <textarea
                  className="field-input"
                  disabled={saveEdit.isPending}
                  value={editing.draft.archons}
                  onChange={(e) =>
                    view.setDraft({ ...editing.draft, archons: e.target.value })
                  }
                />
              </label>
              <Button
                type="button"
                disabled={saveEdit.isPending || !editing.draft.name.trim()}
                onClick={() => saveEdit.mutate()}
              >
                Save region
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={saveEdit.isPending}
            onClick={view.cancelEdit}
          >
            Cancel
          </Button>
          {saveEdit.isError ? (
            <StatePanel status="error" error={saveEdit.error} />
          ) : null}
        </div>
      ) : null}
      <AdminPagination page={view.pagination} />
      {regions.data.length === 0 ? (
        <EmptyState kind="no-regions" message="No regions match this filter." />
      ) : (
        <ul className="stack">
          {regions.data.map((region) => {
            const nextKind = view.nextKind(region.kind);
            return (
              <li
                key={region.id}
                className="card row"
                data-wrap="1"
                data-justify="between"
              >
                <div className="stack">
                  <p className="type-title">{region.name}</p>
                  <p className="type-caption">
                    {humanizeKey(region.kind)}
                    {region.charterDeadline
                      ? ` · Charter due ${formatDate(region.charterDeadline)}`
                      : ''}
                  </p>
                </div>
                <div className="row" data-gap="2" data-wrap="1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={view.commandPending || view.advancement !== null}
                    onClick={() => {
                      void view.beginEdit(region);
                    }}
                  >
                    Edit
                  </Button>
                  {nextKind ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={view.commandPending || editing !== null}
                      onClick={() => view.beginAdvance(region)}
                    >
                      Advance to {humanizeKey(nextKind)}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {view.advancement ? (
        <Modal
          open
          title={`Advance ${view.advancement.region.name}?`}
          onClose={view.cancelAdvance}
        >
          <div className="stack">
            <p className="type-body">
              Advance this region from {humanizeKey(view.advancement.region.kind)} to{' '}
              {humanizeKey(view.advancement.to)}. This transition cannot be reversed
              here.
            </p>
            {view.advance.error ? (
              <StatePanel status="error" error={view.advance.error} />
            ) : null}
            <div className="row">
              <Button type="button" variant="ghost" onClick={view.cancelAdvance}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={view.advance.isPending || view.advance.conflict}
                onClick={view.confirmAdvance}
              >
                Advance region
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
