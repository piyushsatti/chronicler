import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { Profiler, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { server } from '../../../src/mocks/server.js';
import { useSeriesPage } from '../../../src/hooks/useSeriesPage.js';
import { SeriesCreateAction } from '../../../src/components/domain/SeriesCreateAction.js';
import { currentAccessIdentity } from '../../../src/auth/useCurrentAccess.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/onboarding/retained-good.json';

const actor = {
  id: good.arc.createdBy,
  handle: 'fixture-dm',
  displayName: 'Fixture DM',
  roles: ['dm'],
};
function token(subject: string) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
}
beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, token('one'));
  server.use(
    graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: actor } })),
    graphql.query('CurrentAdminAccess', () =>
      HttpResponse.json({
        errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
      }),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/series/${good.arc.id}`]}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return {
    client,
    ...renderHook(
      () => ({
        auth: useAuth(),
        series: useSeriesPage(good.arc.id),
        location: useLocation(),
      }),
      { wrapper },
    ),
  };
}
async function ready(result: ReturnType<typeof setup>['result']) {
  await waitFor(() => expect(result.current.series.canCreate).toBe(true));
}

describe('Series session-bound command admission', () => {
  it('rejects a retained create callback after the current authority response revokes creation', async () => {
    let approved = true;
    let writes = 0;
    server.use(
      graphql.query('RetainedSeriesAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: actor.id, roles: ['dm'], status: 'active' },
              dmProfile: { status: approved ? 'approved' : 'pending' },
            },
          },
        }),
      ),
      graphql.mutation('RetainedUpsertArc', () => {
        writes++;
        return HttpResponse.json({ data: { upsertQuestArc: good.arc } });
      }),
    );
    const { result, unmount, client } = setup();
    await ready(result);
    const retained = result.current.series.save;
    approved = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['seriesAuthority'] });
    });
    await waitFor(() => expect(result.current.series.canCreate).toBe(false));
    await act(async () => {
      expect(await retained(null, 'Revoked series')).toBe(false);
    });
    expect(writes).toBe(0);
    unmount();
    client.clear();
  });

  it('reacts to delayed approved-DM proof and removes the real create form on a same-token authority refetch', async () => {
    const other = { ...actor, id: good.document.id, handle: 'other-approved-dm' };
    const canonicalToken = `${btoa('{}')}.${btoa(JSON.stringify({ member_id: other.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
    localStorage.setItem(TOKEN_KEY, canonicalToken);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let approved = true;
    let reads = 0;
    server.use(
      graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: other } })),
      graphql.query('RetainedSeriesAuthority', async () => {
        reads++;
        if (reads === 1) await held;
        return HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: other.id, roles: ['dm'], status: 'active' },
              dmProfile: { status: approved ? 'approved' : 'pending' },
            },
          },
        });
      }),
    );
    const key = ['seriesAuthority', currentAccessIdentity(other)];
    const observer: { client?: ReturnType<typeof createTestQueryClient> } = {};
    const commits: Array<{ canCreate: boolean; createFormVisible: boolean }> = [];
    const view = renderWithProviders(
      <Profiler
        id="series"
        onRender={() => {
          const state = observer.client?.getQueryState<{ canCreate: boolean }>(key);
          if (state?.status === 'success')
            commits.push({
              canCreate: Boolean(state.data?.canCreate),
              createFormVisible:
                screen.queryByRole('button', { name: 'Create series' }) !== null,
            });
        }}
      >
        <Routes>
          <Route path="/quests" element={<SeriesCreateAction />} />
        </Routes>
      </Profiler>,
      { route: '/quests' },
    );
    const client = view.queryClient;
    observer.client = client;
    await waitFor(() => {
      expect(reads).toBe(1);
      expect(client?.getQueryState(['me'])?.fetchStatus).toBe('idle');
      expect(client?.getQueryState(['series', ''])?.fetchStatus).toBe('idle');
      expect(
        client?.getQueryState(['currentAccess', 'admin', currentAccessIdentity(other)])
          ?.status,
      ).toBe('success');
    });
    expect(
      screen.queryByRole('button', { name: 'Create series' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() =>
      expect(client?.getQueryData(key)).toMatchObject({
        memberId: other.id,
        canCreate: true,
      }),
    );
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'New series' }));
    expect(await screen.findByRole('button', { name: 'Create series' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save series name' }),
    ).not.toBeInTheDocument();
    expect(commits.some((commit) => commit.canCreate && commit.createFormVisible)).toBe(
      true,
    );
    commits.length = 0;
    approved = false;
    await act(async () => {
      await client?.refetchQueries({ queryKey: key, exact: true });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Create series' }),
      ).not.toBeInTheDocument(),
    );
    expect(reads).toBe(2);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(canonicalToken);
    const revokedCommits = commits.filter((commit) => !commit.canCreate);
    expect(revokedCommits.length).toBeGreaterThan(0);
    expect(revokedCommits.every((commit) => !commit.createFormVisible)).toBe(true);
    view.unmount();
    client.clear();
  });

  it('checks the captured account in the mutation microtask and rejects retained callbacks after switch', async () => {
    let writes = 0;
    server.use(
      graphql.mutation('RetainedUpsertArc', () => {
        writes++;
        return HttpResponse.error();
      }),
    );
    const { result, unmount, client } = setup();
    await ready(result);
    const retained = result.current.series.save;
    await act(async () => {
      const save = retained(null, 'New series');
      result.current.auth.storeToken(token('two'));
      expect(await save).toBe(false);
    });
    await ready(result);
    await act(async () => {
      expect(await retained(null, 'Old callback')).toBe(false);
    });
    expect(writes).toBe(0);
    expect(result.current.series.error).toBeNull();
    unmount();
    client.clear();
  });
  it('rejects expiry before the logout timer renders', async () => {
    let writes = 0;
    server.use(
      graphql.mutation('RetainedUpsertArc', () => {
        writes++;
        return HttpResponse.error();
      }),
    );
    const { result, unmount, client } = setup();
    await ready(result);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
    await act(async () => {
      expect(await result.current.series.save(null, 'Expired')).toBe(false);
    });
    expect(writes).toBe(0);
    expect(result.current.series.error).toBeNull();
    unmount();
    client.clear();
  });
  for (const outcome of ['success', 'failure']) {
    it(`suppresses late ${outcome} navigation, callback and cache/error effects after logout`, async () => {
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let dispatched = false;
      server.use(
        graphql.mutation('RetainedUpsertArc', async () => {
          dispatched = true;
          await gate;
          return outcome === 'success'
            ? HttpResponse.json({ data: { upsertQuestArc: good.arc } })
            : HttpResponse.json({
                errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
              });
        }),
      );
      const { result, unmount, client } = setup();
      await ready(result);
      let completed = Promise.resolve(false);
      let callbacks = 0;
      act(() => {
        completed = result.current.series.save(null, 'Late series', () => {
          callbacks++;
        });
      });
      await waitFor(() => expect(dispatched).toBe(true));
      act(() => result.current.auth.logout());
      client.setQueryData(['series', 'new-account-sentinel'], { marker: true });
      await act(async () => {
        release();
        expect(await completed).toBe(false);
      });
      expect(result.current.location.pathname).toBe(`/series/${good.arc.id}`);
      expect(result.current.series.error).toBeNull();
      expect(result.current.series.pending).toBe(false);
      expect(callbacks).toBe(0);
      expect(
        client.getQueryState(['series', 'new-account-sentinel'])?.isInvalidated,
      ).toBe(false);
      expect(client.getQueryData(['me'])).toBeUndefined();
      unmount();
      client.clear();
    });
  }
  it('never shares an ambiguous retry key with another validated session', async () => {
    const keys: unknown[] = [];
    server.use(
      graphql.mutation('RetainedUpsertArc', ({ variables }) => {
        keys.push(variables.meta.idempotencyKey);
        return HttpResponse.error();
      }),
    );
    const { result, unmount, client } = setup();
    await ready(result);
    await act(async () => {
      expect(await result.current.series.save(null, 'Same payload')).toBe(false);
    });
    act(() => result.current.auth.storeToken(token('two')));
    await ready(result);
    await act(async () => {
      expect(await result.current.series.save(null, 'Same payload')).toBe(false);
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    unmount();
    client.clear();
  });
  it('admits configured-owner capabilities from actual server proof without an admin role', async () => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...actor, id: good.document.id, roles: ['player'] } },
        }),
      ),
      graphql.query('RetainedSeriesAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: good.document.id, roles: ['player'], status: 'active' },
              dmProfile: null,
            },
          },
        }),
      ),
      graphql.query('CurrentAdminAccess', () =>
        HttpResponse.json({ data: { adminOperations: { activeAlertCount: 0 } } }),
      ),
    );
    const { result, unmount, client } = setup();
    await ready(result);
    await waitFor(() => expect(result.current.series.canRename).toBe(true));
    unmount();
    client.clear();
  });
});
