import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { TransportError } from '../../../src/errors/types.js';
import { MapEditDialog } from '../../../src/features/map/components/MapEditDialog.js';
import type { MapEdit } from '../../../src/features/map/hooks/useMapEdit.js';
import * as adapter from '../../../src/features/map/adapters/mapAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import good from '../../fixtures/wire/map/goodMap.js';

const map = { ...good, canEdit: true };
const region = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Coast', canCreateMap: true, kind: 'charter', charterDeadline: null, documentId: null, createdAt: good.createdAt };
const location = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Harbor', slug: 'harbor', kind: 'codex_entry', category: 'Locations', effectiveBody: '' };
// The fenced write carries the session token and an idempotency key.
const command = expect.objectContaining({ token: expect.any(String), idempotencyKey: expect.any(String) });
// Writes are fenced to a loaded member, so each submit waits for /me first.
let rendered: ReturnType<typeof renderWithProviders> | undefined;
function renderSignedIn(...args: Parameters<typeof renderWithProviders>) {
  rendered = renderWithProviders(...args);
  return rendered;
}
async function ready() {
  await waitFor(() => expect(rendered?.queryClient.getQueryState(queryKeys.me)?.status).toBe('success'));
}
function show(edit: MapEdit) {
  return renderSignedIn(<MapEditDialog edit={edit} scopeKey="test" admit={() => true} onClose={vi.fn()} onSaved={async () => {}} onDenied={async () => {}} />);
}
function form() {
  const value = screen.getByRole('button', { name: 'Save' }).closest('form');
  if (!value) throw new Error('Map form missing');
  return value;
}
async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: option }));
}
beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'map-editor', exp: 4102444800 }))}.test`);
});
afterEach(() => vi.restoreAllMocks());

it('keeps the default region and updates the hidden FormData value through the menu', async () => {
  const second = { ...region, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Forest' };
  show({ kind: 'create', global: false, regions: [region, second] });
  expect(new FormData(form()).get('regionId')).toBe(region.id);
  expect(screen.getByRole('button', { name: /^Region/ })).toHaveAccessibleDescription('Required');
  await choose('Region', 'Forest');
  expect(new FormData(form()).get('regionId')).toBe(second.id);
});

it('preserves the optional global-map choice and the selected submap', async () => {
  const child = { ...map, id: region.id, name: 'Lower harbor' };
  const rendered = renderSignedIn(<MapEditDialog edit={{ kind: 'create', global: true, regions: [region] }} scopeKey="global" admit={() => true} onClose={vi.fn()} onSaved={async () => {}} onDenied={async () => {}} />);
  expect(new FormData(form()).get('regionId')).toBe('');
  expect(screen.getByRole('button', { name: /^Region/ })).not.toHaveAccessibleDescription('Required');
  rendered.unmount();
  show({ kind: 'node', map, node: { ...good.pointcrawlNodes[0]!, submapId: child.id }, maps: [map, child] });
  expect(new FormData(form()).get('submapId')).toBe(child.id);
  await choose('Submap', 'No submap');
  expect(new FormData(form()).get('submapId')).toBe('');
});

it('creates a hex map with a plain-word address, group and image address', async () => {
  const create = vi.spyOn(adapter, 'createMap').mockResolvedValue({ id: good.id, atlasCode: 'LIGHTFALL-HEXFLOWER' });
  show({ kind: 'create', global: false, regions: [region] });
  expect(screen.getByText('Type of map')).toBeVisible();
  expect(screen.getByText('Map address')).toBeVisible();
  expect(screen.getByText('Map group')).toBeVisible();
  expect(screen.queryByText('Atlas code')).toBeNull();
  expect(screen.queryByText('Family')).toBeNull();
  expect(new FormData(form()).get('grid')).toBe('point');
  expect(new FormData(form()).get('family')).toBe('campaign');
  await userEvent.click(screen.getByRole('button', { name: 'Hex map' }));
  expect(new FormData(form()).get('grid')).toBe('hex');
  await userEvent.type(screen.getByRole('textbox', { name: /^Map name/ }), 'Lightfall Hexflower');
  await userEvent.type(screen.getByRole('textbox', { name: /^Map image/ }), '/maps/hexflower.png');
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Lightfall Hexflower', atlasCode: 'LIGHTFALL-HEXFLOWER', family: 'campaign', grid: 'hex', mapKind: 'pointcrawl', assetPath: '/maps/hexflower.png' }),
    command,
  ));
});

it('edits a map: shows its current values and saves name, type, group and image', async () => {
  const update = vi.spyOn(adapter, 'updateMap').mockResolvedValue({ id: map.id, atlasCode: map.atlasCode });
  show({ kind: 'map', map: { ...map, assetPath: '/maps/old.png' } });
  expect(screen.getByRole('dialog', { name: 'Edit map' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: /^Map name/ })).toHaveValue(map.name);
  expect(screen.getByRole('textbox', { name: /^Map image/ })).toHaveValue('/maps/old.png');
  expect(screen.queryByText('Map address')).toBeNull();
  await userEvent.clear(screen.getByRole('textbox', { name: /^Map name/ }));
  await userEvent.type(screen.getByRole('textbox', { name: /^Map name/ }), 'Renamed map');
  await userEvent.click(screen.getByRole('button', { name: 'Hex map' }));
  await userEvent.clear(screen.getByRole('textbox', { name: /^Map image/ }));
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(update).toHaveBeenCalledWith(
    map.id,
    { name: 'Renamed map', family: map.family, grid: 'hex', assetPath: null },
    command,
  ));
});

it('closes after a successful save when onSaved re-renders with a new callback identity', async () => {
  vi.spyOn(adapter, 'updateMap').mockResolvedValue({ id: map.id, atlasCode: map.atlasCode });
  const onClose = vi.fn();
  function WarmSave() {
    const [, bump] = useState(0);
    return (
      <MapEditDialog
        edit={{ kind: 'map', map }}
        scopeKey="warm"
        admit={() => true}
        onClose={onClose}
        onSaved={async () => {
          bump((n) => n + 1);
        }}
        onDenied={async () => {}}
      />
    );
  }
  renderSignedIn(<WarmSave />);
  expect(screen.getByRole('dialog', { name: 'Edit map' })).toBeVisible();
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('keeps Save and Cancel blocked until onSaved finishes', async () => {
  let finishSaved!: () => void;
  const onSaved = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSaved = resolve;
      }),
  );
  const onClose = vi.fn();
  vi.spyOn(adapter, 'updateMap').mockResolvedValue({ id: map.id, atlasCode: map.atlasCode });
  renderSignedIn(
    <MapEditDialog
      edit={{ kind: 'map', map }}
      scopeKey="pending-reload"
      admit={() => true}
      onClose={onClose}
      onSaved={onSaved}
      onDenied={async () => {}}
    />,
  );
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(onClose).not.toHaveBeenCalled();
  finishSaved();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
});

it('does not call onDenied when a save fails after unmount', async () => {
  let fail!: (cause: unknown) => void;
  vi.spyOn(adapter, 'updateMap').mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  const onDenied = vi.fn(async () => {});
  const view = renderSignedIn(
    <MapEditDialog
      edit={{ kind: 'map', map }}
      scopeKey="fail-unmount"
      admit={() => true}
      onClose={vi.fn()}
      onSaved={async () => {}}
      onDenied={onDenied}
    />,
  );
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(fail).toEqual(expect.any(Function)));
  const errors: unknown[] = [];
  const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args);
  });
  view.unmount();
  fail(new TransportError('FORBIDDEN', { status: 403 }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(onDenied).not.toHaveBeenCalled();
  expect(
    errors.filter((args) =>
      String(args).includes("Can't perform a React state update on a component"),
    ),
  ).toEqual([]);
  error.mockRestore();
});

it('prefills the position when a location is added from a right-click', () => {
  show({ kind: 'node', map, node: null, maps: [map], at: { x: 120.5, y: 48.25 } });
  expect(screen.getByRole('dialog', { name: 'Add location' })).toBeVisible();
  expect(new FormData(form()).get('x')).toBe('120.5');
  expect(new FormData(form()).get('y')).toBe('48.25');
});

it('names the hex map place a hex, never a location', () => {
  show({ kind: 'node', map: { ...map, grid: 'hex' }, node: good.pointcrawlNodes[0]!, maps: [map] });
  expect(screen.getByRole('dialog', { name: 'Edit hex' })).toBeVisible();
  expect(screen.getByText('Hex number')).toBeVisible();
  expect(screen.queryByText('Location name')).toBeNull();
});

it('requires a Location, then submits the menu choice', async () => {
  server.use(graphql.query('MapLocationDocuments', () => HttpResponse.json({ data: { documents: { items: [location], total: 1 } } })));
  const save = vi.spyOn(adapter, 'changeEntry').mockResolvedValue(undefined);
  show({ kind: 'link', map, node: good.pointcrawlNodes[0]! });
  await screen.findByRole('button', { name: /^Location/ });
  await ready();
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location', 'Harbor');
  expect(new FormData(form()).get('documentId')).toBe(location.id);
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentId: location.id }), false, command));
});

it.each(['search', 'page'] as const)('clears a selected document when the result %s changes', async (change) => {
  const next = { ...location, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Forest' };
  server.use(graphql.query('MapLocationDocuments', ({ variables }) => HttpResponse.json({
    data: { documents: { total: 51, items: variables.search || variables.offset ? [next] : [location] } },
  })));
  const save = vi.spyOn(adapter, 'changeEntry').mockResolvedValue(undefined);
  show({ kind: 'link', map, node: good.pointcrawlNodes[0]! });
  await screen.findByRole('button', { name: /^Location/ });
  await choose('Location', 'Harbor');
  if (change === 'search') await userEvent.type(screen.getByRole('textbox', { name: 'Find Locations' }), 'Forest');
  else await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Location/ })).toHaveTextContent('Choose a Location'));
  expect(new FormData(form()).get('documentId')).toBe('');
  await ready();
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location', 'Forest');
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentId: next.id }), false, command));
});

it('blocks an empty required region choice before saving', async () => {
  const create = vi.spyOn(adapter, 'createMap');
  show({ kind: 'create', global: false, regions: [] });
  await ready();
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(create).not.toHaveBeenCalled();
});

it('saves a bare site path from the image hint as a site-root path', async () => {
  const create = vi.spyOn(adapter, 'createMap').mockResolvedValue({ id: good.id, atlasCode: 'X' });
  const created = show({ kind: 'create', global: false, regions: [region] });
  await userEvent.type(screen.getByRole('textbox', { name: /^Map name/ }), 'X');
  await userEvent.type(screen.getByRole('textbox', { name: /^Map image/ }), 'maps/x.png');
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ assetPath: '/maps/x.png' }), command));
  created.unmount();
  const update = vi.spyOn(adapter, 'updateMap').mockResolvedValue({ id: map.id, atlasCode: map.atlasCode });
  show({ kind: 'map', map: { ...map, assetPath: 'maps/x.png' } });
  await ready();
  fireEvent.submit(form());
  await waitFor(() => expect(update).toHaveBeenCalledWith(map.id, expect.objectContaining({ assetPath: '/maps/x.png' }), command));
});

it('keeps Previous when the list shrinks to one page while on the second page', async () => {
  server.use(graphql.query('MapLocationDocuments', ({ variables }) => HttpResponse.json({
    data: { documents: variables.offset ? { total: 50, items: [] } : { total: 51, items: [location] } },
  })));
  show({ kind: 'link', map, node: good.pointcrawlNodes[0]! });
  await screen.findByRole('button', { name: /^Location/ });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('50 to choose from');
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('51 to choose from');
  await choose('Location', 'Harbor');
  expect(new FormData(form()).get('documentId')).toBe(location.id);
});
