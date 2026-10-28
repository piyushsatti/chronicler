import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { MapEditDialog } from '../../../src/features/map/components/MapEditDialog.js';
import type { MapEdit } from '../../../src/features/map/hooks/useMapEdit.js';
import * as adapter from '../../../src/features/map/adapters/mapAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/good.json';

const map = { ...good, canEdit: true };
const region = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Coast', canCreateMap: true, kind: 'charter', charterDeadline: null, documentId: null, createdAt: good.createdAt };
const location = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Harbor', slug: 'harbor', kind: 'codex_entry', category: 'Locations', effectiveBody: '' };
function show(edit: MapEdit) {
  return renderWithProviders(<MapEditDialog edit={edit} scopeKey="test" admit={() => true} onClose={vi.fn()} onSaved={async () => {}} onDenied={async () => {}} />);
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
  const rendered = renderWithProviders(<MapEditDialog edit={{ kind: 'create', global: true, regions: [region] }} scopeKey="global" admit={() => true} onClose={vi.fn()} onSaved={async () => {}} onDenied={async () => {}} />);
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
  fireEvent.submit(form());
  await waitFor(() => expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Lightfall Hexflower', atlasCode: 'LIGHTFALL-HEXFLOWER', family: 'campaign', grid: 'hex', mapKind: 'pointcrawl', assetPath: '/maps/hexflower.png' }),
    expect.any(String),
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
  fireEvent.submit(form());
  await waitFor(() => expect(update).toHaveBeenCalledWith(
    map.id,
    { name: 'Renamed map', family: map.family, grid: 'hex', assetPath: null },
    expect.any(String),
  ));
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
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location', 'Harbor');
  expect(new FormData(form()).get('documentId')).toBe(location.id);
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentId: location.id }), false, expect.any(String)));
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
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location', 'Forest');
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentId: next.id }), false, expect.any(String)));
});

it('blocks an empty required region choice before saving', async () => {
  const create = vi.spyOn(adapter, 'createMap');
  show({ kind: 'create', global: false, regions: [] });
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(create).not.toHaveBeenCalled();
});

it('saves a bare site path from the image hint as a site-root path', async () => {
  const create = vi.spyOn(adapter, 'createMap').mockResolvedValue({ id: good.id, atlasCode: 'X' });
  const created = show({ kind: 'create', global: false, regions: [region] });
  await userEvent.type(screen.getByRole('textbox', { name: /^Map name/ }), 'X');
  await userEvent.type(screen.getByRole('textbox', { name: /^Map image/ }), 'maps/x.png');
  fireEvent.submit(form());
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ assetPath: '/maps/x.png' }), expect.any(String)));
  created.unmount();
  const update = vi.spyOn(adapter, 'updateMap').mockResolvedValue({ id: map.id, atlasCode: map.atlasCode });
  show({ kind: 'map', map: { ...map, assetPath: 'maps/x.png' } });
  fireEvent.submit(form());
  await waitFor(() => expect(update).toHaveBeenCalledWith(map.id, expect.objectContaining({ assetPath: '/maps/x.png' }), expect.any(String)));
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
