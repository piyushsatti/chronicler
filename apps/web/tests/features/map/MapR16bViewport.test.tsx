import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  MAP_ROUTES_STORAGE_KEY,
  PointcrawlViewport,
} from '../../../src/features/map/components/PointcrawlViewport.js';
import good from '../../fixtures/wire/map/good.json';

// These suites cover route drawing; routes are hidden by default, so opt in.
beforeEach(() => localStorage.setItem(MAP_ROUTES_STORAGE_KEY, 'true'));

const map = { ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };

describe('R16b route key availability', () => {
  it('omits the key and empty route-style list on a zero-route map', () => {
    render(
      <PointcrawlViewport
        map={{ ...map, edges: [] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Lightfall pointcrawl graph' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Key to route line styles' }),
    ).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Route line styles', hidden: true }),
    ).toBeNull();
  });

  it('lists exactly the populated map kinds and only includes One-way for directed routes', () => {
    const edges = ['road', 'trail', 'road'].map((kind, index) => ({
      ...good.pointcrawlEdges[0]!,
      id: `edge-${index}`,
      kind,
      directed: index === 1,
    }));
    const { rerender } = render(
      <PointcrawlViewport
        map={{ ...map, edges }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Key to route line styles' }));
    const names = () =>
      within(screen.getByRole('list', { name: 'Route line styles' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent);
    expect(names()).toEqual(['Road', 'Trail', 'One-way']);
    rerender(
      <PointcrawlViewport
        map={{ ...map, edges: edges.map((edge) => ({ ...edge, directed: false })) }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(names()).toEqual(['Road', 'Trail']);
  });

  it('keeps a route-crossed label centered below its own pin', () => {
    const start = good.pointcrawlNodes[0]!;
    const end = good.pointcrawlNodes[1]!;
    const neighbor = good.pointcrawlNodes[2]!;
    const nodes = [
      { ...start, name: 'Anchor', x: 100, y: 100 },
      { ...end, name: 'Below neighbor', x: 140, y: 180 },
      { ...neighbor, name: 'Far neighbor', x: 360, y: 100 },
    ];
    const edge = {
      ...good.pointcrawlEdges[0]!,
      nodeA: start.id,
      nodeB: end.id,
    };
    render(
      <PointcrawlViewport
        map={{ ...map, nodes, edges: [edge] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall pointcrawl graph' });
    const anchor = graph.querySelector(`[data-node-id="${start.id}"]`);
    const plate = anchor?.querySelector('rect');
    const label = anchor?.querySelector('text:last-child');
    expect(label).toHaveTextContent('Anchor');
    expect(label).toHaveAttribute('x', '0');
    expect(label).toHaveAttribute('y', '41');

    const x = Number(plate?.getAttribute('x'));
    const width = Number(plate?.getAttribute('width'));
    const lineXAtPlateTop = ((27 / 80) * 40);
    expect(lineXAtPlateTop).toBeGreaterThan(x);
    expect(lineXAtPlateTop).toBeLessThan(x + width);
  });
});
