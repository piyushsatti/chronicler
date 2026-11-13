import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { PointcrawlViewport } from '../../../src/features/map/components/PointcrawlViewport.js';
import { MapKey } from '../../../src/features/map/components/MapKey.js';
import nodeStateStyles from '../../../src/features/map/components/nodeState.module.css';
import { setNodeState } from '../../../src/features/map/adapters/mapAdapter.js';
import { nodeStateLabel, type NodeState } from '../../../src/features/map/nodeState.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/goodMap.js';
import member from '../../fixtures/wire/me/good.json';

const [gate, tower, river] = good.pointcrawlNodes as [
  (typeof good.pointcrawlNodes)[number],
  (typeof good.pointcrawlNodes)[number],
  (typeof good.pointcrawlNodes)[number],
];
const hexWire = { ...good, grid: 'hex' };
const hexMap = { ...hexWire, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };

/** Signs in with `roles` and serves a hex map whose node states the mutation can change. */
function serve(roles: string[], states: Record<string, NodeState> = {}) {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'A', exp: 4102444800 }))}.test`,
  );
  const calls: Record<string, unknown>[] = [];
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({ data: { memberMe: { ...member, roles } } }),
    ),
    graphql.query('MapAtlas', () =>
      HttpResponse.json({
        data: {
          map: {
            ...hexWire,
            canEdit: roles.includes('admin'),
            pointcrawlNodes: good.pointcrawlNodes.map((node) => ({
              ...node,
              state: states[node.id] ?? node.state,
            })),
          },
        },
      }),
    ),
    graphql.mutation('MapSetNodeState', ({ variables }) => {
      calls.push(variables);
      states[String(variables.nodeId)] = variables.state as NodeState;
      return HttpResponse.json({
        data: {
          setPointcrawlNodeState: { id: variables.nodeId, state: variables.state },
        },
      });
    }),
  );
  return calls;
}
function page(nodeId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/map/:atlasCode" element={<MapPage />} />
    </Routes>,
    { route: `/map/LFC?node=${nodeId}` },
  );
}

describe('hex state', () => {
  it('sends the node, the state and an idempotency key', async () => {
    const calls = serve(['admin']);
    await expect(setNodeState(hexMap.id, river.id, 'UNLOCKED', 'key-1')).resolves.toEqual({
      id: river.id,
      state: 'UNLOCKED',
    });
    expect(calls).toEqual([
      {
        mapId: hexMap.id,
        nodeId: river.id,
        state: 'UNLOCKED',
        meta: { idempotencyKey: 'key-1' },
      },
    ]);
  });

  it('lets an admin pick any state from the sidebar, including Unlocked straight to Locked', async () => {
    const calls = serve(['admin', 'player']);
    page(river.id);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    const control = await within(panel).findByRole('button', { name: /^Hex state/ });
    expect(control).toHaveTextContent('Locked');
    for (const to of ['Mapped', 'Unlocked', 'Locked'] as const) {
      await userEvent.click(control);
      await userEvent.click(await screen.findByRole('menuitem', { name: to }));
      await waitFor(() => expect(control).toHaveTextContent(to));
    }
    expect(calls.map((call) => call.state)).toEqual(['MAPPED', 'UNLOCKED', 'LOCKED']);
    expect(calls.every((call) => call.nodeId === river.id && call.mapId === hexMap.id)).toBe(
      true,
    );
    const keys = calls.map(
      (call) => (call.meta as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys).size).toBe(3);
  });

  it('sends nothing when an admin picks the current state', async () => {
    const calls = serve(['admin']);
    page(river.id);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    await userEvent.click(await within(panel).findByRole('button', { name: /^Hex state/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Locked' }));
    expect(calls).toHaveLength(0);
  });

  it('refreshes neighbouring hex states after mapping a hex', async () => {
    const states: Record<string, NodeState> = {
      [gate.id]: 'LOCKED',
      [river.id]: 'UNLOCKED',
    };
    serve(['admin'], states);
    server.use(
      graphql.mutation('MapSetNodeState', ({ variables }) => {
        states[river.id] = 'MAPPED';
        states[gate.id] = 'UNLOCKED';
        return HttpResponse.json({
          data: { setPointcrawlNodeState: { id: variables.nodeId, state: 'MAPPED' } },
        });
      }),
    );
    page(river.id);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    await userEvent.click(await within(panel).findByRole('button', { name: /^Hex state/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mapped' }));
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    await waitFor(() => {
      expect(within(graph).getByRole('button', { name: `${river.name}, Mapped` })).toBeVisible();
      expect(within(graph).getByRole('button', { name: `${gate.name}, Unlocked` })).toBeVisible();
    });
  });

  it.each([
    ['player', ['player']],
    ['DM', ['dm', 'player']],
  ])('shows the state to a %s without the control', async (_, roles) => {
    const calls = serve(roles);
    page(tower.id);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    expect(within(panel).getByText('Hex state')).toBeVisible();
    expect(within(panel).getByText('Mapped')).toBeVisible();
    expect(within(panel).queryByRole('button', { name: /^Hex state/ })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('keeps hex state off point maps', async () => {
    serve(['admin']);
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({ data: { map: { ...good, canEdit: true } } }),
      ),
    );
    page(gate.id);
    const panel = await screen.findByRole('region', { name: 'Selected location' });
    expect(within(panel).queryByText('Hex state')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Hex state/ })).toBeNull();
  });

  it('draws each hex in its state and explains the states in the key', async () => {
    const { container } = render(
      <PointcrawlViewport map={hexMap} selectedId={null} onSelect={vi.fn()} />,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    for (const node of [gate, tower, river]) {
      const target = within(graph).getByRole('button', {
        name: `${node.name}, ${nodeStateLabel(node.state)}`,
      });
      expect(target).toHaveAttribute('data-node-state', node.state);
      expect(target.querySelector('[data-node-state]')).toHaveAttribute(
        'data-node-state',
        node.state,
      );
    }
    // Locked is hatched (a pattern fill), not only a different colour.
    const lockedCell = within(graph)
      .getByRole('button', { name: `${river.name}, Locked` })
      .querySelector('polygon[data-node-state="LOCKED"]');
    expect(lockedCell?.getAttribute('fill')).toMatch(/^url\(#.+-locked\)$/);
    expect(container.querySelector(lockedCell!.getAttribute('fill')!.slice(4, -1))).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Key to hex states' }));
    const key = screen.getByRole('list', { name: 'Hex states' });
    expect(within(key).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Locked: not yet open to play',
      'Unlocked: open to play',
      'Mapped: explored and charted',
    ]);
  });

  it('draws mapped hexes without an outline or tint, like unlocked hexes', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/features/map/components/nodeState.module.css'),
      'utf8',
    ).replace(/\.([A-Za-z]\w*)/g, (_selector: string, name: string) =>
      `.${nodeStateStyles[name] ?? name}`,
    );
    render(
      <>
        <style>{css}</style>
        <PointcrawlViewport map={hexMap} selectedId={null} onSelect={vi.fn()} />
      </>,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    const mapped = graph.querySelector('polygon[data-node-state="MAPPED"]');
    const unlocked = graph.querySelector('polygon[data-node-state="UNLOCKED"]');
    expect(mapped).not.toBeNull();
    expect(unlocked).not.toBeNull();
    if (!mapped || !unlocked) throw new Error('Both hex states must be drawn');
    for (const cell of [mapped, unlocked]) {
      const style = getComputedStyle(cell);
      expect(style.stroke).toBe('none');
      expect(style.fill).toBe('none');
    }
  });

  it('names each hex with its state for screen readers, but not point-map pins', () => {
    const { unmount } = render(
      <PointcrawlViewport map={hexMap} selectedId={null} onSelect={vi.fn()} />,
    );
    const hexGraph = screen.getByRole('group', { name: 'Lightfall map' });
    expect(within(hexGraph).getByRole('button', { name: 'River Crossing, Locked' })).toBeVisible();
    expect(within(hexGraph).getByRole('button', { name: 'Lightfall Gate, Unlocked' })).toBeVisible();
    expect(within(hexGraph).getByRole('button', { name: 'Old Watchtower, Mapped' })).toBeVisible();
    unmount();
    const point = { ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };
    render(<PointcrawlViewport map={point} selectedId={null} onSelect={vi.fn()} />);
    const pointGraph = screen.getByRole('group', { name: 'Lightfall map' });
    expect(within(pointGraph).getByRole('button', { name: 'River Crossing' })).toBeVisible();
    expect(within(pointGraph).queryByRole('button', { name: /Locked|Unlocked|Mapped/ })).toBeNull();
  });

  it('leaves point-map pins and the route key unchanged', () => {
    const point = { ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };
    render(<PointcrawlViewport map={point} selectedId={null} onSelect={vi.fn()} />);
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    expect(graph.querySelector('[data-node-state]')).toBeNull();
    render(<MapKey edges={good.pointcrawlEdges} />);
    expect(screen.queryByRole('list', { name: 'Hex states' })).toBeNull();
  });
});
