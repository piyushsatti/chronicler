import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { MapSketch } from '../../../src/features/map/components/MapDirectory.js';
import {
  MAP_ROUTES_STORAGE_KEY,
  PointcrawlViewport,
} from '../../../src/features/map/components/PointcrawlViewport.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/goodMap.js';

// These suites cover route drawing; routes are hidden by default, so opt in.
beforeEach(() => localStorage.setItem(MAP_ROUTES_STORAGE_KEY, 'true'));

const first = good.pointcrawlNodes[0]!;
const pointcrawl = {
  ...good,
  nodes: good.pointcrawlNodes,
  edges: good.pointcrawlEdges,
};
const region = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Coast',
  kind: 'charter',
  canCreateMap: false,
  charterDeadline: null,
  documentId: null,
  createdAt: good.createdAt,
};
function page(route = '/map/LFC') {
  return renderWithProviders(
    <Routes>
      <Route path="/map" element={<MapPage />} />
      <Route path="/map/:atlasCode" element={<MapPage />} />
    </Routes>,
    { route },
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('B2 directory', () => {
  it('keeps the directory distinct from an atlas, searches real maps, and never guesses QA visibility from names', async () => {
    const qa = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      atlasCode: 'QA',
      name: 'QA temporary-looking map',
      regionId: region.id,
      pointcrawlNodes: [],
      pointcrawlEdges: [],
    };
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [good, qa], regions: [region] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) =>
        HttpResponse.json({ data: { map: variables.atlasCode === 'QA' ? qa : good } }),
      ),
    );
    page('/map');
    expect(await screen.findByRole('heading', { name: 'Map', level: 1 })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Map viewport' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'All maps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByText('3 locations')).toBeVisible();
    expect(await screen.findByText('No locations have been added yet.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /QA temporary-looking map/ }),
    ).toHaveAttribute('href', '/map/QA');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Search maps' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search maps' }), 'Coast');
    expect(screen.getByText('1 map')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Lightfall/ })).toBeNull();
    expect(
      within(screen.getByRole('toolbar', { name: 'Map region filters' }))
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['All maps', 'Coast']);
    await user.clear(screen.getByRole('searchbox', { name: 'Search maps' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search maps' }), 'nothing');
    expect(screen.getByText('0 maps')).toBeVisible();
    expect(
      screen.getByText('No maps match this search. Try a different name or region.'),
    ).toBeVisible();
  });

  it('draws the route sketch from the actual coordinates and endpoint identities', () => {
    const nodes = [
      { ...first, x: -340, y: 620 },
      { ...good.pointcrawlNodes[1]!, x: 900, y: -150 },
    ];
    const { container } = render(<MapSketch map={{ ...pointcrawl, nodes }} />);
    expect(container.querySelector('line')).toHaveAttribute('x1', '-340');
    expect(container.querySelector('line')).toHaveAttribute('y1', '620');
    expect(container.querySelector('line')).toHaveAttribute('x2', '900');
    expect(container.querySelector('line')).toHaveAttribute('y2', '-150');
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelector('circle')).toHaveAttribute('cx', '-340');
    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '-420 -230 1400 930',
    );
  });

  it('shows a read failure rather than a false empty-map count', async () => {
    server.use(
      graphql.query('MapAtlas', () => HttpResponse.json({ data: { map: null } })),
    );
    page('/map');
    expect(await screen.findByText('This map could not load.')).toBeVisible();
    expect(screen.queryByText('No locations have been added yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry Lightfall' })).toBeVisible();
  });
});

describe('B2 atlas', () => {
  it('renders unnumbered pins at unscaled coordinates, all real edge kinds, arrows, present labels, and a data-only legend', () => {
    const kinds = ['road', 'trail', 'river', 'pass'];
    const map = {
      ...pointcrawl,
      nodes: pointcrawl.nodes.map((node, index) => ({
        ...node,
        x: 1200 + index * 200,
      })),
      edges: kinds.map((kind, index) => ({
        ...good.pointcrawlEdges[0]!,
        id: `edge-${index}`,
        kind,
        directed: index === 0,
        label: `Route ${index + 1}`,
      })),
    };
    render(<PointcrawlViewport map={map} selectedId={null} onSelect={vi.fn()} />);
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    const pin = within(graph).getByRole('button', { name: first.name });
    expect(pin).toHaveAttribute('transform', 'translate(1200 100)');
    // Owner feedback: no always-on pin numbers.
    expect(pin).not.toHaveTextContent('01');
    expect(graph.querySelector('[data-map-ring]')).toBeNull();
    expect(pin.querySelector('rect')).not.toBeNull();
    const arrow = graph.querySelector('marker');
    expect(Number(arrow?.getAttribute('refX')) - 10).toBeGreaterThan(25);
    kinds.forEach((kind, index) => {
      const edge = graph.querySelector(`[data-edge-kind="${kind}"]`);
      expect(edge?.querySelector('polyline')).not.toBeNull();
      expect(edge).toHaveTextContent(`Route ${index + 1}`);
      expect(edge?.querySelector('polyline')?.hasAttribute('marker-end')).toBe(
        index === 0,
      );
    });
    const key = screen.getByRole('button', { name: 'Key to route line styles' });
    expect(key).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(key);
    const legend = screen.getByRole('list', { name: 'Route line styles' });
    for (const label of ['Road', 'Trail', 'River', 'Pass', 'One-way'])
      expect(within(legend).getByText(label)).toBeVisible();
    expect(within(legend).queryByText('Path')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Map legend' })).toBeNull();
    expect(graph.querySelector('image')).toBeNull();
  });

  it.each([
    { label: null, painted: false },
    { label: '', painted: false },
    { label: '   ', painted: false },
    { label: 'leg-7', painted: false },
    { label: '  LEG_7  ', painted: false },
    { label: 'North trail', painted: true },
    { label: 'Route 1', painted: true },
    { label: '  Old river crossing  ', painted: true },
  ])(
    'paints only authored edge labels ($label) and preserves route descriptions',
    ({ label, painted }) => {
      render(
        <PointcrawlViewport
          map={{
            ...pointcrawl,
            edges: [
              {
                ...good.pointcrawlEdges[0]!,
                kind: 'river_ford',
                directed: true,
                label,
              },
            ],
          }}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      );
      const graph = screen.getByRole('group', { name: 'Lightfall map' });
      const edge = graph.querySelector('[data-edge-kind="river_ford"]');
      if (painted) expect(edge?.querySelector('text')?.textContent).toBe(label);
      else expect(edge?.querySelector('text')).toBeNull();
      expect(edge?.querySelector('title')?.textContent).toBe(
        `${painted ? label?.trim() : 'River ford'} (one way)`,
      );
    },
  );

  it('keeps the region panel present until a real node is selected and supports Tab and Enter selection with Escape focus return', async () => {
    page();
    const graph = await screen.findByRole('group', {
      name: 'Lightfall map',
    });
    expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
    fireEvent.keyDown(within(graph).getByRole('button', { name: first.name }), {
      key: 'Enter',
    });
    expect(
      await screen.findByRole('region', { name: 'Selected location' }),
    ).toHaveTextContent(first.name);
    expect(screen.getByRole('button', { name: 'Close location details' })).toHaveFocus();
    // Arrow keys no longer move between places, from the panel or from a pin.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      first.name,
    );
    fireEvent.keyDown(within(graph).getByRole('button', { name: 'River Crossing' }), {
      key: ' ',
    });
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      'River Crossing',
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
    expect(within(graph).getByRole('button', { name: 'River Crossing' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull();
    fireEvent.keyDown(within(graph).getByRole('button', { name: 'Old Watchtower' }), {
      key: 'Enter',
    });
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      'Old Watchtower',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close location details' }));
    expect(within(graph).getByRole('button', { name: 'Old Watchtower' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Selected location' })).toBeNull();
  });

  it('uses the location document description, lists only real linked documents by title and description, and links an actual submap', async () => {
    const location = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'real-location',
      kind: 'codex_entry',
      category: 'Location',
      title: 'Actual place',
      effectiveBody: 'The real location description.',
    };
    const subject = {
      ...location,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slug: 'actual-feature',
      title: 'Actual feature',
      category: 'Feature',
      effectiveBody: 'Subject text must not become the place description.',
    };
    const child = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      atlasCode: 'UNDER',
      name: 'Underkeep',
      regionId: region.id,
    };
    const entries = [location, subject].map((document, index) => ({
      mapId: good.id,
      nodeId: first.id,
      documentId: document.id,
      relation: index === 0 ? 'location' : 'subject',
      createdAt: good.createdAt,
      createdBy: good.id,
    }));
    const map = {
      ...good,
      regionId: region.id,
      pointcrawlNodes: [
        { ...first, submapId: child.id, linkedEntries: entries },
        ...good.pointcrawlNodes.slice(1),
      ],
    };
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [map, child], regions: [region] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) =>
        HttpResponse.json({
          data: { map: variables.atlasCode === 'UNDER' ? child : map },
        }),
      ),
      graphql.query('MapDocuments', () =>
        HttpResponse.json({
          data: {
            document0: location,
            document1: subject,
            document2: null,
            document3: null,
            document4: null,
          },
        }),
      ),
    );
    page(`/map/LFC?node=${first.id}`);
    const panel = await screen.findByRole('region', { name: 'Selected location' });
    expect(
      await within(panel).findByText('The real location description.'),
    ).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Actual place' })).toHaveAttribute(
      'href',
      '/codex/real-location',
    );
    expect(within(panel).getByRole('link', { name: 'Actual feature' })).toHaveAttribute(
      'href',
      '/codex/actual-feature',
    );
    // Linked documents show a title and a description only: no category or relation tags.
    expect(within(panel).queryByText('Codex · Location')).toBeNull();
    expect(within(panel).queryByText('Codex · Feature')).toBeNull();
    expect(within(panel).queryByText('Subject')).toBeNull();
    expect(
      within(panel).getByRole('link', { name: 'Explore Underkeep' }),
    ).toHaveAttribute('href', '/map/UNDER');
    expect(
      within(panel).queryByText(/illustrative|Session on the Stair|The Salt Stair/),
    ).toBeNull();
    expect(within(panel).queryByRole('link', { name: /Quest|Recap/ })).toBeNull();
  });

  it('offers only same-region or actual parent/submap siblings', async () => {
    const child = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      atlasCode: 'UNDER',
      name: 'Underkeep',
      regionId: region.id,
    };
    const nearby = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
      atlasCode: 'NEAR',
      name: 'Nearby',
      regionId: region.id,
    };
    const other = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad',
      atlasCode: 'OTHER',
      name: 'Unrelated',
    };
    const parent = { ...good, pointcrawlNodes: [{ ...first, submapId: child.id }] };
    const maps = [parent, child, nearby, other];
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps, regions: [region] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) =>
        HttpResponse.json({
          data: { map: maps.find((item) => item.atlasCode === variables.atlasCode) },
        }),
      ),
    );
    page('/map/UNDER');
    const navigation = await screen.findByRole('navigation', { name: 'Choose a map' });
    expect(
      await within(navigation).findByRole('link', { name: 'Lightfall' }),
    ).toBeVisible();
    expect(within(navigation).getByRole('link', { name: 'Underkeep' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', { name: 'Nearby' })).toBeVisible();
    expect(within(navigation).queryByRole('link', { name: 'Unrelated' })).toBeNull();
  });

  it('previews a map card with its art and falls back to the sketch when the art fails', async () => {
    const painted = { ...good, assetPath: 'atlases/example.webp' };
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [painted], regions: [region] } }),
      ),
      graphql.query('MapAtlas', () => HttpResponse.json({ data: { map: painted } })),
    );
    page('/map');
    const art = await waitFor(() => {
      const image = document.querySelector(`img[data-map-art="${good.atlasCode}"]`);
      expect(image).not.toBeNull();
      return image!;
    });
    expect(art).toHaveAttribute('src', '/atlases/example.webp');
    expect(document.querySelector('[data-map-sketch]')).toBeNull();
    fireEvent.error(art);
    await waitFor(() =>
      expect(document.querySelector(`[data-map-sketch="${good.atlasCode}"]`)).not.toBeNull(),
    );
    expect(document.querySelector('img[data-map-art]')).toBeNull();
  });

  it('resolves map assets from the app root and preserves their native coordinate system', async () => {
    class MapImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1600;
      naturalHeight = 1000;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MapImage);
    render(
      <PointcrawlViewport
        map={{ ...pointcrawl, assetPath: 'atlases/example.webp' }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    expect(graph.querySelector('image')).toHaveAttribute(
      'href',
      '/atlases/example.webp',
    );
    await waitFor(() => expect(graph).toHaveAttribute('viewBox', '0 0 1600 1000'));
    expect(within(graph).getByRole('button', { name: first.name })).toHaveAttribute(
      'transform',
      'translate(120 100)',
    );
    expect(graph.querySelector('image')).toHaveAttribute('width', '1600');
  });

  it('falls back to parchment when a declared image fails instead of drawing made-up geography', async () => {
    class MissingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', MissingImage);
    render(
      <PointcrawlViewport
        map={{ ...pointcrawl, assetPath: 'missing.webp' }}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    await waitFor(() => expect(graph.querySelector('image')).toBeNull());
    expect(within(graph).getAllByRole('button')).toHaveLength(3);
    expect(graph.querySelectorAll('polyline')).toHaveLength(1);
    expect(graph.querySelectorAll('path')).toHaveLength(4);
  });

  it('zooms with wheel and pinch and recentres the selected place with Show on map', async () => {
    page(`/map/LFC?node=${first.id}`);
    const graph = await screen.findByRole('group', {
      name: 'Lightfall map',
    });
    const initial = graph.getAttribute('viewBox');
    fireEvent.wheel(graph, { deltaY: -100 });
    expect(graph).not.toHaveAttribute('viewBox', initial);
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(graph).toHaveAttribute('viewBox', initial);
    Object.defineProperty(graph, 'setPointerCapture', { value: vi.fn() });
    const pointer = (type: string, id: number, x: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 });
      Object.defineProperty(event, 'pointerId', { value: id });
      fireEvent(graph, event);
    };
    act(() => {
      pointer('pointerdown', 1, 10);
      pointer('pointerdown', 2, 110);
      pointer('pointermove', 2, 210);
    });
    expect(graph).toHaveAttribute('viewBox', '140 -15 200 130');
    pointer('pointerup', 1, 10);
    pointer('pointerup', 2, 210);
    fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    expect(graph).toHaveAttribute('viewBox', '20 35 200 130');
  });

  it.each([false, true])(
    'gates established edit controls on canEdit=%s with an Edit map button but no Edit map route',
    async (canEdit) => {
      server.use(
        graphql.query('MapAtlas', () =>
          HttpResponse.json({ data: { map: { ...good, canEdit } } }),
        ),
      );
      page();
      await screen.findByRole('group', { name: 'Lightfall map' });
      expect(Boolean(screen.queryByRole('button', { name: 'Add location' }))).toBe(
        canEdit,
      );
      // Edit map is a dialog button for editors, never a route.
      expect(Boolean(screen.queryByRole('button', { name: 'Edit map' }))).toBe(canEdit);
      expect(screen.queryByRole('link', { name: 'Edit map' })).toBeNull();
    },
  );
});
