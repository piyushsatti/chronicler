import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { useMe } from '../../../src/hooks/useMe.js';
import type { MemberViewModel } from '../../../src/features/member/adapters/memberAdapter.js';
import type { MapDirectory } from '../../../src/features/map/adapters/mapAdapter.js';
import { queryKeys } from '../../../src/features/map/feature.js';
import { MapPage } from '../../../src/features/map/pages/MapPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/map/good.json';
import member from '../../fixtures/wire/me/good.json';

const region = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Coast',
  kind: 'charter',
  canCreateMap: false,
  charterDeadline: null,
  documentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  createdAt: good.createdAt,
};
const document = {
  id: region.documentId,
  slug: 'coast-record',
  title: 'Shared coast record',
  kind: 'codex_entry',
  category: 'Locations',
  effectiveBody: 'The shared region document.',
};
const maps = [
  { ...good, regionId: region.id },
  { ...good, atlasCode: 'SIBLING', name: 'Sibling atlas', regionId: region.id },
];
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}
function token(actor: string) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: actor, exp: 4102444800 }))}.test`;
}
function Controls() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/map/SIBLING')}>Sibling atlas</button>
      <button onClick={() => auth.storeToken(token('B'))}>Account B</button>
    </>
  );
}
function MemberReadyMap() {
  const me = useMe();
  return me.isSuccess ? <MapPage /> : null;
}
function page(signedIn = false, siblingReady?: Promise<void>) {
  if (signedIn) {
    localStorage.setItem(TOKEN_KEY, token('A'));
    server.use(
      graphql.query('MemberMe', ({ request }) =>
        HttpResponse.json({
          data: {
            memberMe: {
              ...member,
              id: request.headers.get('authorization')?.includes(token('B'))
                ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
                : member.id,
            },
          },
        }),
      ),
    );
  }
  server.use(
    graphql.query('MapDirectory', () =>
      HttpResponse.json({ data: { maps, regions: [region] } }),
    ),
    graphql.query('MapAtlas', async ({ variables }) => {
      if (variables.atlasCode === 'SIBLING') await siblingReady;
      return HttpResponse.json({
        data: { map: maps.find((map) => map.atlasCode === variables.atlasCode) },
      });
    }),
  );
  return renderWithProviders(
    <>
      <Controls />
      <Routes>
        <Route
          path="/map/:atlasCode"
          element={signedIn ? <MemberReadyMap /> : <MapPage />}
        />
      </Routes>
    </>,
    { route: '/map/LFC' },
  );
}

describe('R16b shared region document requests', () => {
  it.each(['before', 'after'])(
    'keeps a delayed shared document when it completes %s the destination atlas loads',
    async (timing) => {
      const held = deferred();
      const sibling = deferred();
      const request = vi.fn();
      server.use(
        graphql.query('MapDocument', async () => {
          request();
          await held.promise;
          return HttpResponse.json({ data: { documentById: document } });
        }),
      );
      const { queryClient } = page(false, sibling.promise);
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      if (timing === 'after') sibling.resolve();
      fireEvent.click(screen.getByRole('button', { name: 'Sibling atlas' }));
      if (timing === 'after')
        await screen.findByRole('heading', { name: 'Sibling atlas', level: 1 });
      else await screen.findByRole('heading', { name: 'Map', level: 1 });
      await act(async () => held.resolve());
      await waitFor(() =>
        expect(queryClient.getQueryState(queryKeys.mapDocument(document.id))?.fetchStatus)
          .toBe('idle'),
      );
      await act(async () => sibling.resolve());
      await screen.findByRole('heading', { name: 'Sibling atlas', level: 1 });
      expect(await screen.findByText(document.effectiveBody)).toBeVisible();
      expect(screen.queryByText(/The region document could not load/)).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('does not cache a delayed document after its region document identity changes', async () => {
    const held = deferred();
    const requested = vi.fn();
    const replacement = {
      ...document,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: 'Replacement coast record',
      effectiveBody: 'The current region document.',
    };
    server.use(
      graphql.query('MapDocument', async ({ variables }) => {
        if (variables.id === document.id) {
          requested();
          await held.promise;
        }
        return HttpResponse.json({
          data: { documentById: variables.id === document.id ? document : replacement },
        });
      }),
    );
    const { queryClient } = page();
    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
    await act(async () => {
      queryClient.setQueryData<MapDirectory>(queryKeys.mapDirectory, (directory) =>
        directory && {
          ...directory,
          regions: [{ ...region, documentId: replacement.id }],
        },
      );
    });
    expect(await screen.findByText(replacement.effectiveBody)).toBeVisible();
    await act(async () => held.resolve());
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.mapDocument(document.id))?.fetchStatus)
        .toBe('idle'),
    );
    expect(queryClient.getQueryData(queryKeys.mapDocument(document.id))).toBeUndefined();
    expect(screen.queryByText(document.effectiveBody)).toBeNull();
  });

  it.each(['account change', 'member identity change', 'unmount'])(
    'does not publish a delayed document after %s',
    async (change) => {
      const held = deferred();
      const requested = vi.fn();
      server.use(
        graphql.query('MapDocument', async () => {
          if (requested.mock.calls.length === 0) {
            requested();
            await held.promise;
            return HttpResponse.json({ data: { documentById: document } });
          }
          return HttpResponse.json({ data: { documentById: null } });
        }),
      );
      const { queryClient, unmount } = page(true);
      await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
      if (change === 'unmount') unmount();
      else {
        if (change === 'account change')
          fireEvent.click(screen.getByRole('button', { name: 'Account B' }));
        else
          await act(async () => {
            queryClient.setQueryData<MemberViewModel>(['me'], (current) =>
              current && { ...current, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
            );
          });
        await waitFor(() =>
          expect(queryClient.getQueryData(queryKeys.mapDocument(document.id))).toBeNull(),
        );
      }
      await act(async () => held.resolve());
      await waitFor(() =>
        expect(queryClient.getQueryState(queryKeys.mapDocument(document.id))?.fetchStatus)
          .not.toBe('fetching'),
      );
      expect(queryClient.getQueryData(queryKeys.mapDocument(document.id))).toBe(
        change === 'unmount' ? undefined : null,
      );
      expect(screen.queryByText(document.effectiveBody)).toBeNull();
    },
  );
});
