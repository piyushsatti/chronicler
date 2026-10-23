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
  renderWithProviders(<MapEditDialog edit={edit} scopeKey="test" admit={() => true} onClose={vi.fn()} onSaved={async () => {}} onDenied={async () => {}} />);
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

it('submits the default endpoints and changed endpoint values from the hidden inputs', async () => {
  const save = vi.spyOn(adapter, 'saveEdge').mockResolvedValue({ id: good.pointcrawlEdges[0]!.id });
  show({ kind: 'edge', map, edge: null, nodes: good.pointcrawlNodes });
  expect(new FormData(form()).get('nodeA')).toBe(good.pointcrawlNodes[0]!.id);
  expect(new FormData(form()).get('nodeB')).toBe(good.pointcrawlNodes[1]!.id);
  await choose('From location', 'River Crossing');
  await choose('To location', 'Lightfall Gate');
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(map.id, expect.objectContaining({ nodeA: good.pointcrawlNodes[2]!.id, nodeB: good.pointcrawlNodes[0]!.id }), expect.any(String)));
});

it('requires a Location document, then submits the menu choice', async () => {
  server.use(graphql.query('MapLocationDocuments', () => HttpResponse.json({ data: { documents: { items: [location], total: 1 } } })));
  const save = vi.spyOn(adapter, 'changeEntry').mockResolvedValue(undefined);
  show({ kind: 'link', map, node: good.pointcrawlNodes[0]! });
  await screen.findByRole('button', { name: /^Location document/ });
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location document', 'Harbor');
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
  await screen.findByRole('button', { name: /^Location document/ });
  await choose('Location document', 'Harbor');
  if (change === 'search') await userEvent.type(screen.getByRole('textbox', { name: 'Find Location documents' }), 'Forest');
  else await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Location document/ })).toHaveTextContent('Choose a readable Location document'));
  expect(new FormData(form()).get('documentId')).toBe('');
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(save).not.toHaveBeenCalled();
  await choose('Location document', 'Forest');
  fireEvent.submit(form());
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentId: next.id }), false, expect.any(String)));
});

it.each(['create', 'edge'] as const)('blocks an empty required %s choice before saving', async (kind) => {
  const create = vi.spyOn(adapter, 'createMap');
  const edge = vi.spyOn(adapter, 'saveEdge');
  show(kind === 'create' ? { kind, global: false, regions: [] } : { kind, map, edge: null, nodes: [] });
  fireEvent.submit(form());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please select an item in the list.');
  expect(create).not.toHaveBeenCalled();
  expect(edge).not.toHaveBeenCalled();
});
