import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useId } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { humanizeKey, pluralize, statusLabel } from '../../../utils/format.js';
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
function RegionDocument({ id }: { id: string }) {
  const document = useMapDocument(id);
  if (document.isError)
    return (
      <p role="alert">
        Region document could not load.{' '}
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
    return (
      <p className="type-caption">
        The Region document is unavailable for this viewer.
      </p>
    );
  const href = documentHref(document.data);
  return (
    <article className="card stack">
      <h2 className="type-title">{document.data.title}</h2>
      {document.data.effectiveBody ? (
        <ContentRenderer body={document.data.effectiveBody} />
      ) : (
        <p className="type-caption">No Region document body available.</p>
      )}
      {href ? (
        <Link className={`btn btn--secondary btn--sm ${styles.start}`} to={href}>
          Open Region document
        </Link>
      ) : null}
    </article>
  );
}
function MapActivity({ map }: { map: MapAtlasView }) {
  const { activity, quests, titles } = useMapActivityCard(map.atlasCode);
  const { formatDate } = useDateFormatter();
  return (
    <article className="card stack">
      <div className={styles.mapCardHead}>
        <h3 className="type-title">
          <Link className={styles.docLink} to={`/map/${encodeURIComponent(map.atlasCode)}`}>
            {map.name}
          </Link>
        </h3>
        <Chip size="sm" tone="category">
          {humanizeKey(map.family)} map
        </Chip>
      </div>
      {activity.data ? (
        <>
          <p className="type-caption">
            {activity.data.fillingCount} filling · {activity.data.scheduledCount}{' '}
            scheduled · {activity.data.liveCount} live
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
              {quests.map((quest) => {
                const known = titles.byCode[quest.shortCode];
                return (
                  <li key={quest.shortCode} className={styles.questRow}>
                    <div className={styles.questBody}>
                      <Link
                        className={styles.questTitle}
                        to={`/quests/${encodeURIComponent(quest.shortCode)}`}
                      >
                        {known?.title ?? (titles.isPending ? 'Loading quest…' : quest.shortCode)}
                      </Link>
                      <span className="type-caption">{formatDate(quest.scheduledAt)}</span>
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
    </article>
  );
}
function RegionDetails({ region, maps }: { region: MapRegion; maps: MapAtlasView[] }) {
  const { formatDate } = useDateFormatter();
  const { counts, assignments } = useRegionDetails(region.id);
  return (
    <div className={`stack ${styles.page}`}>
      <Link className={`btn btn--ghost btn--sm ${styles.start}`} to="/regions">
        ← All regions
      </Link>
      <header className={styles.regionHeader}>
        <Chip size="sm" tone="category" className={styles.start}>
          {humanizeKey(region.kind)} region
        </Chip>
        <h1 className="type-display">{region.name}</h1>
      </header>
      {region.charterDeadline ? (
        <p>Charter deadline {formatDate(region.charterDeadline)}</p>
      ) : null}
      {counts.data ? (
        <p className="type-caption">
          {pluralize(counts.data.questCount, 'quest')} ·{' '}
          {pluralize(counts.data.pointcrawlNodeCount, 'map location')}
        </p>
      ) : counts.isError ? (
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
      {assignments.data ? (
        <p className="type-caption">
          {pluralize(assignments.data.length, 'assigned archon')}
        </p>
      ) : assignments.isError ? (
        <p className="type-caption">
          Archon assignments are unavailable for this viewer.
        </p>
      ) : null}
      {region.documentId ? (
        <RegionDocument id={region.documentId} />
      ) : (
        <p className="type-caption">No Region document is linked.</p>
      )}
      <h2 className="type-heading">Maps</h2>
      {maps.length ? (
        <div className={styles.regionGrid}>
          {maps.map((map) => (
            <MapActivity key={map.id} map={map} />
          ))}
        </div>
      ) : (
        <StatePanel status="empty" emptyMessage="No maps are available in this region." />
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
      <Chip size="sm" tone="category" className={styles.start}>
        {humanizeKey(region.kind)} region
      </Chip>
      <h2 className="type-title" id={`${id}-name`}>
        {region.name}
      </h2>
      <p className="type-caption" id={`${id}-meta`}>
        {pluralize(mapCount, 'available map')}
      </p>
    </Card>
  );
}

export function RegionsDirectoryPage(): React.JSX.Element {
  const directory = useRegionsDirectory();
  const regions: PageRegionRenderers = {
    body: () => (
      <div className={`stack ${styles.page}`}>
        <Link className={`btn btn--secondary ${styles.start}`} to="/map">
          Explore maps
        </Link>
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
        ) : directory.data.regions.length ? (
          <div className={styles.regionGrid}>
            {directory.data.regions.map((region) => (
              <RegionCard
                key={region.id}
                region={region}
                mapCount={
                  directory.data.maps.filter((map) => map.regionId === region.id).length
                }
              />
            ))}
          </div>
        ) : (
          <StatePanel
            status="empty"
            emptyMessage="No regions are available for this viewer."
          />
        )}
      </div>
    ),
  };
  return (
    <PageShell title="Regions">
      <PageHost declaration={DIRECTORY} regions={regions} />
    </PageShell>
  );
}
