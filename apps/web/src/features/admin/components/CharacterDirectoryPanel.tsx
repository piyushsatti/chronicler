import { AdminPagination } from './AdminPagination.js';
import { Link } from 'react-router-dom';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  CHARACTER_STATUS_LABELS,
  characterStatusLabel,
  verificationLabel,
} from '../../../utils/format.js';
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
      className={`card stack ${styles.panel}`}
      aria-label="Character directory"
      data-el="admin.characterDirectory"
    >
      <h3 className="type-heading">Character directory</h3>
      <div className={styles.filters}>
        <label className="stack" data-gap="1">
          <span className="type-label">Name starts with</span>
          <input
            className="field-input"
            type="search"
            value={view.namePrefix}
            onChange={(e) => view.setNamePrefix(e.target.value)}
          />
        </label>
        <label className="stack" data-gap="1">
          <span className="type-label">Status</span>
          <select
            className="field-input"
            value={view.status}
            onChange={(e) => view.setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(CHARACTER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" data-gap="1">
          <span className="type-label">Region</span>
          <select
            className="field-input"
            value={view.regionId}
            disabled={regions.isPending && !view.regionId}
            onChange={(e) => view.setRegionId(e.target.value)}
          >
            <option value="">
              {regions.isPending ? 'Loading regions…' : 'All regions'}
            </option>
            {(regions.data ?? []).map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        <ul className={styles.list}>
          {query.data.map((row) => (
            <li key={row.id} className={styles.row}>
              <div className="stack" data-gap="1">
                <span className="type-title">
                  {row.name} <span className="type-code">{row.shortCode}</span>
                </span>
                <span className="type-caption">@{row.ownerHandle}</span>
              </div>
              <div className="row" data-wrap="1" data-gap="2" data-align="center">
                <Chip size="sm" tone="line">
                  {characterStatusLabel(row.status)}
                </Chip>
                {REVIEW_STATES.has(row.verificationStatus.toLowerCase()) ? (
                  <Chip size="sm" tone="status">
                    {verificationLabel(row.verificationStatus)}
                  </Chip>
                ) : null}
                <Link
                  className="btn btn--secondary btn--sm"
                  to={`/characters/${row.shortCode}`}
                  aria-label={`Open ${row.name}`}
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
