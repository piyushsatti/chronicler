import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import type { Pointcrawl } from '../adapters/mapAdapter.js';
import styles from '../pages/map.module.css';
import { edgeDisplayLabel } from '../edgeLabel.js';
import { placeLabels } from '../labelLayout.js';

export function graphBounds(nodes: Pointcrawl['nodes']) {
  let minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
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
export function PointcrawlViewport({
  map,
  selectedId,
  onSelect,
  actions,
}: {
  map: Pointcrawl;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Editing controls (Add location / Add connection) for people who can edit. */
  actions?: React.ReactNode;
}) {
  const marker = useId().replaceAll(':', '');
  const renderNodes = useMemo(() => {
    let extent = 1;
    for (const node of map.nodes)
      extent = Math.max(extent, Math.abs(node.x), Math.abs(node.y));
    const scale = Math.max(1, extent / 500);
    return map.nodes.map((node) => ({ ...node, x: node.x / scale, y: node.y / scale }));
  }, [map.nodes]);
  const bounds = useMemo(() => graphBounds(renderNodes), [renderNodes]);
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
  const byId = useMemo(
    () => new Map(renderNodes.map((node) => [node.id, node])),
    [renderNodes],
  );
  const width = bounds.width / camera.zoom;
  const height = bounds.height / camera.zoom;
  const pixelsPerUnit =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / width, size.height / height)
      : 1;
  const labels = useMemo(
    () =>
      new Map(
        placeLabels(
          renderNodes.map((node) => ({
            id: node.id,
            name: node.name,
            x: node.x * pixelsPerUnit,
            y: node.y * pixelsPerUnit,
          })),
          map.edges.flatMap((edge) => {
            const a = byId.get(edge.nodeA);
            const b = byId.get(edge.nodeB);
            return a && b
              ? [
                  {
                    x1: a.x * pixelsPerUnit,
                    y1: a.y * pixelsPerUnit,
                    x2: b.x * pixelsPerUnit,
                    y2: b.y * pixelsPerUnit,
                  },
                ]
              : [];
          }),
        ).map((label) => [label.id, label]),
      ),
    [renderNodes, pixelsPerUnit, map.edges, byId],
  );
  const keyboardSelect = (event: React.KeyboardEvent<SVGGElement>, index: number) => {
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = map.nodes.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % map.nodes.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + map.nodes.length) % map.nodes.length;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(map.nodes[index]?.id ?? '');
      return;
    } else return;
    event.preventDefault();
    const node = map.nodes[next];
    if (node) {
      onSelect(node.id);
      event.currentTarget.ownerSVGElement
        ?.querySelector<SVGGElement>(`[data-node-index="${next}"]`)
        ?.focus();
    }
  };
  return (
    <section className={styles.viewport} aria-label="Pointcrawl viewport">
      <div className={styles.toolbar} role="group" aria-label="Map view controls">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Zoom in"
          disabled={camera.zoom >= 8}
          onClick={() =>
            setCamera((value) => ({ ...value, zoom: Math.min(8, value.zoom * 1.5) }))
          }
        >
          +
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Zoom out"
          disabled={camera.zoom <= 0.5}
          onClick={() =>
            setCamera((value) => ({ ...value, zoom: Math.max(0.5, value.zoom / 1.5) }))
          }
        >
          −
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCamera({ zoom: 1, x: 0, y: 0 })}
        >
          Fit map
        </Button>
        <span className="type-caption">{Math.round(camera.zoom * 100)}%</span>
        {actions ? <div className={styles.canvasActions}>{actions}</div> : null}
      </div>
      <svg
        ref={graph}
        className={styles.graph}
        role="group"
        aria-label={`${map.name} pointcrawl graph`}
        viewBox={`${bounds.x + (bounds.width - width) / 2 + camera.x} ${bounds.y + (bounds.height - height) / 2 + camera.y} ${width} ${height}`}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              panX: camera.x,
              panY: camera.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            const rect = event.currentTarget.getBoundingClientRect();
            const unitsPerPixel = Math.max(width / rect.width, height / rect.height);
            setCamera((value) => ({
              ...value,
              x: drag.current
                ? drag.current.panX - (event.clientX - drag.current.x) * unitsPerPixel
                : value.x,
              y: drag.current
                ? drag.current.panY - (event.clientY - drag.current.y) * unitsPerPixel
                : value.y,
            }));
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <title>
          {map.name}. Use Tab to enter the graph, arrow keys to choose a location, and
          Enter to select.
        </title>
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="19"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={10 / pixelsPerUnit}
            markerHeight={10 / pixelsPerUnit}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {map.edges.map((edge) => {
          const a = byId.get(edge.nodeA);
          const b = byId.get(edge.nodeB);
          return a && b ? (
            <g key={edge.id} className={styles.edge}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                markerEnd={edge.directed ? `url(#${marker})` : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <title>
                {edgeDisplayLabel(edge)}
                {edge.directed ? ' (one way)' : ''}
              </title>
            </g>
          ) : null;
        })}
        {renderNodes.map((node, index) => {
          const label = labels.get(node.id);
          return (
            <g
              key={node.id}
              role="button"
              aria-label={node.name}
              aria-pressed={node.id === selectedId}
              tabIndex={node.id === selectedId || (!selectedId && index === 0) ? 0 : -1}
              data-node-index={index}
              className={styles.node}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => keyboardSelect(event, index)}
            >
              <title>{node.name}</title>
              <circle r={9 / pixelsPerUnit} vectorEffect="non-scaling-stroke" />
              <text
                className={styles.nodeLabel}
                aria-hidden="true"
                y={(label?.dy ?? 24) / pixelsPerUnit}
                fontSize={13 / pixelsPerUnit}
                textAnchor="middle"
                strokeWidth={4 / pixelsPerUnit}
              >
                {label?.text ?? node.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className={`type-caption ${styles.canvasHint}`}>
        Drag to pan. Arrow keys move between locations.
      </p>
    </section>
  );
}
