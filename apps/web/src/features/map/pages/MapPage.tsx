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
import { PointcrawlViewport } from '../components/PointcrawlViewport.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import { edgeDisplayLabel } from '../edgeLabel.js';
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
  const directoryMaps = page.directory.data?.maps ?? [];
  const regionOptions = [
    { id: '', name: 'All regions', count: directoryMaps.length },
    ...(directoryMaps.some((item) => item.regionId === null)
      ? [
          {
            id: 'global',
            name: 'Global',
            count: directoryMaps.filter((item) => item.regionId === null).length,
          },
        ]
      : []),
    ...(page.directory.data?.regions ?? []).flatMap((region) => {
      const count = directoryMaps.filter((item) => item.regionId === region.id).length;
      return count ? [{ id: region.id, name: region.name, count }] : [];
    }),
  ];
  const requestedRegion = params.get('region') ?? '';
  const regionFilter = regionOptions.some((option) => option.id === requestedRegion)
    ? requestedRegion
    : '';
  const visibleMaps = directoryMaps.filter(
    (item) => !regionFilter || (item.regionId ?? 'global') === regionFilter,
  );
  const chooseRegion = (value: string) => {
    const candidates = directoryMaps.filter(
      (item) => !value || (item.regionId ?? 'global') === value,
    );
    const target =
      candidates.find((item) => item.atlasCode === page.selectedAtlas) ?? candidates[0];
    if (!target) return;
    const next = new URLSearchParams(params);
    if (value) next.set('region', value);
    else next.delete('region');
    if (target.atlasCode !== page.selectedAtlas) next.delete('node');
    navigate(
      `/map/${encodeURIComponent(target.atlasCode)}${next.size ? `?${next}` : ''}`,
    );
  };
  const countLabel = map
    ? `${pluralize(map.nodes.length, 'location')}, ${pluralize(map.edges.length, 'connection')}`
    : undefined;
  const body = (
    <div className={`stack ${styles.page}`}>
      <PageHeader
        back={{ to: '/codex', label: 'Codex' }}
        title={map?.name ?? 'Map'}
        lede={map ? `${humanizeKey(map.family)} map` : undefined}
        actions={
          <>
            {map?.regionId ? (
              <Link className="btn btn--secondary" to={`/regions/${map.regionId}`}>
                Region overview
              </Link>
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
      {page.directory.data?.maps.length ? (
        <FilterBar
          label="Choose a map"
          count={page.map.isFetching ? 'Refreshing…' : countLabel}
        >
          <FilterBar.Group label="Region">
            {regionOptions.map((region) => (
              <Chip
                key={region.id}
                size="sm"
                selected={regionFilter === region.id}
                onClick={() => chooseRegion(region.id)}
              >
                {region.name} ({region.count})
              </Chip>
            ))}
          </FilterBar.Group>
          <FilterBar.Picker
            label="Map"
            value={page.selectedAtlas}
            options={visibleMaps.map((item) => ({
              value: item.atlasCode,
              label: item.name,
            }))}
            onValueChange={(code) =>
              navigate(
                `/map/${encodeURIComponent(code)}${regionFilter ? `?region=${encodeURIComponent(regionFilter)}` : ''}`,
              )
            }
          />
        </FilterBar>
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
          {params.get('node') &&
          !map.nodes.some((node) => node.id === params.get('node')) ? (
            <p role="status">The requested location is unavailable on this map.</p>
          ) : null}
          <div data-map-ready="true" className="stack">
            {map.nodes.length ? (
              <div className={styles.explorer}>
                <PointcrawlViewport
                  key={map.id}
                  map={map}
                  selectedId={selected?.id ?? null}
                  onSelect={select}
                  actions={
                    map.canEdit ? (
                      <>
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
                      </>
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
                  />
                ) : null}
              </div>
            ) : (
              <StatePanel
                status="empty"
                emptyMessage="This map has no locations yet."
                action={
                  map.canEdit ? (
                    <Button
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
                  ) : undefined
                }
              />
            )}
            {selected ? (
              <p
                role="status"
                aria-live="polite"
                data-map-selection-feedback={selected.id}
                className={styles.srOnly}
              >
                Selected location: {selected.name}.
              </p>
            ) : null}
            <section className={`card ${styles.disclosure}`} aria-label="Map locations">
              <details>
                <summary className="type-title">Locations ({map.nodes.length})</summary>
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
              </details>
            </section>
            <section
              className={`card ${styles.disclosure}`}
              aria-label="Map connections"
            >
              <details>
                <summary className="type-title">
                  Connections ({map.edges.length})
                </summary>
                {map.edges.length ? (
                  <ul className={styles.connections}>
                    {map.edges.map((edge) => {
                      const a = map.nodes.find((node) => node.id === edge.nodeA);
                      const b = map.nodes.find((node) => node.id === edge.nodeB);
                      const touchesSelected =
                        selected !== null &&
                        (edge.nodeA === selected.id || edge.nodeB === selected.id);
                      return a && b ? (
                        <li key={edge.id}>
                          <span className={styles.connection}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => select(a.id)}
                            >
                              {a.name}
                            </Button>
                            <span aria-hidden="true">{edge.directed ? '→' : '↔'}</span>
                            <span className={styles.srOnly}>
                              {edge.directed
                                ? 'leads one way to'
                                : 'connects both ways with'}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => select(b.id)}
                            >
                              {b.name}
                            </Button>
                            <Chip size="sm" tone="line">
                              {edgeDisplayLabel(edge)}
                            </Chip>
                          </span>
                          {map.canEdit && touchesSelected ? (
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
              </details>
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
    <PageShell className={styles.shell}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
