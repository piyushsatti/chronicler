import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { PointcrawlViewport } from '../../../src/features/map/components/PointcrawlViewport.js';
import {
  countPlaces,
  isHexMap,
  mapKindLabel,
  placeWords,
} from '../../../src/features/map/mapWords.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/good.json';
import member from '../../fixtures/wire/me/good.json';

const first = good.pointcrawlNodes[0]!;
const map = { ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges };

function signIn(canEdit: boolean) {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'A', exp: 4102444800 }))}.test`,
  );
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({
        data: { memberMe: { ...member, roles: ['archon', 'player'] } },
      }),
    ),
    graphql.query('MapAtlas', () =>
      HttpResponse.json({ data: { map: { ...good, canEdit } } }),
    ),
  );
}
function page(route = '/map/LFC') {
  return renderWithProviders(
    <Routes>
      <Route path="/map/:atlasCode" element={<MapPage />} />
    </Routes>,
    { route },
  );
}
function sizedGraph() {
  const graph = screen.getByRole('group', { name: 'Lightfall map' });
  graph.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return graph;
}
function pointerMove(graph: Element, x: number, y: number) {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(graph, event);
}

describe('M4-16 hexes are hexes, locations are locations', () => {
  const hexMap = { ...map, grid: 'hex' };
  it('names places by the kind of map', () => {
    expect(placeWords(map).one).toBe('location');
    expect(placeWords(hexMap).many).toBe('hexes');
    expect(countPlaces(hexMap, 1)).toBe('1 hex');
    expect(countPlaces(hexMap, 12)).toBe('12 hexes');
    expect(countPlaces(map, 3)).toBe('3 locations');
    expect(mapKindLabel(hexMap)).toBe('Hex map');
    expect(mapKindLabel(map)).toBe('Point map');
    // Hex adjacency routes still mark a hex map for maps created before the grid field.
    expect(isHexMap({ grid: 'point', edges: [{ kind: 'hex' }] })).toBe(true);
  });

  it('says hexes in the toolbar, the empty canvas and the hint on a hex map', () => {
    render(
      <PointcrawlViewport
        map={{ ...hexMap, nodes: [], edges: [] }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('0 hexes')).toBeVisible();
    expect(screen.getByText('No hexes have been added yet.')).toBeVisible();
    expect(screen.getByText(/Click a hex to explore it/)).toBeVisible();
    expect(screen.queryByText(/location/i)).toBeNull();
  });

  it('calls the selected hex a hex in the side panel and the list', async () => {
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({ data: { map: { ...hexMap, canEdit: true } } }),
      ),
    );
    page(`/map/LFC?node=${first.id}`);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    expect(within(panel).getByRole('button', { name: 'Close hex details' })).toBeVisible();
    expect(within(panel).getByText('No Codex entries are linked to this hex yet.')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Edit hex' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add hex' })).toBeVisible();
    expect(screen.getByLabelText('Map hexes', { selector: 'section' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull();
  });
});

describe('M4-02 a hex holds many Locations', () => {
  const location = (n: number) => ({
    id: `eeeeeeee-eeee-4eee-8eee-00000000000${n}`,
    slug: `harbor-${n}`,
    kind: 'codex_entry',
    category: 'Locations',
    title: `Harbor ${n}`,
    effectiveBody: `Description of harbor ${n}.`,
  });
  const entries = [1, 2].map((n) => ({
    mapId: good.id,
    nodeId: first.id,
    documentId: location(n).id,
    relation: 'location',
    createdAt: good.createdAt,
    createdBy: good.id,
  }));
  function serve(canEdit: boolean) {
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({
          data: {
            map: {
              ...good,
              grid: 'hex',
              canEdit,
              pointcrawlNodes: [
                { ...first, linkedEntries: entries },
                ...good.pointcrawlNodes.slice(1),
              ],
            },
          },
        }),
      ),
      graphql.query('MapDocuments', () =>
        HttpResponse.json({
          data: {
            document0: location(1),
            document1: location(2),
            document2: null,
            document3: null,
            document4: null,
          },
        }),
      ),
    );
  }

  it('lists every linked Location by title and description, and still offers Link a Location', async () => {
    serve(true);
    page(`/map/LFC?node=${first.id}`);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    expect(await within(panel).findByRole('link', { name: 'Harbor 1' })).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Harbor 2' })).toBeVisible();
    expect(within(panel).getByText('Description of harbor 1.')).toBeVisible();
    expect(within(panel).getByText('Description of harbor 2.')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Link a Location' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Unlink Harbor 1' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Unlink Harbor 2' })).toBeVisible();
  });

  it('offers no linking to readers', async () => {
    serve(false);
    page(`/map/LFC?node=${first.id}`);
    const panel = await screen.findByRole('region', { name: 'Selected hex' });
    expect(await within(panel).findByRole('link', { name: 'Harbor 1' })).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Link a Location' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Unlink/ })).toBeNull();
  });
});

describe('M4-19 Edit map', () => {
  it.each([true, false])('shows Edit map only to editors (canEdit=%s)', async (canEdit) => {
    signIn(canEdit);
    page();
    await screen.findByRole('group', { name: 'Lightfall map' });
    expect(Boolean(screen.queryByRole('button', { name: 'Edit map' }))).toBe(canEdit);
    if (canEdit) {
      fireEvent.click(screen.getByRole('button', { name: 'Edit map' }));
      expect(await screen.findByRole('dialog', { name: 'Edit map' })).toBeVisible();
    }
  });
});

describe('M4-20 cursor readout and right-click add', () => {
  it('shows the cursor x,y in the bottom-right of a point map and clears it on leave', () => {
    render(<PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />);
    const graph = sizedGraph();
    expect(screen.queryByLabelText('Cursor position on the map')).toBeNull();
    pointerMove(graph, 200, 150);
    const readout = screen.getByLabelText('Cursor position on the map');
    expect(readout).toHaveTextContent(/^x -?\d+(\.\d+)?, y -?\d+(\.\d+)?$/);
    const before = readout.textContent;
    pointerMove(graph, 300, 250);
    expect(screen.getByLabelText('Cursor position on the map').textContent).not.toBe(before);
    fireEvent.pointerLeave(graph);
    expect(screen.queryByLabelText('Cursor position on the map')).toBeNull();
  });

  it('does not show a coordinate readout on a hex map', () => {
    render(<PointcrawlViewport map={{ ...map, grid: 'hex' }} selectedId={null} onSelect={vi.fn()} />);
    pointerMove(sizedGraph(), 200, 150);
    expect(screen.queryByLabelText('Cursor position on the map')).toBeNull();
  });

  it('right-click on an empty spot asks to add a location at the cursor position', () => {
    const onAddAt = vi.fn();
    render(
      <PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} onAddAt={onAddAt} />,
    );
    const graph = sizedGraph();
    // The far corner is empty: every place sits well inside the map.
    const notPrevented = fireEvent.contextMenu(graph, { clientX: 2, clientY: 2 });
    expect(notPrevented).toBe(false);
    expect(onAddAt).toHaveBeenCalledTimes(1);
    const point = onAddAt.mock.calls[0]![0] as { x: number; y: number };
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    pointerMove(graph, 2, 2);
    expect(screen.getByLabelText('Cursor position on the map')).toHaveTextContent(
      `x ${point.x}, y ${point.y}`,
    );
  });

  it('leaves the browser menu alone on a pin, on a hex map, or when the viewer cannot edit', () => {
    const onAddAt = vi.fn();
    const { unmount } = render(
      <PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} onAddAt={onAddAt} />,
    );
    const pin = sizedGraph().querySelector(`[data-node-id="${first.id}"]`)!;
    expect(fireEvent.contextMenu(pin)).toBe(true);
    unmount();
    render(
      <PointcrawlViewport
        map={{ ...map, grid: 'hex' }}
        selectedId={null}
        onSelect={vi.fn()}
        onAddAt={onAddAt}
      />,
    );
    expect(fireEvent.contextMenu(sizedGraph(), { clientX: 2, clientY: 2 })).toBe(true);
    expect(onAddAt).not.toHaveBeenCalled();
  });

  it('opens the add-location form with x and y filled in from a right-click on the page', async () => {
    signIn(true);
    page();
    const graph = await screen.findByRole('group', { name: 'Lightfall map' });
    sizedGraph();
    fireEvent.contextMenu(graph, { clientX: 2, clientY: 2 });
    const dialog = await screen.findByRole('dialog', { name: 'Add location' });
    const x = within(dialog).getByRole('spinbutton', { name: 'X coordinate' });
    const y = within(dialog).getByRole('spinbutton', { name: 'Y coordinate' });
    expect((x as HTMLInputElement).value).not.toBe('0');
    expect((y as HTMLInputElement).value).not.toBe('0');
  });
});
