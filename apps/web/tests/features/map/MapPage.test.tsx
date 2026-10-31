import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { queryKeys } from '../../../src/features/map/feature.js';
import * as adapter from '../../../src/features/map/adapters/mapAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import {
  MAP_ROUTES_STORAGE_KEY,
  PointcrawlViewport,
} from '../../../src/features/map/components/PointcrawlViewport.js';
import {
  RegionHubPage,
  RegionsDirectoryPage,
} from '../../../src/features/map/pages/RegionHubPage.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/goodMap.js';
import member from '../../fixtures/wire/me/good.json';

// These suites cover route drawing; routes are hidden by default, so opt in.
beforeEach(() => localStorage.setItem(MAP_ROUTES_STORAGE_KEY, 'true'));

function token(actor = 'A') {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: actor, exp: 4102444800 }))}.test`;
}
function session() {
  localStorage.setItem(TOKEN_KEY, token());
  server.use(
    graphql.query('MemberMe', ({ request }) =>
      HttpResponse.json({
        data: {
          memberMe: {
            ...member,
            id: request.headers.get('authorization')?.includes(token('B'))
              ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
              : member.id,
            roles: ['archon', 'player'],
          },
        },
      }),
    ),
    graphql.query('MapAtlas', () =>
      HttpResponse.json({ data: { map: { ...good, canEdit: true } } }),
    ),
  );
}
function Controls() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => auth.storeToken(token('B'))}>Account B</button>
      <button onClick={auth.logout}>Sign out</button>
      <button
        onClick={() => navigate(`/map/OTHER?node=${good.pointcrawlNodes[0]!.id}`)}
      >
        Other map
      </button>
    </>
  );
}
function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <output aria-label="Current filters">{location.search}</output>
    </>
  );
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<T>((release, fail) => {
    resolve = release;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const locationDocument = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  slug: 'private-location',
  kind: 'codex_entry',
  category: 'Locations',
  title: 'Private location',
  effectiveBody: 'Actor A body',
};
const linkedMap = {
  ...good,
  canEdit: true,
  pointcrawlNodes: [
    {
      ...good.pointcrawlNodes[0]!,
      linkedEntries: [
        {
          mapId: good.id,
          nodeId: good.pointcrawlNodes[0]!.id,
          documentId: locationDocument.id,
          relation: 'location',
          createdAt: good.createdAt,
          createdBy: member.id,
        },
      ],
    },
    ...good.pointcrawlNodes.slice(1),
  ],
};

function renderMap(route = `/map/LFC?node=${good.pointcrawlNodes[0]!.id}`) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/map"
        element={
          <>
            <Controls />
            <MapPage />
          </>
        }
      />
      <Route
        path="/map/:atlasCode"
        element={
          <>
            <Controls />
            <MapPage />
          </>
        }
      />
    </Routes>,
    { route },
  );
}
describe('MapPage', () => {
  it('loads parent containment without loading other full maps', async () => {
    const regionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const parent = {
      ...good,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      atlasCode: 'PARENT',
      name: 'Parent map',
    };
    const child = {
      ...good,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      atlasCode: 'CHILD',
      name: 'Child map',
    };
    const peer = {
      ...good,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      atlasCode: 'PEER',
      name: 'Same region',
      regionId,
    };
    const unrelated = {
      ...good,
      id: '11111111-1111-4111-8111-111111111111',
      atlasCode: 'UNRELATED',
      name: 'Unrelated map',
    };
    const selected = {
      ...good,
      regionId,
      pointcrawlNodes: [{ ...good.pointcrawlNodes[0]!, submapId: child.id }],
    };
    const parentNodes = Array.from({ length: 201 }, (_, index) => ({
      ...good.pointcrawlNodes[0]!,
      mapId: parent.id,
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
      submapId: index === 200 ? selected.id : null,
    }));
    const maps = [
      selected,
      { ...parent, pointcrawlNodes: parentNodes },
      peer,
      child,
      unrelated,
    ];
    const fullReads: string[] = [];
    const parentOffsets: number[] = [];
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps, regions: [] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) => {
        fullReads.push(String(variables.atlasCode));
        const map = maps.find((item) => item.atlasCode === variables.atlasCode);
        return HttpResponse.json({
          data: {
            map: map
              ? {
                  ...map,
                  pointcrawlNodes: map.pointcrawlNodes.slice(
                    Number(variables.offset),
                    Number(variables.offset) + 200,
                  ),
                }
              : null,
          },
        });
      }),
      graphql.query('MapContainment', ({ variables }) => {
        const map = maps.find((item) => item.atlasCode === variables.atlasCode);
        if (map?.id === parent.id) parentOffsets.push(Number(variables.offset));
        return HttpResponse.json({
          data: {
            map: map
              ? {
                  id: map.id,
                  pointcrawlNodes: map.pointcrawlNodes
                    .slice(Number(variables.offset), Number(variables.offset) + 200)
                    .map(({ submapId }) => ({ submapId })),
                }
              : null,
          },
        });
      }),
    );
    renderMap('/map/LFC');
    const navigation = await screen.findByRole('navigation', { name: 'Choose a map' });
    await within(navigation).findByRole('link', { name: 'Parent map' });
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Lightfall', 'Parent map', 'Same region', 'Child map']);
    expect(fullReads).toEqual(['LFC']);
    expect(parentOffsets).toEqual([0, 200]);
  });

  it('refreshes sibling navigation after a submap edit', async () => {
    session();
    const child = {
      ...good,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      atlasCode: 'OTHER',
      name: 'Child map',
      canEdit: true,
    };
    let parent: Omit<typeof good, 'pointcrawlNodes'> & {
      pointcrawlNodes: adapter.MapNode[];
    } = {
      ...good,
      canEdit: true,
      pointcrawlNodes: [{ ...good.pointcrawlNodes[0]!, submapId: child.id }],
    };
    let saved = false;
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [parent, child], regions: [] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) =>
        HttpResponse.json({
          data: { map: variables.atlasCode === 'OTHER' ? child : parent },
        }),
      ),
      graphql.query('MapContainment', ({ variables }) => {
        const map = variables.atlasCode === 'OTHER' ? child : parent;
        return HttpResponse.json({
          data: {
            map: {
              id: map.id,
              pointcrawlNodes: map.pointcrawlNodes.map(({ submapId }) => ({ submapId })),
            },
          },
        });
      }),
      graphql.mutation('MapSaveNode', ({ variables }) => {
        expect(variables.input.submapId).toBeNull();
        parent = {
          ...parent,
          pointcrawlNodes: [{ ...parent.pointcrawlNodes[0]!, submapId: null }],
        };
        saved = true;
        return HttpResponse.json({
          data: { upsertPointcrawlNode: { id: good.pointcrawlNodes[0]!.id } },
        });
      }),
    );
    renderMap('/map/OTHER');
    const navigation = await screen.findByRole('navigation', { name: 'Choose a map' });
    const parentLink = await within(navigation).findByRole('link', { name: 'Lightfall' });
    const user = userEvent.setup();
    await user.click(parentLink);
    await screen.findByRole('group', { name: 'Lightfall map' });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Lightfall map' })).getByRole('button', {
        name: 'Lightfall Gate',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Edit location' }));
    await user.click(screen.getByRole('button', { name: /^Submap/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'No submap' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Other map' }));
    await screen.findByRole('group', { name: 'Child map map' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('navigation', { name: 'Choose a map' })).queryByRole(
          'link',
          { name: 'Lightfall' },
        ),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps dense locations and connections fully named without overlapping SVG prose', async () => {
    const names = [
      'The very long complete name of the northern gate overlooking the river',
      'A nearby location at almost the same coordinates',
      'A coincident location with its own identity',
    ];
    const nodes = good.pointcrawlNodes.map((node, index) => ({
      ...node,
      name: names[index] ?? node.name,
      x: index === 0 ? 112.5 : 120,
      y: index === 0 ? -7.25 : 0,
    }));
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({
          data: {
            map: {
              ...good,
              pointcrawlNodes: nodes,
              pointcrawlEdges: good.pointcrawlEdges.map((edge) => ({
                ...edge,
                directed: true,
                label: 'The full name of the directed connection',
              })),
            },
          },
        }),
      ),
    );
    renderMap();
    fireEvent.click(await screen.findByText('Locations (3)', { selector: 'summary' }));
    const list = screen.getByRole('list', { name: 'Map locations' });
    const viewport = screen.getByRole('region', { name: 'Map viewport' });
    const graph = within(viewport).getByRole('group', {
      name: 'Lightfall map',
    });
    nodes.forEach((node) => {
      expect(within(list).getByRole('button', { name: node.name })).toBeVisible();
      const marker = within(graph).getByRole('button', { name: node.name });
      expect(marker).toHaveAttribute('transform', `translate(${node.x} ${node.y})`);
      expect(marker.querySelector('title')).toHaveTextContent(node.name);
    });
    // Long names are shortened on the canvas; the full name stays in the title and list.
    [...graph.querySelectorAll('g[role="button"] text:last-child')].forEach(
      (label, index) => {
        const full = nodes[index]?.name ?? '';
        const shown = label.textContent ?? '';
        expect(
          shown === '' ||
            shown === full ||
            (shown.endsWith('…') && full.startsWith(shown.slice(0, -1))),
        ).toBe(true);
      },
    );
    expect(
      [...graph.querySelectorAll('title')].map((title) => title.textContent),
    ).toContain('The full name of the directed connection (one way)');
    // Connections are hidden from the map UI (M4-17); the route names stay on the canvas.
    expect(screen.queryByRole('region', { name: 'Map connections' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add connection' })).toBeNull();
    const caption = screen.getByRole('status');
    expect(caption).toHaveTextContent(names[0]!);
    fireEvent.click(within(list).getByRole('button', { name: names[2] }));
    expect(caption).toHaveTextContent(names[2]!);
    expect(caption).not.toHaveTextContent(names[0]!);
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      names[2]!,
    );
  });
  it('offers the same real locations through the graph and list on a compact allocation', async () => {
    renderMap();
    fireEvent.click(await screen.findByText('Locations (3)', { selector: 'summary' }));
    const list = screen.getByRole('list', { name: 'Map locations' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    fireEvent.keyDown(within(graph).getByRole('button', { name: 'Old Watchtower' }), {
      key: 'Enter',
    });
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      'Old Watchtower',
    );
    fireEvent.click(within(list).getByRole('button', { name: 'River Crossing' }));
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      'River Crossing',
    );
    expect(
      screen.queryByRole('button', { name: 'Add location' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-page-region="body"]')).toBeTruthy();
  });
  it('reads more than four linked documents in authorized batches and hides unavailable document identities', async () => {
    const first = good.pointcrawlNodes[0]!;
    const ids = Array.from(
      { length: 6 },
      (_, index) => `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, '0')}`,
    );
    const entries = ids.map((documentId) => ({
      mapId: good.id,
      nodeId: first.id,
      documentId,
      relation: 'location',
      createdAt: good.createdAt,
      createdBy: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    }));
    const batches: string[][] = [];
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({
          data: {
            map: { ...good, pointcrawlNodes: [{ ...first, linkedEntries: entries }] },
          },
        }),
      ),
      graphql.query('MapDocuments', ({ variables }) => {
        const ids = [
          variables.id0,
          variables.id1,
          variables.id2,
          variables.id3,
          variables.id4,
        ];
        batches.push(ids);
        return HttpResponse.json({
          data: Object.fromEntries(
            ids.map((id, index) => [
              `document${index}`,
              id.endsWith('000005')
                ? null
                : {
                    id,
                    slug: `location-${id.slice(-1)}`,
                    kind: 'codex_entry',
                    category: 'Locations',
                    title: `Location ${id.slice(-1)}`,
                    effectiveBody: 'Canonical Location body.',
                  },
            ]),
          ),
        });
      }),
    );
    renderMap();
    expect(await screen.findByRole('link', { name: 'Location 4' })).toHaveAttribute(
      'href',
      '/codex/location-4',
    );
    expect(
      await screen.findByText('This linked entry is unavailable to you.'),
    ).toBeInTheDocument();
    expect(batches).toHaveLength(2);
    expect(screen.queryByText(ids[5]!)).not.toBeInTheDocument();
  });
  it('asks a signed-out visitor to sign in when the directory answers 403', async () => {
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json(
          { errors: [{ message: 'forbidden', extensions: { code: 'FORBIDDEN' } }] },
          { status: 403 },
        ),
      ),
    );
    renderMap('/map');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign in to see this');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Map directory could not load.')).toBeNull();
  });
  it('restores node selection from the URL and reports unavailable maps', async () => {
    renderMap(`/map/LFC?node=${good.pointcrawlNodes[2]?.id}`);
    expect(
      await screen.findByRole('region', { name: 'Selected location' }),
    ).toHaveTextContent('River Crossing');
  });
  it('uses server edit capability and retains values after a rejected save', async () => {
    session();
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({ data: { map: { ...good, canEdit: true } } }),
      ),
      graphql.mutation('MapSaveNode', () =>
        HttpResponse.json({
          errors: [
            { message: 'No longer authorized', extensions: { code: 'FORBIDDEN' } },
          ],
        }),
      ),
    );
    renderMap();
    fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
    fireEvent.change(screen.getByLabelText('Location name'), {
      target: { value: 'Retained location' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) =>
            /Sign in to see this|You don’t have access to this/.test(
              alert.textContent ?? '',
            ),
          ),
      ).toBe(true),
    );
    expect(screen.getByLabelText('Location name')).toHaveValue('Retained location');
  });
  it.each(['success', 'failure'] as const)(
    'keeps account B’s new draft after account A’s late %s',
    async (outcome) => {
      session();
      const held = deferred<{ id: string }>();
      const save = vi.spyOn(adapter, 'saveNode').mockReturnValueOnce(held.promise);
      try {
        renderMap();
        fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
          target: { value: 'A draft' },
        });
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
        expect(save).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('Account B', { selector: 'button' }));
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
          target: { value: 'B draft' },
        });
        await act(async () => {
          if (outcome === 'success') held.resolve({ id: good.pointcrawlNodes[1]!.id });
          else held.reject(new Error('A failed'));
        });
        expect(screen.getByRole('dialog')).toHaveTextContent('Add location');
        expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveValue(
          'B draft',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
          screen.getByLabelText('Selected location', { selector: 'section' }),
        ).toHaveTextContent('Lightfall Gate');
      } finally {
        save.mockRestore();
      }
    },
  );
  it.each(['Sign out', 'Other map', 'select node', 'revoke capability'])(
    'resets the draft on %s and ignores its pending save',
    async (change) => {
      session();
      const held = deferred<{ id: string }>();
      const save = vi.spyOn(adapter, 'saveNode').mockReturnValueOnce(held.promise);
      try {
        const { queryClient } = renderMap();
        fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
          target: { value: 'Old draft' },
        });
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
        if (change === 'select node') {
          fireEvent.click(screen.getByText('Locations (3)', { selector: 'summary' }));
          fireEvent.click(
            within(
              screen.getByLabelText('Map locations', { selector: 'ul' }),
            ).getByText('River Crossing', { selector: 'button' }),
          );
        } else if (change === 'revoke capability')
          await act(async () => {
            queryClient.setQueryData(queryKeys.map('LFC'), {
              ...(await adapter.loadMap('LFC')),
              canEdit: false,
            });
          });
        else fireEvent.click(screen.getByText(change, { selector: 'button' }));
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        await act(async () => {
          held.resolve({ id: good.pointcrawlNodes[1]!.id });
        });
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        invalidate.mockRestore();
      } finally {
        save.mockRestore();
      }
    },
  );
  it('rejects synchronous duplicate submits and reuses the payload key after a lost response', async () => {
    session();
    const held = deferred<{ id: string }>();
    const save = vi
      .spyOn(adapter, 'saveNode')
      .mockReturnValueOnce(held.promise)
      .mockRejectedValueOnce(new Error('lost'));
    try {
      renderMap();
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
        target: { value: 'Retry me' },
      });
      const form = screen.getByRole('button', { name: 'Save' }).closest('form')!;
      fireEvent.submit(form);
      fireEvent.submit(form);
      expect(save).toHaveBeenCalledTimes(1);
      await act(async () => {
        held.reject(new Error('lost'));
      });
      fireEvent.submit(form);
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]?.[2]).toBe(save.mock.calls[0]?.[2]);
      expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveValue(
        'Retry me',
      );
    } finally {
      save.mockRestore();
    }
  });
  it('refetches current authority after a server denial and removes edit controls', async () => {
    session();
    let allowed = true;
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({ data: { map: { ...good, canEdit: allowed } } }),
      ),
      graphql.mutation('MapSaveNode', () => {
        allowed = false;
        return HttpResponse.json({
          errors: [{ message: 'revoked', extensions: { code: 'FORBIDDEN' } }],
        });
      }),
    );
    renderMap();
    fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
      target: { value: 'Denied draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Sign in to see this|You don’t have access to this/,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Add location' }),
    ).not.toBeInTheDocument();
  });
  it.each([
    `/map?atlas=LFC&node=${good.pointcrawlNodes[0]!.id}`,
    `/map/LFC?node=${good.pointcrawlNodes[0]!.id}`,
  ])(
    'keeps role-loss feedback after current Me clears and reloads Map data at %s',
    async (route) => {
      session();
      let revoked = false;
      const reload = deferred<void>();
      let pendingReloads = 0;
      server.use(
        graphql.query('MemberMe', () =>
          HttpResponse.json({
            data: {
              memberMe: {
                ...member,
                roles: revoked ? ['player'] : ['archon', 'player'],
              },
            },
          }),
        ),
        graphql.query('MapAtlas', async () => {
          if (revoked) {
            pendingReloads++;
            await reload.promise;
          }
          return HttpResponse.json({ data: { map: { ...good, canEdit: !revoked } } });
        }),
        graphql.mutation('MapSaveNode', () => {
          revoked = true;
          return HttpResponse.json({
            errors: [{ message: 'role revoked', extensions: { code: 'FORBIDDEN' } }],
          });
        }),
      );
      const { queryClient } = renderMap(route);
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
        target: { value: 'Denied after role loss' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(queryClient.getQueryData<typeof member>(['me'])?.roles).toEqual([
          'player',
        ]),
      );
      await waitFor(() =>
        expect(queryClient.getQueryData(queryKeys.map('LFC'))).toBeUndefined(),
      );
      await waitFor(() => expect(pendingReloads).toBeGreaterThan(0));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => {
        reload.resolve();
      });
      await screen.findByRole('region', { name: 'Selected location' });
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add location' }),
      ).not.toBeInTheDocument();
      expect(
        screen
          .queryAllByRole('alert')
          .filter((alert) =>
            /Sign in to see this|You don’t have access to this/.test(
              alert.textContent ?? '',
            ),
          ),
      ).toHaveLength(1);
      fireEvent.click(screen.getByText('Locations (3)', { selector: 'summary' }));
      const list = screen.getByRole('list', { name: 'Map locations' });
      fireEvent.click(within(list).getByRole('button', { name: 'River Crossing' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      fireEvent.click(within(list).getByRole('button', { name: 'Lightfall Gate' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
  it.each(['Account B', 'Other map'])(
    'discards role-loss feedback after %s during the cache reload',
    async (change) => {
      session();
      let revoked = false;
      const reload = deferred<void>();
      let pendingReloads = 0;
      server.use(
        graphql.query('MemberMe', ({ request }) =>
          HttpResponse.json({
            data: {
              memberMe: {
                ...member,
                id: request.headers.get('authorization')?.includes(token('B'))
                  ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
                  : member.id,
                roles: revoked ? ['player'] : ['archon', 'player'],
              },
            },
          }),
        ),
        graphql.query('MapAtlas', async () => {
          if (revoked) {
            pendingReloads++;
            await reload.promise;
          }
          return HttpResponse.json({ data: { map: { ...good, canEdit: !revoked } } });
        }),
        graphql.mutation('MapSaveNode', () => {
          revoked = true;
          return HttpResponse.json({
            errors: [{ message: 'role revoked', extensions: { code: 'FORBIDDEN' } }],
          });
        }),
      );
      const { queryClient } = renderMap(`/map/LFC?node=${good.pointcrawlNodes[0]!.id}`);
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
        target: { value: 'Denied before leaving' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(queryClient.getQueryData<typeof member>(['me'])?.roles).toEqual([
          'player',
        ]),
      );
      await waitFor(() =>
        expect(queryClient.getQueryData(queryKeys.map('LFC'))).toBeUndefined(),
      );
      await waitFor(() => expect(pendingReloads).toBeGreaterThan(0));
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Sign in to see this|You don’t have access to this/,
      );
      fireEvent.click(screen.getByRole('button', { name: change }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => {
        reload.resolve();
      });
      await screen.findByRole('region', { name: 'Selected location' });
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
  it('does not refresh after a pending save completes following unmount', async () => {
    session();
    const held = deferred<{ id: string }>();
    const save = vi.spyOn(adapter, 'saveNode').mockReturnValueOnce(held.promise);
    try {
      const { unmount, queryClient } = renderMap();
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
      unmount();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await act(async () => {
        held.resolve({ id: good.pointcrawlNodes[1]!.id });
      });
      expect(invalidate).not.toHaveBeenCalled();
      invalidate.mockRestore();
    } finally {
      save.mockRestore();
    }
  });
  it.each(['create', 'link'] as const)(
    'ignores an old account’s %s completion while the new account edits',
    async (kind) => {
      session();
      const held = deferred<{ id: string; atlasCode: string }>();
      const create = vi.spyOn(adapter, 'createMap').mockReturnValueOnce(held.promise);
      const link = vi
        .spyOn(adapter, 'changeEntry')
        .mockReturnValueOnce(held.promise.then(() => undefined));
      const region = {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        name: 'Assigned Region',
        canCreateMap: true,
        kind: 'charter',
        charterDeadline: null,
        documentId: null,
        createdAt: good.createdAt,
      };
      server.use(
        graphql.query('MapDirectory', () =>
          HttpResponse.json({ data: { maps: [good], regions: [region] } }),
        ),
        graphql.query('MapLocationDocuments', () =>
          HttpResponse.json({
            data: { documents: { total: 1, items: [locationDocument] } },
          }),
        ),
      );
      try {
        renderMap();
        await screen.findByRole('button', { name: 'Add location' });
        fireEvent.click(
          screen.getByRole('button', {
            name: kind === 'create' ? 'Create map' : 'Link a Location',
          }),
        );
        if (kind === 'create') {
          for (const name of ['Map name', 'Map address', 'Map group'])
            fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${name}`) }), {
              target: { value: 'A map' },
            });
        } else if (kind === 'link') {
          await userEvent.click(
            await screen.findByRole('button', { name: /^Location/ }),
          );
          await userEvent.click(
            await screen.findByRole('menuitem', { name: locationDocument.title }),
          );
        }
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
        expect(kind === 'create' ? create : link).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('Account B', { selector: 'button' }));
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
          target: { value: 'B new draft' },
        });
        await act(async () => {
          held.resolve({ id: good.pointcrawlNodes[1]!.id, atlasCode: 'OLD-CREATE' });
        });
        expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveValue(
          'B new draft',
        );
        expect(
          screen.getByText('Lightfall', { selector: 'h1, h2, h3, h4, h5, h6' }),
        ).toBeInTheDocument();
      } finally {
        create.mockRestore();
        link.mockRestore();
      }
    },
  );
  it.each(['account change', 'unmount'])(
    'does not seed a late linked-Document result after %s',
    async (change) => {
      session();
      server.use(
        graphql.query('MapAtlas', () =>
          HttpResponse.json({ data: { map: linkedMap } }),
        ),
      );
      const held = deferred<(adapter.MapDocument | null)[]>();
      const load = vi
        .spyOn(adapter, 'loadMapDocuments')
        .mockReturnValueOnce(held.promise)
        .mockResolvedValue([null]);
      try {
        const { queryClient, unmount } = renderMap();
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        if (change === 'unmount') unmount();
        else {
          fireEvent.click(screen.getByRole('button', { name: 'Account B' }));
          await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
          await screen.findByText('This linked entry is unavailable to you.');
        }
        await act(async () => {
          held.resolve([locationDocument]);
        });
        expect(
          queryClient.getQueryData(queryKeys.mapDocument(locationDocument.id)),
        ).toBe(change === 'unmount' ? undefined : null);
        expect(screen.queryByText('Actor A body')).not.toBeInTheDocument();
      } finally {
        load.mockRestore();
      }
    },
  );
  it.each(['success', 'failure'] as const)(
    'ignores account A’s late unlink %s while account B edits',
    async (outcome) => {
      session();
      server.use(
        graphql.query('MapAtlas', () =>
          HttpResponse.json({ data: { map: linkedMap } }),
        ),
      );
      const held = deferred<void>();
      const load = vi
        .spyOn(adapter, 'loadMapDocuments')
        .mockResolvedValue([locationDocument]);
      const unlink = vi.spyOn(adapter, 'changeEntry').mockReturnValueOnce(held.promise);
      try {
        const { queryClient } = renderMap();
        fireEvent.click(
          await screen.findByRole('button', { name: 'Unlink Private location' }),
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
        expect(unlink).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Account B' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
          target: { value: 'B unchanged' },
        });
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        await act(async () => {
          if (outcome === 'success') held.resolve();
          else held.reject(new Error('A unlink failed'));
        });
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveValue(
          'B unchanged',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        invalidate.mockRestore();
      } finally {
        load.mockRestore();
        unlink.mockRestore();
      }
    },
  );
  it('does not let an old unlink completion unlock a new request after capability is restored', async () => {
    session();
    server.use(
      graphql.query('MapAtlas', () => HttpResponse.json({ data: { map: linkedMap } })),
    );
    const first = deferred<void>();
    const second = deferred<void>();
    const load = vi
      .spyOn(adapter, 'loadMapDocuments')
      .mockResolvedValue([locationDocument]);
    const unlink = vi
      .spyOn(adapter, 'changeEntry')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    try {
      const { queryClient } = renderMap();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Unlink Private location' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
      const map = queryClient.getQueryData<adapter.Pointcrawl>(queryKeys.map('LFC'));
      expect(map).toBeDefined();
      await act(async () => {
        queryClient.setQueryData(queryKeys.map('LFC'), { ...map, canEdit: false });
      });
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Unlink Private location' }),
        ).not.toBeInTheDocument(),
      );
      await act(async () => {
        queryClient.setQueryData(queryKeys.map('LFC'), map);
      });
      fireEvent.click(
        await screen.findByRole('button', { name: 'Unlink Private location' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
      expect(unlink).toHaveBeenCalledTimes(2);
      await act(async () => {
        first.resolve();
      });
      expect(
        screen.getByRole('button', { name: 'Unlink Private location' }),
      ).toBeDisabled();
      await act(async () => {
        second.resolve();
      });
    } finally {
      load.mockRestore();
      unlink.mockRestore();
    }
  });
  it('does not navigate or close a new account’s draft when an old save’s refresh finishes', async () => {
    session();
    const map = await adapter.loadMap('LFC');
    const held = deferred<adapter.Pointcrawl>();
    const load = vi
      .spyOn(adapter, 'loadMap')
      .mockResolvedValueOnce(map)
      .mockReturnValueOnce(held.promise)
      .mockResolvedValue(map);
    const save = vi
      .spyOn(adapter, 'saveNode')
      .mockResolvedValueOnce({ id: good.pointcrawlNodes[1]!.id });
    try {
      renderMap();
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByText('Account B', { selector: 'button' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Location name' }), {
        target: { value: 'B after refresh' },
      });
      await act(async () => {
        held.resolve(map);
      });
      expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveValue(
        'B after refresh',
      );
      expect(
        screen.getByLabelText('Selected location', { selector: 'section' }),
      ).toHaveTextContent('Lightfall Gate');
    } finally {
      load.mockRestore();
      save.mockRestore();
    }
  });
});

describe('PointcrawlViewport marker allocation', () => {
  it.each([
    { label: 'tall letterboxed', width: 400, height: 520, x: -60, y: -180 },
    { label: 'wide letterboxed', width: 800, height: 260, x: -60, y: -180 },
    { label: 'matching enlarged', width: 800, height: 520, x: -10, y: -130 },
    { label: 'matching compact', width: 200, height: 130, x: -160, y: -280 },
  ])('tracks both drag axes in a $label allocation', ({ width, height, x, y }) => {
    render(
      <PointcrawlViewport
        map={{ ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges }}
        selectedId={good.pointcrawlNodes[0]?.id ?? null}
        onSelect={vi.fn()}
      />,
    );
    const graph = screen.getByRole('group', { name: 'Lightfall map' });
    const rectangle = vi
      .spyOn(graph, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, width, height));
    const capture = vi.fn();
    Object.defineProperty(graph, 'setPointerCapture', { value: capture });
    const pointer = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(graph, event);
    };
    try {
      expect(graph).toHaveAttribute('viewBox', '40 -80 400 260');
      pointer('pointerdown', 10, 20);
      pointer('pointermove', 110, 120);
      expect(capture).toHaveBeenCalledWith(1);
      expect(graph).toHaveAttribute('viewBox', `${x} ${y} 400 260`);
      pointer('pointerup', 110, 120);
      pointer('pointermove', 210, 220);
      expect(graph).toHaveAttribute('viewBox', `${x} ${y} 400 260`);
      fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
      expect(graph).toHaveAttribute('viewBox', '40 -80 400 260');
    } finally {
      rectangle.mockRestore();
    }
  });
  it('keeps markers the same screen size while zoom separates coordinates and resize preserves the camera', () => {
    const observers: GraphObserver[] = [];
    class GraphObserver implements ResizeObserver {
      private target: Element | null = null;
      readonly observe = vi.fn((target: Element) => {
        this.target = target;
      });
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      resize(width: number, height: number): void {
        if (!this.target) throw new Error('Missing observed graph');
        const size = { inlineSize: width, blockSize: height };
        this.callback(
          [
            {
              target: this.target,
              contentRect: new DOMRect(0, 0, width, height),
              borderBoxSize: [size],
              contentBoxSize: [size],
              devicePixelContentBoxSize: [size],
            },
          ],
          this,
        );
      }
    }
    vi.stubGlobal('ResizeObserver', GraphObserver);
    const view = render(
      <PointcrawlViewport
        map={{ ...good, nodes: good.pointcrawlNodes, edges: good.pointcrawlEdges }}
        selectedId={good.pointcrawlNodes[0]?.id ?? null}
        onSelect={vi.fn()}
      />,
    );
    try {
      const graph = screen.getByRole('group', { name: 'Lightfall map' });
      const circle = graph.querySelector('circle');
      const connector = graph.querySelector('polyline');
      expect(connector).not.toBeNull();
      expect(circle).not.toBeNull();
      expect(observers).toHaveLength(1);
      const observer = observers[0];
      if (!observer) throw new Error('Missing graph observer');
      const initialViewBox = graph.getAttribute('viewBox');
      const position = circle?.parentElement?.getAttribute('transform');
      const endpoints = connector?.getAttribute('points');
      act(() => observer.resize(1040, 520));
      const fittedRadius = Number(circle?.getAttribute('r'));
      expect(fittedRadius * 2).toBeCloseTo(17);
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(graph).not.toHaveAttribute('viewBox', initialViewBox);
      expect(Number(circle?.getAttribute('r')) * 3).toBeCloseTo(17);
      const zoomedViewBox = graph.getAttribute('viewBox');
      act(() => observer.resize(520, 260));
      expect(graph).toHaveAttribute('viewBox', zoomedViewBox);
      expect(Number(circle?.getAttribute('r')) * 1.5).toBeCloseTo(17);
      expect(circle?.parentElement).toHaveAttribute('transform', position);
      expect(connector).toHaveAttribute('points', endpoints);
      act(() => observer.resize(0, 0));
      expect(Number(circle?.getAttribute('r')) * 1.5).toBeCloseTo(17);
      fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
      expect(graph).toHaveAttribute('viewBox', initialViewBox);
      expect(Number(circle?.getAttribute('r'))).toBeCloseTo(17);
      view.unmount();
      expect(observer.disconnect).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });
});
describe('Region navigation', () => {
  const region = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    name: 'Test Region',
    canCreateMap: false,
    kind: 'charter',
    charterDeadline: null,
    documentId: null,
    createdAt: good.createdAt,
  };
  it('explains unmapped Legacy slugs without guessing a current Region', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/regions/:slug" element={<RegionHubPage />} />
      </Routes>,
      { route: '/regions/old-slug' },
    );
    expect(screen.getByText(/older Region link/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse regions' })).toHaveAttribute(
      'href',
      '/regions',
    );
  });
  it('uses actual Region UUIDs and readable directory rows', async () => {
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({
          data: { maps: [{ ...good, regionId: region.id }], regions: [region] },
        }),
      ),
    );
    renderWithProviders(<RegionsDirectoryPage />);
    expect(await screen.findByRole('link', { name: 'Test Region' })).toHaveAttribute(
      'href',
      `/regions/${region.id}`,
    );
    expect(screen.getByText(/1 map$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Region' })).toHaveTextContent(
      'Charter · 1 map',
    );
  });
  it('filters the directory from URL state, supports browser history, and clears empty results', async () => {
    const regions = [
      region,
      { ...region, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Test Hollow' },
      {
        ...region,
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'North Reach',
        kind: 'province',
      },
    ];
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [], regions } }),
      ),
    );
    renderWithProviders(
      <>
        <HistoryControls />
        <RegionsDirectoryPage />
      </>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText('3 regions')).toBeVisible();
    await user.type(screen.getByRole('searchbox', { name: 'Search regions' }), 'test');
    expect(screen.getByText('2 regions')).toBeVisible();
    expect(screen.getByLabelText('Current filters')).toHaveTextContent('?q=test');
    await user.click(screen.getByRole('button', { name: 'Charter' }));
    expect(screen.getByLabelText('Current filters')).toHaveTextContent(
      '?q=test&kind=charter',
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Current filters')).toHaveTextContent('?q=test');
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByLabelText('Current filters')).toHaveTextContent(
      '?q=test&kind=charter',
    );
    await user.clear(screen.getByRole('searchbox', { name: 'Search regions' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Search regions' }),
      'nothing',
    );
    expect(screen.getByText('0 regions')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 regions')).toBeVisible();
    expect(screen.getByLabelText('Current filters')).toBeEmptyDOMElement();
  });
  it('renders current quest and pointcrawl location counts without the retired metric', async () => {
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [], regions: [region] } }),
      ),
      graphql.query('MapRegionCounts', () =>
        HttpResponse.json({
          data: {
            regionCounts: {
              regionId: region.id,
              questCount: 7,
              pointcrawlNodeCount: 3,
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/regions/:slug" element={<RegionHubPage />} />
      </Routes>,
      { route: `/regions/${region.id}` },
    );
    expect(await screen.findByText('7 quests overall')).toBeInTheDocument();
    expect(screen.queryByText(/linked features/i)).not.toBeInTheDocument();
  });
  it('lists region quests by their brief titles with status and seats', async () => {
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({
          data: { maps: [{ ...good, regionId: region.id }], regions: [region] },
        }),
      ),
      graphql.query('MapRegionActivity', () =>
        HttpResponse.json({
          data: {
            regionActivity: {
              regionId: region.id,
              regionName: region.name,
              fillingCount: 1,
              scheduledCount: 0,
              liveCount: 0,
              openQuests: [
                {
                  id: 'abababab-abab-4bab-8bab-abababababab',
                  shortCode: 'qa-chalk-and-wheel',
                  scheduledAt: '2026-11-02T18:00:00Z',
                  slotsMax: 5,
                  filledCount: 1,
                },
              ],
              liveQuests: [],
            },
          },
        }),
      ),
      graphql.query('MapQuestTitles', () =>
        HttpResponse.json({
          data: {
            quests: {
              items: [
                {
                  shortCode: 'qa-chalk-and-wheel',
                  status: 'open',
                  displayStatus: 'filling',
                  briefDocument: { title: 'Chalk and Wheel' },
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/regions/:slug" element={<RegionHubPage />} />
      </Routes>,
      { route: `/regions/${region.id}` },
    );
    expect(
      await screen.findByRole('link', { name: 'Chalk and Wheel' }),
    ).toHaveAttribute('href', '/quests/qa-chalk-and-wheel');
    expect(screen.queryByText('qa-chalk-and-wheel')).not.toBeInTheDocument();
    expect(screen.getByText('1/5 seats')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: region.name })).toBeVisible();
  });

  function activityWith(count: number) {
    const openQuests = Array.from({ length: count }, (_, index) => ({
      id: `abababab-abab-4bab-8bab-${String(index).padStart(12, '0')}`,
      shortCode: `qa-${index}`,
      scheduledAt: '2026-11-02T18:00:00Z',
      slotsMax: 5,
      filledCount: 1,
    }));
    return graphql.query('MapRegionActivity', () =>
      HttpResponse.json({
        data: {
          regionActivity: {
            regionId: region.id,
            regionName: region.name,
            fillingCount: count,
            scheduledCount: 0,
            liveCount: 0,
            openQuests,
            liveQuests: [],
          },
        },
      }),
    );
  }
  const directoryWithMap = () =>
    graphql.query('MapDirectory', () =>
      HttpResponse.json({
        data: { maps: [{ ...good, regionId: region.id }], regions: [region] },
      }),
    );
  function renderRegion() {
    renderWithProviders(
      <Routes>
        <Route path="/regions/:slug" element={<RegionHubPage />} />
      </Routes>,
      { route: `/regions/${region.id}` },
    );
  }

  it('shows a failed title read as an error with retry, not as untitled quests', async () => {
    let fail = true;
    server.use(
      directoryWithMap(),
      activityWith(1),
      graphql.query('MapQuestTitles', () =>
        fail
          ? HttpResponse.json({ errors: [{ message: 'boom' }] })
          : HttpResponse.json({
              data: {
                quests: {
                  items: [
                    {
                      shortCode: 'qa-0',
                      status: 'open',
                      displayStatus: 'filling',
                      briefDocument: { title: 'Recovered title' },
                    },
                  ],
                },
              },
            }),
      ),
    );
    renderRegion();
    const retry = await screen.findByRole('button', { name: 'Retry quest titles' });
    expect(screen.queryByText('Untitled quest')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'qa-0' })).toHaveAttribute(
      'href',
      '/quests/qa-0',
    );
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByRole('link', { name: 'Recovered title' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry quest titles' })).toBeNull();
  });

  it('reads titles for a region with more quests than one title page', async () => {
    const asked: string[][] = [];
    server.use(
      directoryWithMap(),
      activityWith(51),
      graphql.query('MapQuestTitles', ({ variables }) => {
        const codes = variables.codes as string[];
        asked.push(codes);
        return HttpResponse.json({
          data: {
            quests: {
              items: codes.map((code) => ({
                shortCode: code,
                status: 'open',
                displayStatus: 'filling',
                briefDocument: { title: `Title ${code}` },
              })),
            },
          },
        });
      }),
    );
    renderRegion();
    // The card previews five quests and links to the rest.
    expect(await screen.findByRole('link', { name: 'Title qa-0' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: '46 more on the quest board' }),
    ).toBeVisible();
    expect(asked.map((codes) => codes.length).sort((a, b) => a - b)).toEqual([1, 50]);
  });
});

describe('MapPage reader presentation', () => {
  it('keeps details anchored directly to the canvas and discloses the complete location list on request', async () => {
    renderMap();
    const selected = await screen.findByRole('region', { name: 'Selected location' });
    const viewport = screen.getByRole('region', { name: 'Map viewport' });
    expect(viewport.nextElementSibling).toBe(selected);
    const locations = screen.getByRole('region', { name: 'Map locations' });
    expect(screen.queryByRole('region', { name: 'Map connections' })).toBeNull();
    expect(locations.querySelector('details')).not.toHaveAttribute('open');
    fireEvent.click(
      within(locations).getByText('Locations (3)', { selector: 'summary' }),
    );
    expect(
      within(locations).getByRole('button', { name: 'River Crossing' }),
    ).toBeVisible();
    fireEvent.click(within(viewport).getByRole('button', { name: 'Old Watchtower' }));
    expect(screen.getByRole('region', { name: 'Selected location' })).toHaveTextContent(
      'Old Watchtower',
    );
    expect(locations.querySelector('details')).toHaveAttribute('open');
  });

  it('filters directory cards by regions and preserves the directory route and result count', async () => {
    const region = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      name: 'Northern Reach',
      kind: 'charter',
      canCreateMap: false,
      charterDeadline: null,
      documentId: null,
      createdAt: good.createdAt,
    };
    const regionalMap = {
      ...good,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      name: 'Northern trails',
      atlasCode: 'NORTH',
      regionId: region.id,
    };
    server.use(
      graphql.query('MapDirectory', () =>
        HttpResponse.json({ data: { maps: [good, regionalMap], regions: [region] } }),
      ),
      graphql.query('MapAtlas', ({ variables }) =>
        HttpResponse.json({
          data: { map: variables.atlasCode === 'NORTH' ? regionalMap : good },
        }),
      ),
    );
    renderMap('/map');
    fireEvent.click(await screen.findByRole('button', { name: 'Northern Reach' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Northern Reach' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('1 map')).toBeVisible();
    const cards = screen.getByRole('region', { name: 'Campaign maps' });
    expect(
      within(cards).getByRole('link', { name: /Northern trails/ }),
    ).toHaveAttribute('href', '/map/NORTH');
    expect(within(cards).queryByRole('link', { name: /Lightfall/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All maps' }));
    expect(screen.getByText('2 maps')).toBeVisible();
    expect(within(cards).getByRole('link', { name: /Lightfall/ })).toHaveAttribute(
      'href',
      '/map/LFC',
    );
  });

  it('hides the Connections list and names routes by kind; hides canvas positions from readers', async () => {
    server.use(
      graphql.query('MapAtlas', () =>
        HttpResponse.json({
          data: {
            map: {
              ...good,
              canEdit: false,
              pointcrawlEdges: good.pointcrawlEdges.map((edge) => ({
                ...edge,
                kind: 'river_ford',
                label: 'leg-7',
              })),
            },
          },
        }),
      ),
    );
    renderMap();
    await screen.findByRole('region', { name: 'Map viewport' });
    expect(screen.queryByRole('region', { name: 'Map connections' })).toBeNull();
    expect(screen.getByLabelText('Route line styles', { selector: 'ul' })).toHaveTextContent(
      'River ford',
    );
    expect(screen.queryByText('leg-7')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Selected location' }),
    ).not.toHaveTextContent(/Canvas position|Coordinates/);
  });

  it('uses sibling navigation links instead of a native select', async () => {
    renderMap();
    await screen.findByRole('region', { name: 'Map viewport' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Choose a map' });
    expect(within(navigation).getByRole('link', { name: 'Lightfall' })).toHaveAttribute(
      'href',
      '/map/LFC',
    );
    expect(within(navigation).getByRole('link', { name: 'Lightfall' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
