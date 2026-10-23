import { AdminReadFailure } from './AdminReadFailure.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Select } from '../../../components/primitives/Select.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { AdminPagination } from './AdminPagination.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { humanizeKey, isSentinelDate, pluralize } from '../../../utils/format.js';
import type { useRegionsPanel } from '../hooks/useRegionsPanel.js';

const KIND_TONE: Record<string, 'accent' | 'status' | 'line'> = {
  server: 'accent',
  archon: 'status',
  uncharted: 'line',
};

const REGION_KINDS = ['uncharted', 'archon', 'server'] as const;

export function RegionsPanel({
  view,
  showFilters = true,
}: {
  view: ReturnType<typeof useRegionsPanel>;
  showFilters?: boolean;
}): React.JSX.Element {
  const { regions, editing, create, saveEdit } = view;
  const { formatDate } = useDateFormatter();
  if (regions.isError)
    return <AdminReadFailure error={regions.error} retry={regions.retry} />;
  if (!regions.data) return <StatePanel status="loading" />;
  return (
    <div className="stack" data-testid="regions-panel" data-el="admin.regionsPanel">
      {showFilters ? <FilterBar
        label="Filter regions"
        count={pluralize(regions.data.length, 'region')}
      >
        <FilterBar.Group>
          <Chip
            selected={view.filterKind === ''}
            onClick={() => view.setFilterKind('')}
          >
            All kinds
          </Chip>
          {REGION_KINDS.map((kind) => (
            <Chip
              key={kind}
              selected={view.filterKind === kind}
              onClick={() => view.setFilterKind(kind)}
            >
              {humanizeKey(kind)}
            </Chip>
          ))}
        </FilterBar.Group>
      </FilterBar> : null}
      {view.message ? (
        <p className="type-caption" role="status">
          {view.message}
        </p>
      ) : null}
      {create.isError ? <StatePanel status="error" error={create.error} /> : null}
      {editing ? (
        <Card className="stack" data-el="admin.regionDetailEditor">
          <h3 className="type-heading">Edit {editing.region.name}</h3>
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
                <span className="type-label">Region document ID</span>
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
                <span className="type-label">Archon member IDs, one per line</span>
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
        </Card>
      ) : null}
      <AdminPagination page={view.pagination} />
      {regions.data.length === 0 ? (
        <EmptyState kind="no-regions" message="No regions match this filter." />
      ) : (
        <CardGrid as="ul" aria-label="Regions">
          {regions.data.map((region) => {
            const nextKind = view.nextKind(region.kind);
            return (
              <li key={region.id}>
                <Card className="stack admin-region-card" pad={4}>
                  <div
                    className="row"
                    data-justify="between"
                    data-align="center"
                    data-wrap="1"
                  >
                    <span className="type-title">{region.name}</span>
                    <Chip size="sm" tone={KIND_TONE[region.kind] ?? 'category'}>
                      {humanizeKey(region.kind)}
                    </Chip>
                  </div>
                  <p className="type-caption admin-region-meta">
                    {region.charterDeadline && !isSentinelDate(region.charterDeadline)
                      ? `Charter due ${formatDate(region.charterDeadline)}`
                      : 'No charter deadline'}
                  </p>
                  <div className="row" data-gap="2" data-wrap="1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
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
                </Card>
              </li>
            );
          })}
        </CardGrid>
      )}
      <Card className="stack" pad={4}>
        <h2 className="type-title">Add a region</h2>
        <div className="row" data-wrap="1" data-align="end">
          <label className="stack">
            <span className="type-label">Name</span>
            <input
              className="field-input"
              value={view.name}
              disabled={create.isPending}
              onChange={(e) => view.setName(e.target.value)}
            />
          </label>
          <div className="stack">
            <span className="type-label" id="region-kind-label">
              Kind
            </span>
            <Select
              label="Kind"
              labelId="region-kind-label"
              value={view.kind}
              disabled={create.isPending}
              onValueChange={view.setKind}
              options={REGION_KINDS.map((kind) => ({
                value: kind,
                label: humanizeKey(kind),
              }))}
            />
          </div>
          <Button
            type="button"
            disabled={view.commandPending || !view.name.trim()}
            onClick={() => create.mutate()}
          >
            Create region
          </Button>
        </div>
        <p className="type-caption">
          Uncharted is the initial stage, Archon is the next stage, and Server is
          the final stage. Use Advance on an existing region to move it forward.
        </p>
      </Card>
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
    </div>
  );
}
