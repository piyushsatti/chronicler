import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import {
  flatTopHexagon,
  hoverRadii,
  isHexMap,
  MAP_ROUTES_STORAGE_KEY,
  placeAt,
  PointcrawlViewport,
} from '../../../src/features/map/components/PointcrawlViewport.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/good.json';

const [gate, tower, river] = good.pointcrawlNodes as [
  (typeof good.pointcrawlNodes)[number],
  (typeof good.pointcrawlNodes)[number],
  (typeof good.pointcrawlNodes)[number],
];
const map = { ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };

/**
 * With no measured size the fitted viewBox is `40 -80 400 260`; a 400x260 client rect
 * at the origin maps client (x, y) to graph (x + 40, y - 80).
 */
function viewport(selectedId: string | null = null) {
  const onSelect = vi.fn();
  const onClear = vi.fn();
  const view = render(
    <PointcrawlViewport
      map={map}
      selectedId={selectedId}
      onSelect={onSelect}
      onClear={onClear}
    />,
  );
  const graph = screen.getByRole('group', { name: 'Lightfall pointcrawl graph' });
  expect(graph).toHaveAttribute('viewBox', '40 -80 400 260');
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 260));
  Object.defineProperty(graph, 'setPointerCapture', { value: vi.fn() });
  const at = (x: number, y: number) => ({ clientX: x - 40, clientY: y + 80 });
  const pointer = (type: string, x: number, y: number, target: Element = graph) => {
    const event = new MouseEvent(type, { bubbles: true, ...at(x, y) });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(target, event);
  };
  const ring = (kind: 'hover' | 'selected') =>
    graph.querySelector(`[data-map-ring="${kind}"]`);
  return { view, graph, onSelect, onClear, at, pointer, ring };
}

afterEach(() => vi.restoreAllMocks());

describe('hex hit areas', () => {
  it('gives each place of a flat-top hex grid exactly its own hex cell', () => {
    const size = 60;
    const hex = (q: number, r: number, id: string) => ({
      id,
      x: size * 1.5 * q,
      y: size * Math.sqrt(3) * (r + q / 2),
    });
    const nodes = [hex(0, 0, 'centre'), hex(0, -1, 'north'), hex(1, -1, 'northeast')];
    const radii = hoverRadii(nodes, 5);
    expect(radii.get('centre')).toBeCloseTo(size);
    expect(placeAt(nodes, radii, { x: 40, y: -10 })).toBe('centre');
    expect(placeAt(nodes, radii, { x: 50, y: -30 })).toBe('northeast');
    expect(placeAt(nodes, radii, { x: 0, y: -100 })).toBe('north');
    expect(placeAt(nodes, radii, { x: -200, y: 200 })).toBeNull();
    expect(hoverRadii([{ id: 'alone', x: 0, y: 0 }], 17).get('alone')).toBe(17);
  });
});

describe('Pointcrawl hover and selection', () => {
  it('draws no pin numbers and no ring until the pointer is over a place', () => {
    const { graph, ring } = viewport();
    for (const node of [gate, tower, river])
      expect(
        within(graph).getByRole('button', { name: node.name }),
      ).not.toHaveTextContent(/^\d+$/);
    expect(graph.textContent).not.toMatch(/\b0[1-3]\b/);
    expect(ring('hover')).toBeNull();
    expect(ring('selected')).toBeNull();
    expect(graph.querySelector('[data-map-place-number]')).toBeNull();
  });

  it('moves the hover ring and the place number with the cursor from place to place', () => {
    const { graph, pointer, ring } = viewport();
    // Inside the gate's cell but off its pin.
    pointer('pointermove', gate.x + 30, gate.y);
    expect(ring('hover')).toHaveAttribute('data-ring-node-id', gate.id);
    expect(ring('hover')).toHaveAttribute(
      'transform',
      `translate(${gate.x} ${gate.y})`,
    );
    expect(graph.querySelector('[data-map-place-number]')).toHaveTextContent(gate.name);
    pointer('pointermove', river.x - 20, river.y + 10);
    expect(ring('hover')).toHaveAttribute('data-ring-node-id', river.id);
    expect(graph.querySelector('[data-map-place-number]')).toHaveTextContent(
      river.name,
    );
    // Over the pin itself.
    pointer(
      'pointermove',
      tower.x,
      tower.y,
      within(graph).getByRole('button', { name: tower.name }),
    );
    expect(ring('hover')).toHaveAttribute('data-ring-node-id', tower.id);
    // Between places, then off the map.
    pointer('pointermove', 240, 100);
    expect(ring('hover')).toBeNull();
    pointer('pointermove', gate.x, gate.y);
    fireEvent.pointerLeave(graph);
    expect(ring('hover')).toBeNull();
  });

  it('keeps the ring and number on the selected place while hover moves elsewhere', () => {
    const { graph, pointer, ring } = viewport(gate.id);
    expect(ring('selected')).toHaveAttribute('data-ring-node-id', gate.id);
    expect(
      graph.querySelector(`[data-map-place-number="${gate.id}"]`),
    ).toHaveTextContent(gate.name);
    const pin = within(graph).getByRole('button', { name: gate.name });
    expect(pin.querySelector('text')).toHaveAttribute('visibility', 'hidden');
    pointer('pointermove', river.x, river.y);
    expect(ring('selected')).toHaveAttribute('data-ring-node-id', gate.id);
    expect(ring('hover')).toHaveAttribute('data-ring-node-id', river.id);
    pointer('pointermove', gate.x, gate.y);
    expect(ring('hover')).toBeNull();
    expect(graph.querySelectorAll('[data-map-ring]')).toHaveLength(1);
  });

  it('selects the place under a click, clears on empty space, and ignores drags', () => {
    const { graph, onSelect, onClear, at, pointer } = viewport();
    pointer('pointerdown', gate.x + 30, gate.y);
    pointer('pointerup', gate.x + 30, gate.y);
    fireEvent.click(graph, at(gate.x + 30, gate.y));
    expect(onSelect).toHaveBeenCalledWith(gate.id);
    pointer('pointerdown', 240, 100);
    pointer('pointerup', 240, 100);
    fireEvent.click(graph, at(240, 100));
    expect(onClear).toHaveBeenCalledOnce();
    onSelect.mockClear();
    pointer('pointerdown', 240, 100);
    pointer('pointermove', 300, 140);
    pointer('pointerup', 300, 140);
    fireEvent.click(graph, at(river.x, river.y));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledOnce();
    fireEvent.click(within(graph).getByRole('button', { name: tower.name }));
    expect(onSelect).toHaveBeenCalledWith(tower.id);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('makes every place a Tab stop opened by Enter or Space, with no arrow-key traversal', () => {
    const { graph, onSelect } = viewport(tower.id);
    const pins = within(graph).getAllByRole('button');
    expect(pins.map((pin) => pin.getAttribute('tabindex'))).toEqual(['0', '0', '0']);
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ])
      fireEvent.keyDown(pins[1]!, { key });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(pins[2]!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(river.id);
    fireEvent.keyDown(pins[0]!, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith(gate.id);
    expect(screen.getByText(/press Escape to clear/)).toBeVisible();
    expect(graph.querySelector('title')?.textContent).not.toMatch(/arrow/i);
  });
});

describe('MapPage selection clearing', () => {
  it('clears the selected place when empty map is clicked', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/map/:atlasCode" element={<MapPage />} />
      </Routes>,
      { route: `/map/LFC?node=${gate.id}` },
    );
    const graph = await screen.findByRole('group', {
      name: 'Lightfall pointcrawl graph',
    });
    expect(
      await screen.findByRole('region', { name: 'Selected location' }),
    ).toHaveTextContent(gate.name);
    const rect = graph.getBoundingClientRect.bind(graph);
    vi.spyOn(graph, 'getBoundingClientRect').mockImplementation(() => {
      const viewBox = graph.getAttribute('viewBox')!.split(' ').map(Number);
      return viewBox[2] ? new DOMRect(0, 0, viewBox[2], viewBox[3]) : rect();
    });
    Object.defineProperty(graph, 'setPointerCapture', { value: vi.fn() });
    const [x0, y0] = graph.getAttribute('viewBox')!.split(' ').map(Number) as [
      number,
      number,
    ];
    const empty = { clientX: 240 - x0, clientY: 100 - y0 };
    const down = new MouseEvent('pointerdown', { bubbles: true, ...empty });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    fireEvent(graph, down);
    fireEvent.click(graph, empty);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull(),
    );
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
    expect(graph.querySelector('[data-map-ring="selected"]')).toBeNull();
  });
});

describe('Route lines toggle', () => {
  const routes = () =>
    screen
      .getByRole('group', { name: 'Lightfall pointcrawl graph' })
      .querySelectorAll('[data-edge-kind]');
  it('hides route lines and their key by default and shows them on request, remembering the choice', () => {
    const view = render(
      <PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />,
    );
    const toggle = screen.getByRole('checkbox', { name: 'Show routes' });
    expect(toggle).not.toBeChecked();
    expect(routes()).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: 'Key to route line styles' }),
    ).toBeNull();
    // The count line leaves out routes while they are hidden.
    expect(screen.getByText('3 places')).toBeVisible();
    expect(screen.queryByText(/places · /)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText('3 places · 1 route')).toBeVisible();
    expect(routes()).toHaveLength(map.edges.length);
    expect(
      screen.getByRole('button', { name: 'Key to route line styles' }),
    ).toBeVisible();
    expect(localStorage.getItem(MAP_ROUTES_STORAGE_KEY)).toBe('true');
    view.unmount();
    render(<PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Show routes' })).toBeChecked();
    expect(routes()).toHaveLength(map.edges.length);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show routes' }));
    expect(routes()).toHaveLength(0);
    expect(localStorage.getItem(MAP_ROUTES_STORAGE_KEY)).toBe('false');
  });

  it('still toggles when storage is unavailable', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />);
    expect(routes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show routes' }));
    expect(routes()).toHaveLength(map.edges.length);
  });

  it('offers no toggle on a map without routes', () => {
    render(
      <PointcrawlViewport
        map={{ ...map, edges: [] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: 'Show routes' })).toBeNull();
  });
});

describe('Hex maps', () => {
  const size = 60;
  const at = (q: number, r: number) => ({
    x: size * 1.5 * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  });
  const codes = ['LFC1001', 'LFC1101', 'LFC1102'];
  const hexNodes = [at(0, 0), at(0, -1), at(1, -1)].map((point, index) => ({
    ...good.pointcrawlNodes[index]!,
    name: codes[index]!,
    ...point,
  }));
  const hexEdges = [
    [0, 1],
    [0, 2],
    [1, 2],
  ].map(([a, b], index) => ({
    ...good.pointcrawlEdges[0]!,
    id: `hex-${index}`,
    nodeA: hexNodes[a!]!.id,
    nodeB: hexNodes[b!]!.id,
    kind: 'hex',
    directed: false,
    label: null,
  }));
  const hexMap = {
    ...map,
    name: 'Lightfall Hexflower',
    nodes: hexNodes,
    edges: hexEdges,
  };
  const graph = () =>
    screen.getByRole('group', { name: 'Lightfall Hexflower pointcrawl graph' });

  it('identifies hex maps by hex adjacency routes only', () => {
    expect(isHexMap(hexMap)).toBe(true);
    expect(isHexMap(map)).toBe(false);
    expect(isHexMap({ edges: [] })).toBe(false);
  });

  it('draws flat-topped hexagons', () => {
    const corners = flatTopHexagon(60)
      .split(' ')
      .map((pair) => pair.split(',').map(Number) as [number, number]);
    expect(corners).toHaveLength(6);
    // A vertex on each side at mid-height and a flat top edge.
    expect(corners[0]![0]).toBeCloseTo(60);
    expect(corners[0]![1]).toBeCloseTo(0);
    expect(corners[3]![0]).toBeCloseTo(-60);
    expect(corners[4]![1]).toBeCloseTo(corners[5]![1]);
    expect(corners[4]![1]).toBeCloseTo((-60 * Math.sqrt(3)) / 2);
  });

  it('outlines each hex cell, rings the hovered and selected hex as a hexagon, and shows codes only there', () => {
    render(
      <PointcrawlViewport
        map={hexMap}
        selectedId={hexNodes[0]!.id}
        onSelect={vi.fn()}
      />,
    );
    const cells = graph().querySelectorAll('[data-hex-cell]');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveAttribute('points', flatTopHexagon(size));
    expect(cells[1]).toHaveAttribute(
      'transform',
      `translate(${hexNodes[1]!.x} ${hexNodes[1]!.y})`,
    );
    // No always-on codes.
    for (const label of graph().querySelectorAll('g[role="button"] text'))
      expect(label).toHaveAttribute('visibility', 'hidden');
    const selected = graph().querySelector('[data-map-ring="selected"]')!;
    expect(selected.querySelector('circle')).toBeNull();
    expect(selected.querySelector('polygon')).toHaveAttribute(
      'points',
      flatTopHexagon(size),
    );
    expect(graph().querySelector('[data-map-place-number]')).toHaveTextContent(
      'LFC1001',
    );
    fireEvent.pointerMove(within(graph()).getByRole('button', { name: 'LFC1102' }));
    const hover = graph().querySelector('[data-map-ring="hover"]')!;
    expect(hover.querySelector('polygon')).not.toBeNull();
    expect(
      [...graph().querySelectorAll('[data-map-place-number]')].map(
        (text) => text.textContent,
      ),
    ).toEqual(['LFC1001', 'LFC1102']);
  });

  it('leaves ordinary pointcrawl maps without hex outlines and with circular rings', () => {
    render(<PointcrawlViewport map={map} selectedId={gate.id} onSelect={vi.fn()} />);
    const ordinary = screen.getByRole('group', { name: 'Lightfall pointcrawl graph' });
    expect(ordinary.querySelector('[data-hex-cell]')).toBeNull();
    expect(ordinary.querySelector('[data-map-ring="selected"] circle')).not.toBeNull();
    const labels = [...ordinary.querySelectorAll('g[role="button"] text')];
    expect(labels.some((label) => !label.hasAttribute('visibility'))).toBe(true);
  });
});

describe('Hex map review fixes', () => {
  const size = 60;
  const at = (q: number, r: number) => ({
    x: size * 1.5 * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  });
  const cells = [at(0, 0), at(0, -1), at(1, -1), at(1, 0)];
  const hexNodes = cells.map((point, index) => ({
    ...good.pointcrawlNodes[index % 3]!,
    id: `bbbbbbbb-bbbb-4bbb-8bbb-00000000010${index}`,
    name: `LFC10${index}`,
    ...point,
  }));
  const hexMap = {
    ...map,
    name: 'Hexflower',
    nodes: hexNodes,
    edges: [
      {
        ...good.pointcrawlEdges[0]!,
        id: 'hex-0',
        nodeA: hexNodes[0]!.id,
        nodeB: hexNodes[1]!.id,
        kind: 'hex',
        directed: false,
        label: null,
      },
    ],
  };
  const graph = (name = 'Hexflower') =>
    screen.getByRole('group', { name: `${name} pointcrawl graph` });

  it('uses one cell radius from the median spacing, so isolated tiles are not oversized', () => {
    const nodes = [...cells, { x: 1000, y: 1000 }].map((point, index) => ({
      id: `n${index}`,
      ...point,
    }));
    const uniform = hoverRadii(nodes, 5, true);
    for (const radius of uniform.values()) expect(radius).toBeCloseTo(size);
    // Per-node radii would give the isolated tile a huge cell.
    expect(hoverRadii(nodes, 5).get('n4')!).toBeGreaterThan(500);
    expect(hoverRadii([{ id: 'alone', x: 0, y: 0 }], 17, true).get('alone')).toBe(17);
  });

  it('draws no pins on hex maps: each place is its whole hex cell, ringed in white', () => {
    render(
      <PointcrawlViewport map={hexMap} selectedId={hexNodes[0]!.id} onSelect={vi.fn()} />,
    );
    for (const place of within(graph()).getAllByRole('button')) {
      expect(place.querySelector('circle')).toBeNull();
      expect(place.querySelector('path')).toBeNull();
      expect(place.querySelector('polygon')).toHaveAttribute('points', flatTopHexagon(size));
    }
    const ring = graph().querySelector('[data-map-ring="selected"] polygon')!;
    expect(ring.getAttribute('class')).toMatch(/hexRing/);
  });

  it('hides the hex outlines when the map has painted art underneath', () => {
    render(
      <PointcrawlViewport
        map={{ ...hexMap, assetPath: 'maps/DRK/v1/hexmap-master.png' }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(graph().querySelector('image')).toHaveAttribute(
      'href',
      '/maps/DRK/v1/hexmap-master.png',
    );
    expect(graph().querySelector('[data-hex-cell]')).toBeNull();
    expect(within(graph()).getAllByRole('button')).toHaveLength(hexNodes.length);
  });

  it('does not stretch hex maps vertically, so the hexes tile; ordinary maps still stretch', () => {
    class TallObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: new DOMRect(0, 0, 400, 1000),
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', TallObserver);
    try {
      const view = render(
        <PointcrawlViewport map={hexMap} selectedId={null} onSelect={vi.fn()} />,
      );
      const north = graph().querySelector(`[data-hex-cell="${hexNodes[1]!.id}"]`);
      expect(north).toHaveAttribute(
        'transform',
        `translate(${hexNodes[1]!.x} ${hexNodes[1]!.y})`,
      );
      view.unmount();
      render(<PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />);
      expect(
        within(graph('Lightfall')).getByRole('button', { name: gate.name }),
      ).not.toHaveAttribute('transform', `translate(${gate.x} ${gate.y})`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the ring and code of a keyboard-focused hex and clears them on blur', () => {
    render(<PointcrawlViewport map={hexMap} selectedId={null} onSelect={vi.fn()} />);
    const pin = within(graph()).getByRole('button', { name: 'LFC102' });
    expect(graph().querySelector('[data-map-ring]')).toBeNull();
    fireEvent.focus(pin);
    expect(graph().querySelector('[data-map-ring="hover"]')).toHaveAttribute(
      'data-ring-node-id',
      hexNodes[2]!.id,
    );
    expect(graph().querySelector('[data-map-place-number]')).toHaveTextContent(
      'LFC102',
    );
    fireEvent.blur(pin);
    expect(graph().querySelector('[data-map-ring]')).toBeNull();
    expect(graph().querySelector('[data-map-place-number]')).toBeNull();
  });
});
