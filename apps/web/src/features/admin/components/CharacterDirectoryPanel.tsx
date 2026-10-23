import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { CHARACTER_STATUS_LABELS, characterStatusLabel, handleOnlyName, pluralize, verificationLabel } from '../../../utils/format.js';
import type { CharacterDirectoryPanelView } from '../hooks/useCharacterDirectoryPanel.js';
import styles from './CharacterDirectoryPanel.module.css';

/** Verification only earns a chip while it is in, or back from, review. */
const REVIEW_STATES = new Set(['pending', 'rejected', 'approved']);

export function CharacterDirectoryPanel({
  view,
}: {
  view: CharacterDirectoryPanelView;
}): React.JSX.Element {
  const { query, pagination, regions } = view;
  const filtered = Boolean(view.namePrefix || view.status || view.regionId);

  return (
    <section
      className={`stack ${styles.panel}`}
      aria-label="Character directory"
      data-el="admin.characterDirectory"
    >
      <FilterBar
        label="Filter characters"
        count={
          query.data
            ? pluralize(pagination.total ?? query.data.length, 'character')
            : undefined
        }
      >
        <FilterBar.Search
          label="Character name starts with"
          placeholder="Search by name"
          value={view.namePrefix}
          onValueChange={view.setNamePrefix}
        />
        <FilterBar.Group>
          <Chip selected={view.status === ''} onClick={() => view.setStatus('')}>
            All
          </Chip>
          {Object.entries(CHARACTER_STATUS_LABELS).map(([value, label]) => (
            <Chip
              key={value}
              selected={view.status === value}
              onClick={() => view.setStatus(value)}
            >
              {label}
            </Chip>
          ))}
        </FilterBar.Group>
        <FilterBar.Picker
          label="Region"
          value={view.regionId}
          disabled={regions.isPending && !view.regionId}
          onValueChange={view.setRegionId}
          options={[
            {
              value: '',
              label: regions.isPending ? 'Loading regions…' : 'All regions',
            },
            ...(regions.data ?? []).map((region) => ({
              value: region.id,
              label: region.name,
            })),
          ]}
        />
      </FilterBar>
      {regions.isError ? (
        <StatePanel
          variant="inline"
          status="error"
          error={toAppError(regions.error, 'admin:region-options')}
          onRetry={view.retryRegions}
          retryLabel="Retry regions"
        />
      ) : null}
      <AdminPagination page={pagination} />
      {query.isError ? (
        <StatePanel
          variant="inline"
          status="error"
          error={query.error}
          onRetry={query.retry}
        />
      ) : query.isLoading ? (
        <StatePanel variant="inline" status="loading" />
      ) : null}
      {query.data?.length === 0 ? (
        <EmptyState
          kind="no-characters"
          message={
            filtered ? 'No characters match these filters.' : 'No characters yet.'
          }
        />
      ) : null}
      {query.data?.length ? (
        <CardGrid as="ul" aria-label="Characters">
          {query.data.map((row) => (
            <li key={row.id}>
              <Card className="stack" pad={3}>
                <Link
                  className="type-title"
                  to={`/characters/${row.shortCode}`}
                  aria-label={`Open ${row.name}`}
                >
                  {row.name}
                </Link>
                {handleOnlyName(row.ownerHandle, '') ? (
                  <span className="type-caption">
                    Played by {handleOnlyName(row.ownerHandle, '')}
                  </span>
                ) : null}
                <Chip.Row>
                  <Chip size="sm" tone="line">
                    {characterStatusLabel(row.status)}
                  </Chip>
                  {REVIEW_STATES.has(row.verificationStatus.toLowerCase()) ? (
                    <Chip size="sm" tone="status">
                      {verificationLabel(row.verificationStatus)}
                    </Chip>
                  ) : null}
                </Chip.Row>
              </Card>
            </li>
          ))}
        </CardGrid>
      ) : null}
    </section>
  );
}
