import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { MapKey } from '../../../src/features/map/components/MapKey.js';
import { MapPanelBody } from '../../../src/features/map/components/MapPanelBody.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/good.json';

const first = good.pointcrawlNodes[0]!;
const region = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Coast',
  kind: 'charter',
  canCreateMap: false,
  charterDeadline: null,
  documentId: null,
  createdAt: good.createdAt,
};
const document = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  slug: 'coast-record',
  title: 'A real region record',
  kind: 'codex_entry',
  category: 'Locations',
  effectiveBody: 'A real excerpt from the region document.',
};
function page(documentId: string | null = document.id) {
  const map = { ...good, regionId: region.id };
  server.use(
    graphql.query('MapDirectory', () =>
      HttpResponse.json({
        data: { maps: [map], regions: [{ ...region, documentId }] },
      }),
    ),
    graphql.query('MapAtlas', () => HttpResponse.json({ data: { map } })),
    graphql.query('MapDocument', ({ variables }) => {
      expect(variables.id).toBe(document.id);
      return HttpResponse.json({ data: { documentById: document } });
    }),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/map/:atlasCode" element={<MapPage />} />
    </Routes>,
    { route: '/map/LFC' },
  );
}
function desktop() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('hover: hover'),
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe('B5 always-on map panel', () => {
  it('reads the map region document by its real document ID before a place is selected', async () => {
    page();
    const panel = await screen.findByRole('region', { name: 'Map region' });
    expect(within(panel).getByRole('heading', { name: region.name })).toBeVisible();
    expect(
      await within(panel).findByRole('heading', { name: document.title }),
    ).toBeVisible();
    expect(within(panel).getByText(document.effectiveBody)).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Open in Codex' })).toHaveAttribute(
      'href',
      '/codex/coast-record',
    );
    expect(panel).toHaveTextContent('3 places');
    expect(panel).toHaveTextContent('1 route');
    expect(within(panel).getByText('Choose a place to see its stories.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Region overview' })).toHaveAttribute(
      'href',
      `/regions/${region.id}`,
    );
    expect(
      screen.getByRole('region', { name: 'Map locations' }).querySelector('details'),
    ).not.toHaveAttribute('open');
    expect(
      screen.getByRole('region', { name: 'Map connections' }).querySelector('details'),
    ).not.toHaveAttribute('open');
  });

  it('shows only region name, counts and hint when the region has no document', async () => {
    const request = vi.fn();
    page(null);
    server.use(
      graphql.query('MapDocument', () => {
        request();
        return HttpResponse.json({ data: { documentById: document } });
      }),
    );
    const panel = await screen.findByRole('region', { name: 'Map region' });
    expect(within(panel).getByRole('heading', { name: region.name })).toBeVisible();
    expect(panel).toHaveTextContent('3 places');
    expect(panel).toHaveTextContent('1 route');
    expect(within(panel).getByText('Choose a place to see its stories.')).toBeVisible();
    expect(within(panel).queryByRole('link', { name: 'Open in Codex' })).toBeNull();
    expect(within(panel).queryByRole('region', { name: 'Region document' })).toBeNull();
    expect(within(panel).queryByRole('alert')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('changes only panel content and returns to the region with pin focus on close or Escape from the map', async () => {
    page();
    const graph = await screen.findByRole('group', {
      name: 'Lightfall pointcrawl graph',
    });
    const frame = graph.parentElement;
    const viewBox = graph.getAttribute('viewBox');
    const pin = within(graph).getByRole('button', { name: first.name });
    fireEvent.click(pin);
    const selected = screen.getByRole('region', { name: 'Selected location' });
    expect(selected).toHaveAttribute('data-map-panel', 'true');
    expect(selected).toHaveTextContent(first.name);
    expect(graph.parentElement).toBe(frame);
    expect(graph).toHaveAttribute('viewBox', viewBox);
    expect(screen.getByRole('button', { name: 'Close place details' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }));
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
    expect(pin).toHaveFocus();
    fireEvent.click(pin);
    act(() => pin.focus());
    fireEvent.keyDown(pin, { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
    expect(pin).toHaveFocus();
    expect(graph.parentElement).toBe(frame);
    expect(graph).toHaveAttribute('viewBox', viewBox);
  });

  it('scrolls the stacked panel into view on phone selection and keeps map coordinates intact', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width') || query.includes('reduced-motion'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      page(null);
      const graph = await screen.findByRole('group', {
        name: 'Lightfall pointcrawl graph',
      });
      const initial = graph.getAttribute('viewBox');
      fireEvent.click(within(graph).getByRole('button', { name: first.name }));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      expect(graph).toHaveAttribute('viewBox', initial);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('lets an expanded key consume Escape before a selected place closes', async () => {
    page(null);
    const graph = await screen.findByRole('group', {
      name: 'Lightfall pointcrawl graph',
    });
    fireEvent.click(within(graph).getByRole('button', { name: first.name }));
    const key = screen.getByRole('button', { name: 'Key to route line styles' });
    fireEvent.click(key);
    fireEvent.keyDown(key, { key: 'Escape' });
    expect(key).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Selected location' })).toBeVisible();
    fireEvent.keyDown(key, { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'Map region' })).toBeVisible();
  });
});

describe('B5 map key', () => {
  it('starts collapsed, lists only used kinds, toggles on tap, and closes with Escape', () => {
    render(<MapKey edges={good.pointcrawlEdges} />);
    const key = screen.getByRole('button', { name: 'Key to route line styles' });
    expect(key).toHaveAttribute('aria-expanded', 'false');
    const list = window.document.getElementById(key.getAttribute('aria-controls')!);
    expect(list).toHaveAttribute('hidden');
    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-expanded', 'true');
    expect(list).not.toHaveAttribute('hidden');
    expect(screen.getByRole('list', { name: 'Route line styles' })).toHaveTextContent(
      'Path',
    );
    expect(screen.queryByText('Road')).toBeNull();
    expect(screen.queryByText('Trail')).toBeNull();
    expect(screen.queryByText('One-way')).toBeNull();
    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(key);
    fireEvent.keyDown(key, { key: 'Escape' });
    expect(key).toHaveAttribute('aria-expanded', 'false');
  });

  it('previews on desktop hover and keyboard focus, pins on click and stays closed after a second click or Escape', () => {
    desktop();
    render(<MapKey edges={good.pointcrawlEdges} />);
    const key = screen.getByRole('button', { name: 'Key to route line styles' });
    const box = key.parentElement!;
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    expect(key).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(key);
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    expect(key).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    expect(key).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(key, { key: 'Escape' });
    expect(key).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    act(() => key.focus());
    expect(key).toHaveAttribute('aria-expanded', 'true');
    fireEvent.blur(key);
    expect(key).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not treat touch pointers or touch focus as desktop previews', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<MapKey edges={good.pointcrawlEdges} />);
    const key = screen.getByRole('button', { name: 'Key to route line styles' });
    fireEvent.pointerEnter(key.parentElement!, { pointerType: 'touch' });
    fireEvent.focus(key);
    expect(key).toHaveAttribute('aria-expanded', 'false');
    for (let index = 0; index < 4; index++) {
      fireEvent.click(key);
      expect(key).toHaveAttribute('aria-expanded', String(index % 2 === 0));
    }
  });
});

it('updates panel fades at the actual scroll edges', () => {
  render(
    <MapPanelBody>
      <p>Long real text</p>
    </MapPanelBody>,
  );
  const scroll = screen.getByRole('region', { name: 'Region and place stories' });
  Object.defineProperties(scroll, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 300 },
  });
  fireEvent.scroll(scroll);
  expect(scroll).toHaveAttribute('data-scroll-start', 'false');
  expect(scroll).toHaveAttribute('data-scroll-end', 'true');
  scroll.scrollTop = 100;
  fireEvent.scroll(scroll);
  expect(scroll).toHaveAttribute('data-scroll-start', 'true');
  expect(scroll).toHaveAttribute('data-scroll-end', 'true');
  scroll.scrollTop = 200;
  fireEvent.scroll(scroll);
  expect(scroll).toHaveAttribute('data-scroll-start', 'true');
  expect(scroll).toHaveAttribute('data-scroll-end', 'false');
});
