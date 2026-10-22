import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMapPage } from '../hooks/useMapPage.js';
import { MapEditDialog } from '../components/MapEditDialog.js';
import type { MapEdit } from '../hooks/useMapEdit.js';
import { MapNodeDetails } from '../components/MapNodeDetails.js';
import { PointcrawlViewport } from '../components/PointcrawlViewport.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Menu } from '../../../components/primitives/Menu.js';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import type { MapAtlasView } from '../adapters/mapAdapter.js';
import { edgeDisplayLabel } from '../edgeLabel.js';
import styles from './map.module.css';

/** Atlas switcher on the shared Menu primitive (no native select). */
function AtlasPicker({
  maps,
  selected,
  onSelect,
}: {
  maps: MapAtlasView[];
  selected: string;
  onSelect: (atlasCode: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const current = maps.find((item) => item.atlasCode === selected);
  return (
    <div className={styles.mapPicker}>
      <span className="type-label" id={labelId}>
        Atlas
      </span>
      <Menu
        ariaLabel="Choose map"
        triggerLabelledBy={`${labelId} ${valueId}`}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <span className={styles.atlasTrigger} id={valueId}>
            <span>{current?.name ?? selected}</span>
            <span className="type-code">{selected}</span>
            <span aria-hidden="true" className={styles.caret}>
              ▾
            </span>
          </span>
        }
        items={maps.map((item) => ({
          key: item.id,
          textValue: item.name,
          label: (
            <span className={styles.atlasOption} data-current={item.atlasCode === selected}>
              <span>{item.name}</span>
              <span className="type-code">{item.atlasCode}</span>
            </span>
          ),
          current: item.atlasCode === selected,
          onSelect: () => onSelect(item.atlasCode),
        }))}
      />
    </div>
  );
}

const DECLARATION: PageDeclaration = {
  page: 'map',
  regions: [{ role: 'body', priority: 1 }],
};
export function MapPage(): React.JSX.Element {
  const { atlasCode = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedAtlas = atlasCode || params.get('atlas') || params.get('map') || '';
  const page = useMapPage(requestedAtlas);
  const [draft, setDraft] = useState<{ scopeKey: string; value: MapEdit } | null>(null);
  const [notice, setNotice] = useState<{
    noticeScope: string;
    targetScope: string;
    message: string;
  } | null>(null);
  const map = page.map.data;
  const mapLoaded = map !== undefined;
  const selected =
    map?.nodes.find((node) => node.id === params.get('node')) ?? map?.nodes[0] ?? null;
  const noticeScope = JSON.stringify([
    page.actorScope,
    requestedAtlas,
    params.get('node'),
  ]);
  const targetScope = JSON.stringify([
    page.actorScope,
    page.selectedAtlas,
    map?.id ?? null,
    selected?.id ?? null,
  ]);
  const scopeKey = JSON.stringify([targetScope, page.authorityScope]);
  const latestScope = useRef(scopeKey);
  latestScope.current = scopeKey;
  const isCurrent = () => latestScope.current === scopeKey && page.isCurrent();
  const edit =
    draft?.scopeKey === scopeKey && page.admitEdit(draft.value) ? draft.value : null;
  useEffect(() => {
    setDraft((current) => (current?.scopeKey === scopeKey ? current : null));
  }, [scopeKey]);
  useEffect(() => {
    setNotice((current) =>
      current?.noticeScope === noticeScope &&
      (!mapLoaded || current.targetScope === targetScope)
        ? current
        : null,
    );
  }, [noticeScope, mapLoaded, targetScope]);
  const setEdit = (value: MapEdit | null) => {
    if (!isCurrent() || (value && !page.admitEdit(value))) return;
    setDraft(value ? { scopeKey, value } : null);
  };
  const select = (id: string) => {
    setParams(
      (current) => {
        current.set('node', id);
        return current;
      },
      { replace: true },
    );
  };
  async function reload(nextAtlas?: string, nextNode?: string) {
    if (!isCurrent() || !(await page.refresh()) || !isCurrent()) return;
    if (nextAtlas) navigate(`/map/${encodeURIComponent(nextAtlas)}`);
    else if (nextNode) select(nextNode);
  }
  const body = (
    <div className={`stack ${styles.page}`}>
      {notice?.noticeScope === noticeScope &&
      (!mapLoaded || notice.targetScope === targetScope) ? (
        <p role="alert">{notice.message}</p>
      ) : null}
      <div className={styles.toolbar}>
        <Link className="btn btn--ghost btn--sm" to="/regions">
          ← Regions
        </Link>
        {page.canCreate ? (
          <Button
            variant="secondary"
            onClick={() =>
              setEdit({
                kind: 'create',
                regions: page.creatableRegions,
                global: page.isAdmin,
              })
            }
          >
            Create map
          </Button>
        ) : null}
      </div>
      {page.directory.isError ? (
        <div role="alert">
          Map directory could not load.{' '}
          <Button
            variant="ghost"
            onClick={() => {
              page.retryDirectory();
            }}
          >
            Retry directory
          </Button>
        </div>
      ) : null}
      {page.directory.data?.maps.length ? (
        <AtlasPicker
          maps={page.directory.data.maps}
          selected={page.selectedAtlas}
          onSelect={(code) => navigate(`/map/${encodeURIComponent(code)}`)}
        />
      ) : null}
      {page.map.isError ? (
        <>
          <StatePanel status="error" error={toAppError(page.map.error, 'map:page')} />
          <Button
            variant="secondary"
            onClick={() => {
              page.retryMap();
            }}
          >
            Retry map
          </Button>
        </>
      ) : map ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.mapMeta}>
              <Chip size="sm" tone="category">
                {humanizeKey(map.family)} map
              </Chip>
              <span className="type-caption">
                {pluralize(map.nodes.length, 'location')} ·{' '}
                {pluralize(map.edges.length, 'connection')}
              </span>
            </div>
            {map.regionId ? (
              <Link
                className="btn btn--secondary btn--sm"
                to={`/regions/${map.regionId}`}
              >
                Region overview
              </Link>
            ) : null}
            {page.map.isFetching ? (
              <span role="status" className="type-caption">
                Refreshing…
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void reload();
              }}
            >
              Refresh
            </Button>
          </div>
          {map.canEdit ? (
            <div className={styles.toolbar}>
              <Button
                size="sm"
                onClick={() =>
                  setEdit({
                    kind: 'node',
                    map,
                    node: null,
                    maps: page.directory.data?.maps ?? [],
                  })
                }
              >
                Add location
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={map.nodes.length < 2}
                onClick={() =>
                  setEdit({ kind: 'edge', map, edge: null, nodes: map.nodes })
                }
              >
                Add connection
              </Button>
            </div>
          ) : null}
          {params.get('node') &&
          !map.nodes.some((node) => node.id === params.get('node')) ? (
            <p role="status">The requested location is unavailable on this map.</p>
          ) : null}
          <div data-map-ready="true" className="stack">
            {map.nodes.length ? (
              <PointcrawlViewport
                key={map.id}
                map={map}
                selectedId={selected?.id ?? null}
                onSelect={select}
              />
            ) : (
              <StatePanel
                status="empty"
                emptyMessage="This map has no locations yet."
              />
            )}
            {selected ? (
              <p
                role="status"
                aria-live="polite"
                data-map-selection-feedback={selected.id}
                className={styles.activeLocation}
              >
                Selected location: {selected.name}.{' '}
                <a href="#map-location-details">View details</a>
              </p>
            ) : null}
            <div className={styles.explorer}>
              <section className="card stack" aria-label="Map locations">
                <h2 className="type-heading">Locations</h2>
                <ul className={styles.nodeList} aria-label="Map locations">
                  {map.nodes.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        className={styles.locationButton}
                        aria-pressed={node.id === selected?.id}
                        onClick={() => select(node.id)}
                      >
                        {node.name}
                        {node.submapId ? (
                          <span className="type-caption">Submap</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {map.nodes.length === 0 ? <p>No locations to select.</p> : null}
              </section>
              {selected ? (
                <MapNodeDetails
                  key={`${page.actorScope}:${map.id}:${selected.id}`}
                  map={map}
                  node={selected}
                  maps={page.directory.data?.maps ?? []}
                  onEdit={setEdit}
                  onReload={reload}
                />
              ) : null}
            </div>
            <section className="card stack" aria-label="Map connections">
              <h2 className="type-heading">Connections</h2>
              {map.edges.length ? (
                <ul className={styles.connections}>
                  {map.edges.map((edge) => {
                    const a = map.nodes.find((node) => node.id === edge.nodeA);
                    const b = map.nodes.find((node) => node.id === edge.nodeB);
                    return a && b ? (
                      <li key={edge.id}>
                        <span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => select(a.id)}
                          >
                            {a.name}
                          </Button>{' '}
                          {edge.directed ? '→' : '↔'}{' '}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => select(b.id)}
                          >
                            {b.name}
                          </Button>{' '}
                          <span className="type-caption">· {edgeDisplayLabel(edge)}</span>
                        </span>
                        {map.canEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEdit({ kind: 'edge', map, edge, nodes: map.nodes })
                            }
                          >
                            Edit connection
                          </Button>
                        ) : null}
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : (
                <p>No connections recorded.</p>
              )}
            </section>
          </div>
        </>
      ) : page.directory.isPending || page.map.isFetching ? (
        <StatePanel status="loading" />
      ) : !page.directory.isError ? (
        <StatePanel
          status="empty"
          emptyMessage="No pointcrawl maps are available for this viewer."
        />
      ) : null}
      {edit ? (
        <MapEditDialog
          key={`${scopeKey}:${edit.kind}:${edit.kind === 'node' ? edit.node?.id : edit.kind === 'edge' ? edit.edge?.id : edit.kind === 'link' ? edit.node.id : ''}`}
          edit={edit}
          onClose={() => setEdit(null)}
          onSaved={reload}
          scopeKey={scopeKey}
          admit={(regionId) => isCurrent() && page.admitEdit(edit, regionId)}
          onDenied={async (message) => {
            if (!isCurrent()) return;
            setNotice({ noticeScope, targetScope, message });
            await page.refresh();
          }}
        />
      ) : null}
    </div>
  );
  const regions: PageRegionRenderers = { body: () => body };
  return (
    <PageShell title={map?.name ?? 'Map'} className={styles.shell}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
