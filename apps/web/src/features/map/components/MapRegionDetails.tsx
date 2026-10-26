import { Link } from 'react-router-dom';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { documentHref } from '../../../utils/documentHref.js';
import { humanizeKey } from '../../../utils/format.js';
import { placeWords } from '../mapWords.js';
import type { useMapPage } from '../hooks/useMapPage.js';
import type { Pointcrawl } from '../adapters/mapAdapter.js';
import { MapPanelBody } from './MapPanelBody.js';
import styles from '../pages/map.module.css';

export function MapRegionDetails({
  map,
  regionName,
  document,
}: {
  map: Pointcrawl;
  regionName: string;
  document: ReturnType<typeof useMapPage>['regionDocument'];
}) {
  const entry = document.data;
  const body = entry?.effectiveBody?.trim();
  const excerpt = body && body.length > 420 ? `${body.slice(0, 420).trimEnd()}…` : body;
  const href = entry ? documentHref(entry) : null;
  return (
    <section
      className={styles.details}
      aria-label="Map region"
      data-map-region="true"
      data-map-panel="true"
    >
      <header className={styles.detailHeader}>
        <div className={styles.detailTopline}>
          <span>Region</span>
        </div>
        <h2>{regionName}</h2>
      </header>
      <MapPanelBody>
        {document.isFetching && !entry ? (
          <p role="status">Loading region document…</p>
        ) : null}
        {document.isError ? (
          <p role="alert">
            The region document could not load.{' '}
            <Button variant="ghost" size="sm" onClick={document.retry}>
              Retry
            </Button>
          </p>
        ) : entry ? (
          <section className={styles.regionDocument} aria-label="Region document">
            <p className={styles.documentCategory}>
              Codex{entry.category ? ` · ${humanizeKey(entry.category)}` : ''}
            </p>
            <h3>{entry.title}</h3>
            {excerpt ? (
              <div className={styles.documentExcerpt}>
                <ContentRenderer body={excerpt} />
              </div>
            ) : null}
            {href ? (
              <Link className={styles.openCodex} to={href}>
                Open in Codex
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6 4H4v12h12v-2M10 4h6v6M9 11l7-7" />
                </svg>
              </Link>
            ) : null}
          </section>
        ) : null}
      </MapPanelBody>
      <footer className={`${styles.detailFooter} ${styles.regionFooter}`}>
        <div className={styles.regionCounts}>
          <span>
            <strong>{map.nodes.length}</strong>{' '}
            {map.nodes.length === 1 ? placeWords(map).one : placeWords(map).many}
          </span>
          <span>
            <strong>{map.edges.length}</strong>{' '}
            {map.edges.length === 1 ? 'route' : 'routes'}
          </span>
        </div>
        <p>Choose a {placeWords(map).one} to see its stories.</p>
      </footer>
    </section>
  );
}
