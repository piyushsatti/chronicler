import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useId } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { humanizeKey, isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { documentHref } from '../../../utils/documentHref.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import {
  useMapDocument,
  useMapActivityCard,
  useRegionDetails,
  useRegionPage,
  useRegionsDirectory,
} from '../hooks/useRegionPage.js';
import type { MapAtlasView, MapRegion } from '../adapters/mapAdapter.js';
import styles from './map.module.css';

const DECLARATION: PageDeclaration = {
  page: 'region-hub',
  regions: [{ role: 'body', priority: 1 }],
};
const DIRECTORY: PageDeclaration = {
  page: 'regions',
  regions: [{ role: 'body', priority: 1 }],
};
function RegionDocument({ id, regionName }: { id: string; regionName: string }) {
  const document = useMapDocument(id);
  if (document.isError)
    return (
      <p role="alert">
        The region entry could not load.{' '}
        <Button
          variant="ghost"
          onClick={() => {
            document.retry();
          }}
        >
          Retry
        </Button>
      </p>
    );
  if (document.isPending) return <StatePanel status="loading" />;
  if (!document.data)
    return <p className="type-caption">The region entry is unavailable to you.</p>;
  const href = documentHref(document.data);
  return (
    <article className={`card stack ${styles.regionDescription}`} aria-label="Region entry">
      <h2 className="type-heading">About this region</h2>
      {document.data.title.trim() !== regionName.trim() ? (
        <p className="type-caption">From the entry “{document.data.title}”</p>
      ) : null}
      {document.data.effectiveBody ? (
        <ContentRenderer body={document.data.effectiveBody} />
      ) : (
        <p className="type-caption">This region entry has no text yet.</p>
      )}
      {href ? (
        <Link className={`btn btn--secondary btn--sm ${styles.start}`} to={href}>
          Read the full entry
        </Link>
      ) : null}
    </article>
  );
}
/** "9 open, 2 scheduled"; zero counts are left out. */
function activityLine(counts: {
  fillingCount: number;
  scheduledCount: number;
  liveCount: number;
}): string {
  return [
    counts.fillingCount > 0 ? `${counts.fillingCount} open` : '',
    counts.scheduledCount > 0 ? `${counts.scheduledCount} scheduled` : '',
    counts.liveCount > 0 ? `${counts.liveCount} live` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

const QUEST_PREVIEW = 5;

function MapActivity({ map }: { map: MapAtlasView }) {
  const { activity, quests, titles } = useMapActivityCard(map.atlasCode);
  const { formatDate } = useDateFormatter();
  return (
    <article className="card stack">
      <div className={styles.mapCardHead}>
        <h3 className="type-title">{map.name}</h3>
        <Chip size="sm" tone="category">
          {humanizeKey(map.family)} map
        </Chip>
      </div>
      {activity.data ? (
        <>
          <p className="type-caption">
            {activityLine(activity.data) || 'No open or scheduled quests'}
          </p>
          {titles.error ? (
            <StatePanel
              variant="inline"
              status="error"
              error={titles.error}
              onRetry={titles.retry}
              retryLabel="Retry quest titles"
            />
          ) : null}
          {quests.length ? (
            <ul className={styles.questList}>
              {quests.slice(0, QUEST_PREVIEW).map((quest) => {
                const known = titles.byCode[quest.shortCode];
                return (
                  <li key={quest.shortCode} className={styles.questRow}>
                    <div className={styles.questBody}>
                      <Link
                        className={styles.questTitle}
                        to={`/quests/${encodeURIComponent(quest.shortCode)}`}
                      >
                        {known?.title ??
                          (titles.isPending ? 'Loading quest…' : quest.shortCode)}
                      </Link>
                      {isSentinelDate(quest.scheduledAt) ? null : (
                        <span className="type-caption">
                          {formatDate(quest.scheduledAt)}
                        </span>
                      )}
                    </div>
                    <div className={styles.docMeta}>
                      {known ? (
                        <Chip size="sm" tone="status">
                          {statusLabel(known.status)}
                        </Chip>
                      ) : null}
                      <Chip size="sm" tone="line">
                        {quest.filledCount}/{quest.slotsMax} seats
                      </Chip>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="type-caption">No open or live quests on this map.</p>
          )}
          {quests.length > QUEST_PREVIEW ? (
            <Link className="type-caption" to="/quests">
              {quests.length - QUEST_PREVIEW} more on the quest board
            </Link>
          ) : null}
        </>
      ) : activity.isError ? (
        <p className="type-caption">
          Activity could not load.{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              activity.retry();
            }}
          >
            Retry
          </Button>
        </p>
      ) : activity.isPending ? (
        <StatePanel variant="inline" status="loading" />
      ) : (
        <p className="type-caption">No regional activity is available.</p>
      )}
      <Link
        className="btn btn--secondary btn--sm"
        to={`/map/${encodeURIComponent(map.atlasCode)}`}
      >
        Open map
      </Link>
    </article>
  );
}
function RegionDetails({ region, maps }: { region: MapRegion; maps: MapAtlasView[] }) {
  const { formatDate } = useDateFormatter();
  const { counts, assignments } = useRegionDetails(region.id);
  return (
    <div className={`stack ${styles.page}`}>
      <PageHeader
        back={{ to: '/regions', label: 'Regions' }}
        title={region.name}
        meta={
          <>
            {counts.data ? (
              <>
                <span>{pluralize(counts.data.questCount, 'quest')} overall</span>
                <span>
                  {pluralize(counts.data.pointcrawlNodeCount, 'mapped place')}
                </span>
              </>
            ) : null}
            {assignments.data && assignments.data.length > 0 ? (
              <span>{pluralize(assignments.data.length, 'DM')} assigned</span>
            ) : null}
            {region.charterDeadline && !isSentinelDate(region.charterDeadline) ? (
              <span>Charter due {formatDate(region.charterDeadline)}</span>
            ) : null}
          </>
        }
      />
      {counts.isError ? (
        <p role="alert">
          Region counts could not load.{' '}
          <Button
            variant="ghost"
            onClick={() => {
              counts.retry();
            }}
          >
            Retry
          </Button>
        </p>
      ) : null}
      {region.documentId ? (
        <RegionDocument id={region.documentId} regionName={region.name} />
      ) : (
        <p className="type-caption">No region entry is linked yet.</p>
      )}
      <h2 className="type-heading">Maps</h2>
      {maps.length === 1 && maps[0] ? (
        <MapActivity map={maps[0]} />
      ) : maps.length ? (
        <CardGrid className={styles.regionGrid}>
          {maps.map((map) => (
            <MapActivity key={map.id} map={map} />
          ))}
        </CardGrid>
      ) : (
        <StatePanel
          status="empty"
          emptyMessage="No maps are available in this region."
        />
      )}
    </div>
  );
}
export function RegionHubPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const { directory, validId, region } = useRegionPage(slug);
  const regions: PageRegionRenderers = {
    body: () =>
      !validId ? (
        <div className="stack">
          <p>
            This older Region link has no current Region identifier. Choose a region
            from the directory.
          </p>
          <Link className={`btn btn--secondary ${styles.start}`} to="/regions">
            Browse regions
          </Link>
        </div>
      ) : directory.isPending ? (
        <StatePanel status="loading" />
      ) : directory.isError ? (
        <>
          <StatePanel
            status="error"
            error={toAppError(directory.error, 'region:page')}
          />
          <Button
            onClick={() => {
              directory.retry();
            }}
          >
            Retry regions
          </Button>
        </>
      ) : region ? (
        <RegionDetails
          region={region}
          maps={directory.data?.maps.filter((map) => map.regionId === region.id) ?? []}
        />
      ) : (
        <div className="stack">
          <StatePanel
            status="empty"
            emptyMessage="This region is unavailable for this viewer."
          />
          <Link className={`btn btn--secondary ${styles.start}`} to="/regions">
            Browse regions
          </Link>
        </div>
      ),
  };
  return (
    <PageShell>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
/** Whole card is the link; it is named by the region and described by its details. */
function RegionCard({
  region,
  mapCount,
}: {
  region: MapRegion;
  mapCount: number;
}): React.JSX.Element {
  const id = useId();
  return (
    <Card
      variant="clickable"
      to={`/regions/${region.id}`}
      className="stack"
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-meta`}
    >
      <h2 className="type-title" id={`${id}-name`}>
        {region.name}
      </h2>
      <p className="type-caption" id={`${id}-meta`}>
        {humanizeKey(region.kind)} ·{' '}
        {pluralize(mapCount, 'map')}
      </p>
    </Card>
  );
}

export function RegionsDirectoryPage(): React.JSX.Element {
  const directory = useRegionsDirectory();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const requestedKind = params.get('kind') ?? '';
  const regionsList = directory.data?.regions ?? [];
  const kinds = [...new Set(regionsList.map((region) => region.kind))];
  const kind = kinds.includes(requestedKind) ? requestedKind : '';
  const visibleRegions = regionsList.filter((region) =>
    (!kind || region.kind === kind) &&
    region.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const updateFilter = (key: 'q' | 'kind', value: string, replace = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace });
  };
  const clearFilters = () => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('q');
      next.delete('kind');
      return next;
    });
  };
  const regions: PageRegionRenderers = {
    body: () => (
      <div className={`stack ${styles.page}`}>
        <PageHeader
          back={{ to: '/codex', label: 'Codex' }}
          title="Regions"
          lede="The areas of the world, with their maps and open quests."
          actions={
            <Link className="btn btn--secondary" to="/map">
              Explore maps
            </Link>
          }
        />
        <FilterBar
          label="Filter regions"
          count={directory.data ? pluralize(visibleRegions.length, 'region') : undefined}
        >
          <FilterBar.Search
            label="Search regions"
            placeholder="Search regions…"
            value={query}
            onValueChange={(value) => updateFilter('q', value, true)}
          />
          <FilterBar.Group label="Kind">
            <Chip selected={!kind} onClick={() => updateFilter('kind', '')}>
              All
            </Chip>
            {kinds.map((value) => (
              <Chip
                key={value}
                selected={kind === value}
                onClick={() => updateFilter('kind', value)}
              >
                {humanizeKey(value)}
              </Chip>
            ))}
          </FilterBar.Group>
        </FilterBar>
        {directory.isPending ? (
          <StatePanel status="loading" />
        ) : directory.isError ? (
          <>
            <StatePanel
              status="error"
              error={toAppError(directory.error, 'regions:directory')}
            />
            <Button
              onClick={() => {
                directory.retry();
              }}
            >
              Retry regions
            </Button>
          </>
        ) : visibleRegions.length ? (
          <CardGrid className={styles.regionGrid}>
            {visibleRegions.map((region) => (
              <RegionCard
                key={region.id}
                region={region}
                mapCount={
                  directory.data.maps.filter((map) => map.regionId === region.id).length
                }
              />
            ))}
          </CardGrid>
        ) : regionsList.length ? (
          <EmptyState
            kind="no-results"
            message="No regions match these filters."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : (
          <StatePanel status="empty" emptyMessage="No regions are available for this viewer." />
        )}
      </div>
    ),
  };
  return (
    <PageShell>
      <PageHost declaration={DIRECTORY} regions={regions} />
    </PageShell>
  );
}
