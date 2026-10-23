import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import {
  SegmentedNav,
  type SegmentedNavItem,
} from '../../../components/primitives/SegmentedNav.js';
import type { Pointcrawl } from '../adapters/mapAdapter.js';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import styles from '../pages/map.module.css';
import { edgeDisplayLabel, isAuthoredEdgeLabel } from '../edgeLabel.js';
import { MAP_PIN_RADIUS, MAP_PIN_TAIL, placeLabels } from '../labelLayout.js';

export function graphBounds(nodes: Pointcrawl['nodes']) {
  let minX = nodes[0]?.x ?? 0,
    minY = nodes[0]?.y ?? 0,
    maxX = minX,
    maxY = minY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return {
    x: minX - 80,
    y: minY - 80,
    width: Math.max(240, maxX - minX + 160),
    height: Math.max(180, maxY - minY + 160),
  };
}

export type MapViewportHandle = {
  focusNode: (id: string) => void;
  centerNode: (id: string) => void;
};
export function PointcrawlViewport({
  map,
  selectedId,
  onSelect,
  actions,
  siblings,
  ref,
}: {
  map: Pointcrawl;
  selectedId: string | null;
  onSelect: (id: string) => void;
  actions?: React.ReactNode;
  siblings?: SegmentedNavItem[];
  ref?: Ref<MapViewportHandle>;
}) {
  const marker = useId().replaceAll(':', '');
  const assetHref = map.assetPath
    ? /^(?:[a-z]+:|\/)/i.test(map.assetPath)
      ? map.assetPath
      : `/${map.assetPath}`
    : null;
  const [assetFailed, setAssetFailed] = useState(false);
  const [assetSize, setAssetSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  useEffect(() => {
    setAssetSize(null);
    setAssetFailed(false);
    if (!assetHref) return;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight)
        setAssetSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => setAssetFailed(true);
    image.src = assetHref;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [assetHref]);
  const bounds = useMemo(
    () => (assetSize ? { x: 0, y: 0, ...assetSize } : graphBounds(map.nodes)),
    [map.nodes, assetSize],
  );
  const [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 });
  const graph = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = graph.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0)
        return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const byId = useMemo(
    () => new Map(map.nodes.map((node) => [node.id, node])),
    [map.nodes],
  );
  const connectors = useMemo(
    () =>
      map.edges.flatMap((edge) => {
        const a = byId.get(edge.nodeA),
          b = byId.get(edge.nodeB);
        if (!a || !b) return [];
        return [{ edge, points: [a, b] }];
      }),
    [map.edges, byId],
  );
  const width = bounds.width / camera.zoom,
    height = bounds.height / camera.zoom;
  const pixelsPerUnit =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / width, size.height / height)
      : 1;
  const viewX = bounds.x + (bounds.width - width) / 2 + camera.x;
  const viewY = bounds.y + (bounds.height - height) / 2 + camera.y;
  const labels = useMemo(
    () =>
      new Map(
        placeLabels(
          [...map.nodes]
            .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
            .map((node) => ({
              id: node.id,
              name: node.name,
              x: node.x * pixelsPerUnit,
              y: node.y * pixelsPerUnit,
            })),
          connectors.map(({ points: [a, b] }) => ({
            x1: (a?.x ?? 0) * pixelsPerUnit,
            y1: (a?.y ?? 0) * pixelsPerUnit,
            x2: (b?.x ?? 0) * pixelsPerUnit,
            y2: (b?.y ?? 0) * pixelsPerUnit,
          })),
          {
            x1: viewX * pixelsPerUnit,
            y1: viewY * pixelsPerUnit,
            x2: (viewX + width) * pixelsPerUnit,
            y2: (viewY + height) * pixelsPerUnit,
          },
          selectedId ?? undefined,
        ).map((label) => [label.id, label]),
      ),
    [map.nodes, pixelsPerUnit, connectors, selectedId, viewX, viewY, width, height],
  );
  const zoom = (factor: number) =>
    setCamera((value) => ({
      ...value,
      zoom: Math.max(0.5, Math.min(8, value.zoom * factor)),
    }));
  useImperativeHandle(
    ref,
    () => ({
      focusNode: (id) =>
        graph.current?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus(),
      centerNode: (id) => {
        const node = byId.get(id);
        if (node)
          setCamera((value) => ({
            ...value,
            x: node.x - bounds.x - bounds.width / 2,
            y: node.y - bounds.y - bounds.height / 2,
          }));
      },
    }),
    [byId, bounds],
  );
  useEffect(() => {
    const element = graph.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(Math.exp(-event.deltaY * 0.002));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const keyboardSelect = (event: React.KeyboardEvent<SVGGElement>, index: number) => {
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = map.nodes.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % map.nodes.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + map.nodes.length) % map.nodes.length;
    else if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const node = map.nodes[next];
    if (node) onSelect(node.id);
  };
  const endPointer = (id: number) => {
    pointers.current.delete(id);
    drag.current = null;
    pinch.current = null;
  };
  const kinds = [...new Set(map.edges.map((edge) => edge.kind))];
  return (
    <section className={styles.viewport} aria-label="Pointcrawl viewport">
      <PageToolbar
        className={styles.atlasToolbar}
        label="Map controls"
        segments={
          siblings ? <SegmentedNav items={siblings} label="Choose a map" /> : undefined
        }
        count={`${pluralize(map.nodes.length, 'place')} · ${pluralize(map.edges.length, 'route')}`}
        actions={
          <>
            <PageToolbar.IconAction
              label="Zoom out"
              disabled={camera.zoom <= 0.5}
              onClick={() => zoom(1 / 1.5)}
            >
              <svg viewBox="0 0 20 20">
                <path d="M4 10h12" />
              </svg>
            </PageToolbar.IconAction>
            <PageToolbar.IconAction
              label={siblings ? 'Reset zoom' : 'Fit map'}
              onClick={() => setCamera({ zoom: 1, x: 0, y: 0 })}
            >
              <svg viewBox="0 0 20 20">
                <path d="M3.5 9a6.7 6.7 0 1 1 1.8 4.5M3.5 4.8V9h4.2" />
              </svg>
            </PageToolbar.IconAction>
            <PageToolbar.IconAction
              label="Zoom in"
              disabled={camera.zoom >= 8}
              onClick={() => zoom(1.5)}
            >
              <svg viewBox="0 0 20 20">
                <path d="M4 10h12M10 4v12" />
              </svg>
            </PageToolbar.IconAction>
          </>
        }
      />
      <div className={styles.mapColumn}>
        <div className={styles.mapFrame}>
          <svg
            ref={graph}
            className={styles.graph}
            role="group"
            aria-label={`${map.name} pointcrawl graph`}
            viewBox={`${viewX} ${viewY} ${width} ${height}`}
            onPointerDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('[data-node-id]')
              )
                return;
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              event.currentTarget.setPointerCapture(event.pointerId);
              const [a, b] = [...pointers.current.values()];
              if (a && b) {
                pinch.current = {
                  distance: Math.hypot(a.x - b.x, a.y - b.y),
                  zoom: camera.zoom,
                };
                drag.current = null;
              } else
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  panX: camera.x,
                  panY: camera.y,
                };
            }}
            onPointerMove={(event) => {
              if (!pointers.current.has(event.pointerId)) return;
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              const [a, b] = [...pointers.current.values()];
              if (pinch.current && a && b && pinch.current.distance > 0) {
                const nextZoom =
                  (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
                  pinch.current.distance;
                setCamera((value) => ({
                  ...value,
                  zoom: Math.max(0.5, Math.min(8, nextZoom)),
                }));
              } else if (drag.current) {
                const rect = event.currentTarget.getBoundingClientRect();
                const unitsPerPixel = Math.max(
                  width / rect.width,
                  height / rect.height,
                );
                const start = drag.current;
                setCamera((value) => ({
                  ...value,
                  x: start.panX - (event.clientX - start.x) * unitsPerPixel,
                  y: start.panY - (event.clientY - start.y) * unitsPerPixel,
                }));
              }
            }}
            onPointerUp={(event) => endPointer(event.pointerId)}
            onPointerCancel={(event) => endPointer(event.pointerId)}
          >
            <title>
              {map.name}. Use Tab to enter the graph, arrow keys to choose a location,
              and Enter to select.
            </title>
            <defs>
              <marker
                id={marker}
                viewBox="0 0 10 10"
                refX={MAP_PIN_TAIL + 13}
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth={10 / pixelsPerUnit}
                markerHeight={10 / pixelsPerUnit}
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            {assetHref && !assetFailed ? (
              <image
                href={assetHref}
                x="0"
                y="0"
                width={assetSize?.width ?? bounds.width}
                height={assetSize?.height ?? bounds.height}
                preserveAspectRatio="xMinYMin meet"
              />
            ) : null}
            {connectors.map(({ edge, points }) => (
              <g key={edge.id} className={styles.edge} data-edge-kind={edge.kind}>
                <polyline
                  points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                  markerEnd={edge.directed ? `url(#${marker})` : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {edge.kind === 'pass' ? (
                  <polyline
                    className={styles.passInset}
                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                    vectorEffect="non-scaling-stroke"
                    aria-hidden="true"
                  />
                ) : null}
                <title>
                  {edgeDisplayLabel(edge)}
                  {edge.directed ? ' (one way)' : ''}
                </title>
                {isAuthoredEdgeLabel(edge.label) ? (
                  <text
                    className={styles.edgeLabel}
                    x={((points[0]?.x ?? 0) + (points[1]?.x ?? 0)) / 2}
                    y={
                      ((points[0]?.y ?? 0) + (points[1]?.y ?? 0)) / 2 -
                      7 / pixelsPerUnit
                    }
                    fontSize={10 / pixelsPerUnit}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            ))}
            {map.nodes.map((node, index) => {
              const label = labels.get(node.id);
              const dx = label?.dx ?? 0,
                dy = label?.dy ?? 30,
                labelWidth = label?.width ?? node.name.length * 7;
              return (
                <g
                  key={node.id}
                  role="button"
                  aria-label={node.name}
                  aria-pressed={node.id === selectedId}
                  tabIndex={
                    node.id === selectedId || (!selectedId && index === 0) ? 0 : -1
                  }
                  data-node-id={node.id}
                  data-node-index={index}
                  className={styles.node}
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(event) => keyboardSelect(event, index)}
                >
                  <title>{node.name}</title>
                  <circle
                    r={MAP_PIN_RADIUS / pixelsPerUnit}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    className={styles.pinTail}
                    d={`M ${-11 / pixelsPerUnit} ${11 / pixelsPerUnit} L 0 ${MAP_PIN_TAIL / pixelsPerUnit} L ${11 / pixelsPerUnit} ${11 / pixelsPerUnit}`}
                  />
                  <text
                    className={styles.pinNumber}
                    aria-hidden="true"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10 / pixelsPerUnit}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </text>
                  <rect
                    visibility={label?.text === '' ? 'hidden' : undefined}
                    className={styles.labelPlate}
                    x={(dx - labelWidth / 2 - 5) / pixelsPerUnit}
                    y={(dy - 14) / pixelsPerUnit}
                    width={(labelWidth + 10) / pixelsPerUnit}
                    height={19 / pixelsPerUnit}
                    rx={4 / pixelsPerUnit}
                  />
                  <text
                    className={styles.nodeLabel}
                    aria-hidden="true"
                    x={dx / pixelsPerUnit}
                    y={dy / pixelsPerUnit}
                    textLength={label?.width ? label.width / pixelsPerUnit : undefined}
                    lengthAdjust="spacingAndGlyphs"
                    fontSize={12 / pixelsPerUnit}
                    textAnchor="middle"
                  >
                    {label?.text ?? node.name}
                  </text>
                </g>
              );
            })}
          </svg>
          {!map.nodes.length ? (
            <p className={styles.emptyCanvas}>No locations have been added yet.</p>
          ) : null}
        </div>
        <div className={styles.mapMetaRow}>
          <p className={styles.canvasHint}>
            Drag to pan. Scroll or pinch to zoom. Arrow keys select locations.
          </p>
          {kinds.length ? (
            <div className={styles.legend} role="group" aria-label="Map legend">
              {kinds.map((kind) => (
                <span key={kind}>
                  <i data-edge-kind={kind} />
                  {humanizeKey(kind)}
                </span>
              ))}
              {map.edges.some((edge) => edge.directed) ? (
                <span>
                  <i className={styles.oneWay} />
                  One-way
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {actions ? <div className={styles.canvasActions}>{actions}</div> : null}
      </div>
    </section>
  );
}
