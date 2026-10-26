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
import { pluralize } from '../../../utils/format.js';
import styles from '../pages/map.module.css';
import { edgeDisplayLabel, isAuthoredEdgeLabel } from '../edgeLabel.js';
import {
  MAP_LABEL_DY,
  MAP_PIN_RADIUS,
  MAP_PIN_TAIL,
  placeLabels,
} from '../labelLayout.js';
import { MapKey } from './MapKey.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';

// Stored asset paths may be absolute URLs or site-relative; both resolve from the site root.
export function mapAssetHref(assetPath: string | null): string | null {
  if (!assetPath) return null;
  return /^(?:[a-z]+:|\/)/i.test(assetPath) ? assetPath : `/${assetPath}`;
}

export function graphBounds(nodes: readonly { x: number; y: number }[]) {
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

export function fitGraphView(
  bounds: ReturnType<typeof graphBounds>,
  size: { width: number; height: number },
  stretchVertically = true,
) {
  const verticalScale =
    stretchVertically && size.width > 0 && size.height > 0
      ? Math.max(1, size.height / size.width / (bounds.height / bounds.width))
      : 1;
  const height = bounds.height * verticalScale;
  return {
    y: bounds.y + (bounds.height - height) / 2,
    height,
    verticalScale,
  };
}

/** Click travel, in screen pixels, below which a press on the canvas is a click, not a pan. */
const CLICK_SLOP = 4;
/** Hover/selection ring radius around a pin, in screen pixels. */
const MAP_RING_RADIUS = MAP_PIN_RADIUS + 7;

/**
 * Each place owns the area within its hover radius: the larger of the pin and the
 * hexagon a regular grid with this place's nearest-neighbour spacing would give it
 * (circumradius = spacing / sqrt 3). On a hex map that is the hex cell, so the
 * nearest-place rule makes the ring follow the cursor from hex to hex.
 *
 * `uniform` (hex maps) gives every place one cell radius from the median
 * nearest-neighbour spacing, so isolated tiles of a sparse grid are not oversized.
 */
export function hoverRadii(
  nodes: readonly { id: string; x: number; y: number }[],
  minimum: number,
  uniform = false,
): Map<string, number> {
  const nearest = nodes.map((node) => {
    let distance = Infinity;
    for (const other of nodes)
      if (other !== node)
        distance = Math.min(distance, Math.hypot(other.x - node.x, other.y - node.y));
    return distance;
  });
  const cell = (distance: number) =>
    Number.isFinite(distance) ? Math.max(minimum, distance / Math.sqrt(3)) : minimum;
  if (uniform) {
    const finite = nearest.filter(Number.isFinite).sort((a, b) => a - b);
    const middle = finite.length / 2;
    const median = finite.length
      ? finite.length % 2
        ? finite[Math.floor(middle)]!
        : (finite[middle - 1]! + finite[middle]!) / 2
      : Infinity;
    return new Map(nodes.map((node) => [node.id, cell(median)]));
  }
  return new Map(nodes.map((node, index) => [node.id, cell(nearest[index]!)]));
}

export function placeAt(
  nodes: readonly { id: string; x: number; y: number }[],
  radii: ReadonlyMap<string, number>,
  point: { x: number; y: number },
): string | null {
  let best: string | null = null,
    bestDistance = Infinity;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance <= (radii.get(node.id) ?? 0) && distance < bestDistance) {
      best = node.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** Per-viewer choice to draw route lines; routes are hidden by default (owner decision). */
export const MAP_ROUTES_STORAGE_KEY = 'chronicler:map:show-routes';
function readShowRoutes(): boolean {
  try {
    return localStorage.getItem(MAP_ROUTES_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
function writeShowRoutes(value: boolean): void {
  try {
    localStorage.setItem(MAP_ROUTES_STORAGE_KEY, String(value));
  } catch {
    // Storage may be unavailable (private window, blocked site data); the toggle still works.
  }
}

/** A hex map is one whose routes are hex adjacency links (the seeded hexflower). */
export function isHexMap(map: { edges: readonly { kind: string }[] }): boolean {
  return map.edges.some((edge) => edge.kind === 'hex');
}

/** Flat-top hexagon vertices around the origin, matching the flat-top source maps. */
export function flatTopHexagon(radius: number): string {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 3) * corner;
    return `${(radius * Math.cos(angle)).toFixed(3)},${(radius * Math.sin(angle)).toFixed(3)}`;
  }).join(' ');
}

export type MapViewportHandle = {
  focusNode: (id: string) => void;
  centerNode: (id: string) => void;
};
export function PointcrawlViewport({
  map,
  selectedId,
  onSelect,
  onClear,
  actions,
  siblings,
  ref,
}: {
  map: Pointcrawl;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Clicking empty canvas clears the selection. */
  onClear?: () => void;
  actions?: React.ReactNode;
  siblings?: SegmentedNavItem[];
  ref?: Ref<MapViewportHandle>;
}) {
  const marker = useId().replaceAll(':', '');
  const assetHref = mapAssetHref(map.assetPath);
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
  const hexMap = isHexMap(map);
  // Hex maps keep their aspect ratio so the hexes tile.
  const graphView = fitGraphView(bounds, size, (!assetHref || assetFailed) && !hexMap);
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
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(readShowRoutes);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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
    height = graphView.height / camera.zoom;
  const pixelsPerUnit =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / width, size.height / height)
      : 1;
  const viewX = bounds.x + (bounds.width - width) / 2 + camera.x;
  const viewY = graphView.y + (graphView.height - height) / 2 + camera.y;
  const viewHeight = size.height > 0 ? size.height / pixelsPerUnit : height;
  const viewBoxY = viewY - (viewHeight - height) / 2;
  const mapY = (y: number) => graphView.y + (y - bounds.y) * graphView.verticalScale;
  const labels = useMemo(
    () =>
      new Map(
        placeLabels(
          map.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            x: node.x * pixelsPerUnit,
            y: mapY(node.y) * pixelsPerUnit,
          })),
          {
            x1: viewX * pixelsPerUnit,
            y1: viewBoxY * pixelsPerUnit,
            x2: (viewX + width) * pixelsPerUnit,
            y2: (viewBoxY + viewHeight) * pixelsPerUnit,
          },
        ).map((label) => [label.id, label]),
      ),
    [map.nodes, pixelsPerUnit, viewX, viewBoxY, width, viewHeight, graphView, bounds],
  );
  const points = useMemo(
    () =>
      map.nodes.map((node) => ({
        id: node.id,
        x: node.x,
        y: graphView.y + (node.y - bounds.y) * graphView.verticalScale,
      })),
    [map.nodes, graphView.y, graphView.verticalScale, bounds.y],
  );
  const radii = useMemo(
    // Hex cells keep their true size so they tile; other maps grow to the pin size.
    () => hoverRadii(points, hexMap ? 0 : MAP_PIN_RADIUS / pixelsPerUnit, hexMap),
    [points, pixelsPerUnit, hexMap],
  );
  const unit = 1 / pixelsPerUnit;
  const showArt = Boolean(assetHref && !assetFailed);
  /** The place under a client point, using the viewBox's default xMidYMid meet fit. */
  const placeUnder = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scale = Math.min(rect.width / width, rect.height / viewHeight);
    return placeAt(points, radii, {
      x: viewX + (clientX - rect.left - (rect.width - width * scale) / 2) / scale,
      y:
        viewBoxY +
        (clientY - rect.top - (rect.height - viewHeight * scale) / 2) / scale,
    });
  };
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
            y: mapY(node.y) - graphView.y - graphView.height / 2,
          }));
      },
    }),
    [byId, bounds, graphView],
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
  // Places are plain Tab stops; arrow keys do not move between them (owner feedback).
  const keyboardSelect = (event: React.KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(id);
  };
  // Keyboard focus shows the same ring and name as pointer hover.
  const hoveredNode =
    (hoveredId ? byId.get(hoveredId) : undefined) ??
    (focusedId ? byId.get(focusedId) : undefined);
  const selectedNode = selectedId ? byId.get(selectedId) : undefined;
  const activeIds = new Set([hoveredNode?.id, selectedNode?.id]);
  const endPointer = (id: number) => {
    pointers.current.delete(id);
    drag.current = null;
    pinch.current = null;
  };
  return (
    <section className={styles.viewport} aria-label="Pointcrawl viewport">
      <PageToolbar
        className={styles.atlasToolbar}
        label="Map controls"
        segments={
          siblings ? <SegmentedNav items={siblings} label="Choose a map" /> : undefined
        }
        count={
          showRoutes
            ? `${pluralize(map.nodes.length, 'place')} · ${pluralize(map.edges.length, 'route')}`
            : pluralize(map.nodes.length, 'place')
        }
        actions={
          <>
            {map.edges.length ? (
              <Checkbox
                className={styles.routesToggle}
                label="Show routes"
                checked={showRoutes}
                onCheckedChange={(next) => {
                  setShowRoutes(next);
                  writeShowRoutes(next);
                }}
              />
            ) : null}
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
        <div className={styles.mapFrame} data-map-frame="true">
          <svg
            ref={graph}
            className={styles.graph}
            role="group"
            aria-label={`${map.name} pointcrawl graph`}
            viewBox={`${viewX} ${viewBoxY} ${width} ${viewHeight}`}
            onPointerDown={(event) => {
              press.current = null;
              if (
                event.target instanceof Element &&
                event.target.closest('[data-node-id]')
              )
                return;
              press.current = { x: event.clientX, y: event.clientY, moved: false };
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
                if (press.current) press.current.moved = true;
              } else
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  panX: camera.x,
                  panY: camera.y,
                };
            }}
            onPointerMove={(event) => {
              const pin =
                event.target instanceof Element
                  ? event.target.closest<SVGGElement>('[data-node-id]')
                  : null;
              setHoveredId(
                pin?.dataset.nodeId ??
                  placeUnder(event.currentTarget, event.clientX, event.clientY),
              );
              if (
                press.current &&
                Math.hypot(
                  event.clientX - press.current.x,
                  event.clientY - press.current.y,
                ) > CLICK_SLOP
              )
                press.current.moved = true;
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
            onPointerLeave={() => setHoveredId(null)}
            onClick={(event) => {
              const start = press.current;
              press.current = null;
              if (
                !start ||
                start.moved ||
                (event.target instanceof Element &&
                  event.target.closest('[data-node-id]'))
              )
                return;
              const id = placeUnder(event.currentTarget, event.clientX, event.clientY);
              if (id) onSelect(id);
              else onClear?.();
            }}
          >
            <title>
              {map.name}. Use Tab to move between places and Enter to select one.
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
            {assetHref && showArt ? (
              <image
                href={assetHref}
                x="0"
                y={graphView.y}
                width={assetSize?.width ?? bounds.width}
                height={graphView.height}
                preserveAspectRatio="xMinYMin meet"
              />
            ) : null}
            {/* Painted hex art already shows the cells; outline them only on a bare grid. */}
            {hexMap && !showArt ? (
              <g className={styles.hexGrid} aria-hidden="true" pointerEvents="none">
                {points.map((point) => (
                  <polygon
                    key={point.id}
                    data-hex-cell={point.id}
                    transform={`translate(${point.x} ${point.y})`}
                    points={flatTopHexagon(radii.get(point.id) ?? 0)}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            ) : null}
            {(showRoutes ? connectors : []).map(({ edge, points }) => (
              <g key={edge.id} className={styles.edge} data-edge-kind={edge.kind}>
                <polyline
                  points={points
                    .map((point) => `${point.x},${mapY(point.y)}`)
                    .join(' ')}
                  markerEnd={edge.directed ? `url(#${marker})` : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {edge.kind === 'pass' ? (
                  <polyline
                    className={styles.passInset}
                    points={points
                      .map((point) => `${point.x},${mapY(point.y)}`)
                      .join(' ')}
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
                      mapY(((points[0]?.y ?? 0) + (points[1]?.y ?? 0)) / 2) -
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
              // The ring layer shows the full name of the hovered or selected place.
              // Hex codes show only there, never as always-on labels.
              const hidden = hexMap || label?.text === '' || activeIds.has(node.id);
              return (
                <g
                  key={node.id}
                  role="button"
                  aria-label={node.name}
                  aria-pressed={node.id === selectedId}
                  tabIndex={0}
                  data-node-id={node.id}
                  data-node-index={index}
                  className={styles.node}
                  transform={`translate(${node.x} ${mapY(node.y)})`}
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(event) => keyboardSelect(event, node.id)}
                  onFocus={() => setFocusedId(node.id)}
                  onBlur={() =>
                    setFocusedId((current) => (current === node.id ? null : current))
                  }
                >
                  <title>{node.name}</title>
                  {/* A hex map is clicked by its whole cell; the ring marks the place. */}
                  {hexMap ? (
                    <polygon
                      className={styles.hexTarget}
                      points={flatTopHexagon(radii.get(node.id) ?? 0)}
                    />
                  ) : (
                    <>
                      <circle r={MAP_PIN_RADIUS * unit} vectorEffect="non-scaling-stroke" />
                      <path
                        className={styles.pinTail}
                        d={`M ${-11 * unit} ${11 * unit} L 0 ${MAP_PIN_TAIL * unit} L ${11 * unit} ${11 * unit}`}
                      />
                    </>
                  )}
                  <rect
                    visibility={hidden ? 'hidden' : undefined}
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
                    visibility={hidden ? 'hidden' : undefined}
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
            <g className={styles.ringLayer} aria-hidden="true" pointerEvents="none">
              {[
                { node: selectedNode, kind: 'selected' },
                ...(hoveredNode && hoveredNode !== selectedNode
                  ? [{ node: hoveredNode, kind: 'hover' }]
                  : []),
              ].map(({ node, kind }) => {
                if (!node) return null;
                const labelWidth = node.name.length * 8;
                // On hex maps the code sits just below the cell's bottom edge.
                const labelDy = hexMap
                  ? ((radii.get(node.id) ?? 0) * Math.sqrt(3)) / 2 + 18 * unit
                  : MAP_LABEL_DY * unit;
                return (
                  <g
                    key={kind}
                    data-map-ring={kind}
                    data-ring-node-id={node.id}
                    transform={`translate(${node.x} ${mapY(node.y)})`}
                  >
                    {hexMap ? (
                      <polygon
                        className={`${styles.ring} ${styles.hexRing}`}
                        points={flatTopHexagon(radii.get(node.id) ?? 0)}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <circle
                        className={styles.ring}
                        r={MAP_RING_RADIUS / pixelsPerUnit}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <rect
                      className={styles.ringPlate}
                      vectorEffect="non-scaling-stroke"
                      x={(-labelWidth / 2 - 5) / pixelsPerUnit}
                      y={labelDy - 14 * unit}
                      width={(labelWidth + 10) / pixelsPerUnit}
                      height={19 / pixelsPerUnit}
                      rx={4 / pixelsPerUnit}
                    />
                    <text
                      className={styles.ringLabel}
                      data-map-place-number={node.id}
                      y={labelDy}
                      fontSize={12 / pixelsPerUnit}
                      textAnchor="middle"
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {!map.nodes.length ? (
            <p className={styles.emptyCanvas}>No locations have been added yet.</p>
          ) : null}
          {showRoutes && map.edges.length ? <MapKey edges={map.edges} /> : null}
        </div>
        <div className={styles.mapMetaRow}>
          <p className={styles.canvasHint}>
            Click a place to explore it. Click empty map or press Escape to clear.
          </p>
        </div>
        {actions ? <div className={styles.canvasActions}>{actions}</div> : null}
      </div>
    </section>
  );
}
