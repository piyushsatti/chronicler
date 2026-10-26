import { MapDirectory } from '../components/MapDirectory.js';
import type { MapViewportHandle } from '../components/PointcrawlViewport.js';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMapPage } from '../hooks/useMapPage.js';
import { MapEditDialog } from '../components/MapEditDialog.js';
import type { MapEdit } from '../hooks/useMapEdit.js';
import { MapNodeDetails } from '../components/MapNodeDetails.js';
import { MapRegionDetails } from '../components/MapRegionDetails.js';
import { PointcrawlViewport } from '../components/PointcrawlViewport.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { placeWords } from '../mapWords.js';
import styles from './map.module.css';

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
  const words = placeWords(map ?? { edges: [] });
  const selected = map?.nodes.find((node) => node.id === params.get('node')) ?? null;
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
  const viewport = useRef<MapViewportHandle>(null);
  const clearSelection = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('node');
        return next;
      },
      { replace: true },
    );
  const closeDetails = () => {
    const id = selected?.id;
    clearSelection();
    if (id) viewport.current?.focusNode(id);
  };
  useEffect(() => {
    if (!selected || edit) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        (event.target instanceof Element && event.target.closest('[role="dialog"]'))
      )
        return;
      event.preventDefault();
      closeDetails();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  });
  const regionName =
    page.region?.name ?? (map?.regionId === null ? 'Global' : 'Region unavailable');
  const body = (
    <div className={`stack ${styles.page}`}>
      <PageHeader
        title={requestedAtlas ? (map?.name ?? 'Map') : 'Map'}
        lede={
          requestedAtlas
            ? 'Campaign map · Follow the roads, then follow the stories.'
            : 'Browse the places your campaign has charted.'
        }
        actions={
          <>
            {requestedAtlas && map?.canEdit ? (
              <Button
                variant="secondary"
                onClick={() => setEdit({ kind: 'map', map })}
              >
                Edit map
              </Button>
            ) : null}
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
          </>
        }
      />
      {notice?.noticeScope === noticeScope &&
      (!mapLoaded || notice.targetScope === targetScope) ? (
        <p role="alert">{notice.message}</p>
      ) : null}
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
      {!requestedAtlas && page.directory.isPending ? (
        <StatePanel status="loading" />
      ) : null}
      {!requestedAtlas && page.directory.data ? (
        <MapDirectory directory={page.directory.data} />
      ) : null}
      {requestedAtlas ? (
        <>
          {page.map.isError ? (
            <>
              <StatePanel
                status="error"
                error={toAppError(page.map.error, 'map:page')}
              />
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
              {params.get('node') &&
              !map.nodes.some((node) => node.id === params.get('node')) ? (
                <p role="status">The requested {words.one} is unavailable on this map.</p>
              ) : null}
              <div data-map-ready="true" className="stack">
                <div className={styles.explorer}>
                  <PointcrawlViewport
                    key={map.id}
                    ref={viewport}
                    siblings={(page.siblingMaps.length ? page.siblingMaps : [map]).map(
                      (item) => ({
                        to: `/map/${encodeURIComponent(item.atlasCode)}`,
                        label: item.name,
                        current: item.id === map.id,
                      }),
                    )}
                    map={map}
                    selectedId={selected?.id ?? null}
                    onSelect={select}
                    onClear={clearSelection}
                    onAddAt={
                      map.canEdit && words.one === 'location'
                        ? (at) =>
                            setEdit({
                              kind: 'node',
                              map,
                              node: null,
                              maps: page.directory.data?.maps ?? [],
                              at,
                            })
                        : undefined
                    }
                    actions={
                      map.canEdit ? (
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
                          Add {words.one}
                        </Button>
                      ) : null
                    }
                  />
                  {selected ? (
                    <MapNodeDetails
                      key={`${page.actorScope}:${map.id}:${selected.id}`}
                      map={map}
                      node={selected}
                      maps={page.directory.data?.maps ?? []}
                      onEdit={setEdit}
                      onReload={reload}
                      region={regionName}
                      onClose={closeDetails}
                      onShowOnMap={() => viewport.current?.centerNode(selected.id)}
                    />
                  ) : (
                    <MapRegionDetails
                      map={map}
                      regionName={regionName}
                      document={page.regionDocument}
                    />
                  )}
                </div>
                {map.regionId ? (
                  <Link
                    className={`btn btn--secondary ${styles.start} ${styles.regionOverview}`}
                    to={`/regions/${map.regionId}`}
                  >
                    Region overview
                  </Link>
                ) : null}
                {selected ? (
                  <p
                    role="status"
                    aria-live="polite"
                    data-map-selection-feedback={selected.id}
                    className={styles.srOnly}
                  >
                    Selected {words.one}: {selected.name}.
                  </p>
                ) : null}
                <section
                  className={`card ${styles.disclosure}`}
                  aria-label={`Map ${words.many}`}
                >
                  <details>
                    <summary className="type-title">
                      {words.Many} ({map.nodes.length})
                    </summary>
                    <ul className={styles.nodeList} aria-label={`Map ${words.many}`}>
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
                    {map.nodes.length === 0 ? <p>No {words.many} to select.</p> : null}
                  </details>
                </section>
              </div>
            </>
          ) : page.directory.isPending || page.map.isFetching ? (
            <StatePanel status="loading" />
          ) : !page.directory.isError ? (
            <StatePanel
              status="empty"
              emptyMessage="No maps are available for this viewer."
            />
          ) : null}
        </>
      ) : null}
      {edit ? (
        <MapEditDialog
          key={`${scopeKey}:${edit.kind}:${edit.kind === 'node' ? `${edit.node?.id ?? ''}${edit.at ? `@${edit.at.x},${edit.at.y}` : ''}` : edit.kind === 'link' ? edit.node.id : ''}`}
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
    <PageShell className={styles.shell}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
