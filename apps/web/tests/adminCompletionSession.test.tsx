import type { ReactNode } from 'react';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '../src/auth/AuthContext.js';
import { createTestQueryClient } from '../src/providers.js';
import { queryKeys } from '../src/api/queryKeys.js';
import { server } from '../src/mocks/server.js';
import { AdminWorldPage } from '../src/features/admin/pages/AdminSectionPage.js';
import { useRegionsPanel } from '../src/features/admin/hooks/useRegionsPanel.js';
import { useAdminAuthority } from '../src/features/admin/hooks/useAdminAuthority.js';
import { loadAllAdminRegions } from '../src/features/admin/adapters/adminAdapter.js';
import { renderWithProviders } from './test-utils.js';
import { signIn } from './features/admin/authority-test-utils.js';
import goodMe from './fixtures/wire/me/good.json';
const secondToken = () =>
  `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'same-member-new-session', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;

function ReplaceSession() {
  const auth = useAuth();
  return (
    <button type="button" onClick={() => auth.storeToken(secondToken())}>
      Replace session
    </button>
  );
}

describe('Admin workspace session subtree', () => {
  it('resets unsaved World form state on token replacement even for the same validated account', async () => {
    signIn();
    let validations = 0;
    server.use(
      graphql.query('MemberMe', () => {
        validations++;
        return HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: ['admin'] } },
        });
      }),
    );
    renderWithProviders(
      <>
        <ReplaceSession />
        <AdminWorldPage />
      </>,
      { route: '/admin/world' },
    );
    const name = await screen.findByLabelText('Name', {}, { timeout: 10_000 });
    await userEvent.type(name, 'Unsaved region name');
    expect(name).toHaveValue('Unsaved region name');
    await userEvent.click(screen.getByRole('button', { name: 'Replace session' }));
    await waitFor(() => expect(validations).toBeGreaterThan(1), { timeout: 10_000 });
    // The field unmounts with the old session and comes back empty.
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''), {
      timeout: 10_000,
    });
    expect(screen.getByRole('button', { name: 'Create region' })).toBeDisabled();
    // Three 10s waits, plus typing the unsaved name between them.
  }, 45_000);
  it.each(['success', 'failure'] as const)(
    'does not publish a late %s assignment read into the next session',
    async (outcome) => {
      signIn();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = false;
      server.use(
        graphql.query('ArchonAssignments', async () => {
          started = true;
          await gate;
          return outcome === 'success'
            ? HttpResponse.json({
                data: {
                  archonAssignments: {
                    total: 1,
                    items: [
                      {
                        memberId: goodMe.id,
                        regionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
                      },
                    ],
                  },
                },
              })
            : HttpResponse.json({
                errors: [
                  { message: 'Old session failure', extensions: { code: 'FORBIDDEN' } },
                ],
              });
        }),
      );
      const client = createTestQueryClient();
      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={client}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        );
      }
      const { result } = renderHook(
        () => ({ auth: useAuth(), panel: useRegionsPanel() }),
        { wrapper: Wrapper },
      );
      await waitFor(() => expect(result.current.panel.regions.data?.[0]).toBeDefined());
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.panel.beginEdit(result.current.panel.regions.data![0]);
      });
      await waitFor(() => expect(started).toBe(true));
      act(() => result.current.auth.storeToken(secondToken()));
      await waitFor(() => expect(result.current.panel.regions.data?.[0]).toBeDefined());
      await act(async () => {
        release();
        await pending;
      });
      expect(result.current.panel.editing?.status).toBe('loading');
      expect(result.current.panel.message).toBeNull();
    },
  );
});

const lifecycleRegion = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'First frontier',
  kind: 'uncharted',
  documentId: '22222222-2222-4222-8222-222222222222',
  charterDeadline: '2027-01-01T00:00:00.123456Z',
  createdAt: '2026-10-01T00:00:00Z',
};
const otherRegion = {
  ...lifecycleRegion,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Other frontier',
};

function renderRegionHook() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return {
    client,
    ...renderHook(() => ({ auth: useAuth(), panel: useRegionsPanel() }), {
      wrapper: Wrapper,
    }),
  };
}

function RegionOptionsProbe() {
  const authority = useAdminAuthority();
  const options = useQuery({
    queryKey: ['adminRegionOptions', authority.cacheKey],
    enabled: authority.allowed,
    queryFn: ({ signal }) => authority.read(loadAllAdminRegions, signal),
  });
  return (
    <p data-testid="region-options">
      {options.data?.map((row) => `${row.name}:${row.kind}`).join(', ')}
    </p>
  );
}

describe('Region lifecycle command isolation', () => {
  it.each(['Cancel', 'Escape'])(
    'refreshes committed state and active options after pending %s without stale feedback',
    async (dismissal) => {
      signIn();
      let current = { ...lifecycleRegion };
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = false;
      const reads: number[] = [];
      server.use(
        graphql.query('AdminRegions', ({ variables }) => {
          reads.push(variables.limit);
          return HttpResponse.json({ data: { regions: [current, otherRegion] } });
        }),
        graphql.mutation('TransitionRegion', async () => {
          started = true;
          await gate;
          current = { ...current, kind: 'archon' };
          return HttpResponse.json({ data: { transitionRegion: current } });
        }),
      );
      renderWithProviders(
        <>
          <AdminWorldPage />
          <RegionOptionsProbe />
        </>,
        { route: '/admin/world' },
      );
      try {
        const item = (
          await screen.findByText('First frontier', { exact: true })
        ).closest('li');
        if (!(item instanceof HTMLElement)) throw new Error('Region row missing');
        await waitFor(() =>
          expect(screen.getByTestId('region-options')).toHaveTextContent(
            'First frontier:uncharted',
          ),
        );
        await userEvent.click(
          within(item).getByRole('button', { name: 'Advance to Archon' }),
        );
        const dialog = screen.getByRole('dialog');
        await userEvent.click(
          within(dialog).getByRole('button', { name: 'Advance region' }),
        );
        await waitFor(() => expect(started).toBe(true));
        if (dismissal === 'Cancel')
          await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        else await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => release());
        expect(
          await within(item).findByRole('button', { name: 'Advance to Server' }),
        ).toBeEnabled();
        await waitFor(() =>
          expect(screen.getByTestId('region-options')).toHaveTextContent(
            'First frontier:archon',
          ),
        );
        expect(reads.filter((limit) => limit === 51).length).toBeGreaterThan(1);
        expect(reads.filter((limit) => limit === 100).length).toBeGreaterThan(1);
        expect(screen.queryByText(/advanced to/)).not.toBeInTheDocument();
      } finally {
        release();
      }
    },
  );
  it.each(['success', 'failure'] as const)(
    'prevents duplicate dispatch and leaves a newly selected editor intact after late %s',
    async (outcome) => {
      signIn();
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = 0;
      let current = { ...lifecycleRegion };
      server.use(
        graphql.query('AdminRegions', () =>
          HttpResponse.json({ data: { regions: [current, otherRegion] } }),
        ),
        graphql.query('ArchonAssignments', () =>
          HttpResponse.json({ data: { archonAssignments: { total: 0, items: [] } } }),
        ),
        graphql.mutation('TransitionRegion', async () => {
          started++;
          await gate;
          if (outcome === 'success') current = { ...current, kind: 'archon' };
          return outcome === 'success'
            ? HttpResponse.json({
                data: { transitionRegion: current },
              })
            : HttpResponse.json({
                errors: [{ message: 'Old failure', extensions: { code: 'INTERNAL' } }],
              });
        }),
      );
      const { result, client } = renderRegionHook();
      try {
        await waitFor(() => expect(result.current.panel.regions.data).toHaveLength(2));
        act(() => result.current.panel.beginAdvance(lifecycleRegion));
        act(() => {
          result.current.panel.confirmAdvance();
          result.current.panel.confirmAdvance();
        });
        await waitFor(() => expect(started).toBe(1));
        const pending = client.getMutationCache().getAll().at(-1);
        if (!pending) throw new Error('Expected lifecycle mutation');
        await act(async () => {
          result.current.panel.cancelAdvance();
          await result.current.panel.beginEdit(otherRegion);
        });
        expect(result.current.panel.editing?.status).toBe('ready');
        const editing = result.current.panel.editing;
        if (editing?.status !== 'ready')
          throw new Error('Expected current Region editor');
        act(() =>
          result.current.panel.setDraft({
            ...editing.draft,
            name: 'New unrelated draft',
          }),
        );
        act(() => release());
        await waitFor(() => expect(pending.state.status).not.toBe('pending'));
        expect(started).toBe(1);
        expect(result.current.panel.editing?.region.id).toBe(otherRegion.id);
        expect(result.current.panel.advancement).toBeNull();
        expect(result.current.panel.advance.error).toBeNull();
        expect(result.current.panel.message).toBeNull();
        if (result.current.panel.editing?.status !== 'ready')
          throw new Error('Current editor was replaced');
        expect(result.current.panel.editing.draft.name).toBe('New unrelated draft');
        expect(
          result.current.panel.regions.data?.find(
            (row) => row.id === lifecycleRegion.id,
          )?.kind,
        ).toBe(outcome === 'success' ? 'archon' : 'uncharted');
      } finally {
        release();
      }
    },
  );
  it.each([
    ['token', 'success'],
    ['token', 'failure'],
    ['account', 'success'],
    ['account', 'failure'],
    ['role', 'success'],
    ['role', 'failure'],
  ] as const)(
    'ignores old %s-scope completion with %s response',
    async (change, outcome) => {
      signIn();
      let account = { ...goodMe, roles: ['admin'] };
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = false;
      let regionReads = 0;
      server.use(
        graphql.query('MemberMe', () =>
          HttpResponse.json({ data: { memberMe: account } }),
        ),
        graphql.query('CurrentAdminAccess', () =>
          account.roles.includes('admin')
            ? HttpResponse.json({ data: { adminOperations: { activeAlertCount: 0 } } })
            : HttpResponse.json({
                errors: [
                  { message: 'Not permitted', extensions: { code: 'FORBIDDEN' } },
                ],
              }),
        ),
        graphql.query('CurrentReviewAccess', () =>
          account.roles.includes('admin')
            ? HttpResponse.json({
                data: { pendingDmProfileVerifications: { total: 0 } },
              })
            : HttpResponse.json({
                errors: [
                  { message: 'Not permitted', extensions: { code: 'FORBIDDEN' } },
                ],
              }),
        ),
        graphql.query('AdminRegions', () => {
          regionReads++;
          return HttpResponse.json({
            data: { regions: [lifecycleRegion, otherRegion] },
          });
        }),
        graphql.mutation('TransitionRegion', async () => {
          started = true;
          await gate;
          return outcome === 'success'
            ? HttpResponse.json({
                data: { transitionRegion: { ...lifecycleRegion, kind: 'archon' } },
              })
            : HttpResponse.json({
                errors: [
                  { message: 'Old actor failure', extensions: { code: 'FORBIDDEN' } },
                ],
              });
        }),
      );
      const { result, client } = renderRegionHook();
      try {
        await waitFor(() => expect(result.current.panel.regions.data).toHaveLength(2));
        act(() => result.current.panel.beginAdvance(lifecycleRegion));
        act(() => result.current.panel.confirmAdvance());
        await waitFor(() => expect(started).toBe(true));
        const pending = client.getMutationCache().getAll().at(-1);
        if (!pending) throw new Error('Expected lifecycle mutation');
        if (change === 'role') {
          account = { ...account, roles: ['player'] };
          await act(async () => {
            await client.invalidateQueries({ queryKey: queryKeys.me });
          });
          await waitFor(() =>
            expect(
              client.getQueryData<{ roles: string[] }>(queryKeys.me)?.roles,
            ).toEqual(['player']),
          );
        } else {
          if (change === 'account') account = { ...account, id: otherRegion.id };
          act(() => result.current.auth.storeToken(secondToken()));
          await waitFor(() =>
            expect(result.current.panel.regions.data).toHaveLength(2),
          );
          act(() => result.current.panel.beginAdvance(otherRegion));
          expect(result.current.panel.advancement?.region.id).toBe(otherRegion.id);
        }
        await waitFor(() => expect(client.isFetching()).toBe(0));
        const readsBeforeOldCompletion = regionReads;
        act(() => release());
        await waitFor(() => expect(pending.state.status).not.toBe('pending'));
        expect(regionReads).toBe(readsBeforeOldCompletion);
        expect(result.current.panel.message).toBeNull();
        expect(result.current.panel.advance.error).toBeNull();
        if (change === 'role') expect(result.current.panel.advancement).toBeNull();
        else expect(result.current.panel.advancement?.region.id).toBe(otherRegion.id);
      } finally {
        release();
      }
    },
  );
});
