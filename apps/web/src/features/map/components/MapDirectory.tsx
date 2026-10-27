import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { pluralize } from '../../../utils/format.js';
import { countPlaces, mapKindLabel, placeWords } from '../mapWords.js';
import type {
  MapDirectory as Directory,
  MapAtlasView,
  Pointcrawl,
} from '../adapters/mapAdapter.js';
import { useMapCard } from '../hooks/useMapCard.js';
import { graphBounds, mapAssetHref } from './PointcrawlViewport.js';
import styles from '../pages/map.module.css';

export function MapSketch({ map }: { map: Pointcrawl }) {
  const bounds = graphBounds(map.nodes);
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  return (
    <svg
      className={styles.previewArt}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
      data-map-sketch={map.atlasCode}
    >
      {map.edges.map((edge) => {
        const a = nodes.get(edge.nodeA),
          b = nodes.get(edge.nodeB);
        return a && b ? (
          <line
            key={edge.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            data-edge-kind={edge.kind}
            vectorEffect="non-scaling-stroke"
          />
        ) : null;
      })}
      {map.nodes.map((node) => (
        <circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r={Math.max(bounds.width / 100, 3)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
// The map's own art identifies it at a glance; the node sketch stands in when there is none.
function MapPreviewArt({ map }: { map: Pointcrawl }) {
  const href = mapAssetHref(map.assetPath);
  const [failed, setFailed] = useState(false);
  if (!href || failed) return <MapSketch map={map} />;
  return (
    <img
      className={styles.previewImage}
      src={href}
      alt=""
      loading="lazy"
      decoding="async"
      data-map-art={map.atlasCode}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
function MapCard({ map, region }: { map: MapAtlasView; region: string }) {
  const atlas = useMapCard(map.atlasCode);
  return (
    <article className={styles.mapCard}>
      <Link
        className={styles.mapCardLink}
        to={`/map/${encodeURIComponent(map.atlasCode)}`}
      >
        <div
          className={`${styles.mapPreview} ${atlas.data?.nodes.length ? '' : styles.emptyPreview}`}
        >
          {atlas.data ? <MapPreviewArt map={atlas.data} /> : null}
          <span className={styles.previewLabel}>
            <i />
            {mapKindLabel(map)}
          </span>
        </div>
        <div className={styles.mapCardBody}>
          <div className={styles.mapCardTop}>
            <h2>{map.name}</h2>
            <span aria-hidden="true">↗</span>
          </div>
          <p className={styles.mapDescription}>
            {atlas.isError
              ? 'This map could not load.'
              : !atlas.data
                ? `Loading ${placeWords(map).many}…`
                : atlas.data.nodes.length
                  ? countPlaces(atlas.data, atlas.data.nodes.length)
                  : `No ${placeWords(atlas.data).many} have been added yet.`}
          </p>
          <div className={styles.mapCardFoot}>
            <span>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z" />
                <path d="m3.4 6.2 6.6 3.4 6.6-3.4M10 9.8v7.4" />
              </svg>
              {region}
            </span>
            <span>
              Open atlas <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </Link>
      {atlas.isError ? (
        <button
          type="button"
          className={styles.cardRetry}
          onClick={() => {
            atlas.retry();
          }}
        >
          Retry {map.name}
        </button>
      ) : null}
    </article>
  );
}
export function MapDirectory({ directory }: { directory: Directory }) {
  const [params, setParams] = useSearchParams();
  const region = params.get('region') ?? '';
  const query = params.get('q') ?? '';
  const regionName = (id: string | null) =>
    directory.regions.find((item) => item.id === id)?.name ??
    (id === null ? 'Global' : 'Region unavailable');
  const regions = directory.regions.filter((item) =>
    directory.maps.some((map) => map.regionId === item.id),
  );
  const filters = [
    {
      value: '',
      label: 'All maps',
    },
    ...regions.map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ];
  const activeRegion = filters.some((item) => item.value === region) ? region : '';
  const visible = directory.maps.filter(
    (map) =>
      (!activeRegion || map.regionId === activeRegion) &&
      `${map.name} ${map.atlasCode} ${regionName(map.regionId)}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const filter = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  return (
    <>
      <PageToolbar
        label="Filter maps"
        segments={
          <PageToolbar.Segments
            aria-label="Map region filters"
            options={filters}
            value={activeRegion}
            onValueChange={(value) => filter('region', value)}
          />
        }
        count={pluralize(visible.length, 'map')}
        actions={
          <PageToolbar.Search
            label="Search maps"
            value={query}
            onValueChange={(value) => filter('q', value)}
          />
        }
      />
      <CardGrid as="section" gap={4} aria-label="Campaign maps">
        {visible.map((map) => (
          <MapCard key={map.id} map={map} region={regionName(map.regionId)} />
        ))}
      </CardGrid>
      {!visible.length ? (
        <p className={styles.emptyDirectory}>
          No maps match this search. Try a different name or region.
        </p>
      ) : null}
    </>
  );
}
