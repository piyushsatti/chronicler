import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test-utils.js';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { AdminWorkspaceShell } from '../../../src/features/admin/AdminWorkspaceShell.js';
import { AdminPage } from '../../../src/features/admin/pages/AdminPage.js';
import { AdminReviewPage } from '../../../src/features/admin/pages/AdminReviewPage.js';
import {
  AdminPeoplePage,
  AdminCharactersPage,
  AdminWorldPage,
  AdminContentPage,
  AdminDeliveryPage,
  AdminDataHealthPage,
  DMDashboardPage,
} from '../../../src/features/admin/pages/AdminSectionPage.js';
import { useMembersPanel } from '../../../src/features/admin/hooks/useMembersPanel.js';
import {
  mockGraphqlOps,
  mockMemberMe,
  signIn,
  trackPrivilegedRequests,
} from './authority-test-utils.js';
import goodMe from '../../fixtures/wire/me/good.json';
import goodMembers from '../../fixtures/wire/admin/members-good.json';

let stopTracking: (() => void) | undefined;
afterEach(() => {
  stopTracking?.();
  stopTracking = undefined;
});
function track() {
  const tracker = trackPrivilegedRequests();
  stopTracking = tracker.stop;
  return tracker.requested;
}

const adminSections = [
  ['/admin', AdminPage],
  ['/admin/people', AdminPeoplePage],
  ['/admin/characters', AdminCharactersPage],
  ['/admin/world', AdminWorldPage],
  ['/admin/content', AdminContentPage],
  ['/admin/delivery', AdminDeliveryPage],
  ['/admin/data-health', AdminDataHealthPage],
] as const;

describe('validated workspace authority', () => {
  it.each(adminSections)(
    'denies verifier at %s before any section or privileged query mounts',
    async (route, Page) => {
      signIn(['verifier'], ['admin']);
      const requested = track();
      renderWithProviders(<Page />, { route });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Permissions may have changed. Reload or sign in again.',
      );
      expect(
        screen.queryByRole('navigation', { name: 'Admin sections' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Mira')).not.toBeInTheDocument();
      expect(requested).toEqual([]);
    },
  );

  it.each(['admin', 'review', 'dm'] as const)(
    'allows an administrator through the %s boundary',
    async (authority) => {
      signIn();
      renderWithProviders(
        <AdminWorkspaceShell
          page={`test-${authority}`}
          title="Allowed"
          authority={authority}
        >
          <p>Mounted privileged body</p>
        </AdminWorkspaceShell>,
      );
      expect(await screen.findByText('Mounted privileged body')).toBeInTheDocument();
    },
  );

  it('allows Review for verifier and does not offer other admin sections', async () => {
    signIn(['verifier']);
    const requested = track();
    renderWithProviders(<AdminReviewPage />, { route: '/admin/review' });
    expect(await screen.findByText('Pending Hero')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/admin/review',
    );
    expect(screen.queryByRole('link', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'World' })).not.toBeInTheDocument();
    expect(requested).toEqual([GRAPHQL_PATH]);
  });

  it.each([{ roles: ['player'] }, { roles: ['dm'] }, { roles: [] }])(
    'denies Review without review authority: $roles',
    async ({ roles }) => {
      signIn(roles);
      const requested = track();
      renderWithProviders(<AdminReviewPage />, { route: '/admin/review' });
      await screen.findByRole('alert');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(requested).toEqual([]);
    },
  );

  it('allows the DM route without redirecting a DM or requesting administrator operations', async () => {
    signIn(['dm']);
    const requested = track();
    renderWithProviders(
      <Routes>
        <Route path="/dm" element={<DMDashboardPage />} />
        <Route path="/" element={<p>Redirected home</p>} />
        <Route path="/login" element={<p>Sign in</p>} />
      </Routes>,
      { route: '/dm' },
    );
    expect(
      await screen.findByRole('heading', { name: 'DM dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The DM dashboard is temporarily unavailable.',
    );
    expect(screen.queryByText('Redirected home')).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it('denies a player at the DM route before the body mounts', async () => {
    signIn(['player']);
    const requested = track();
    renderWithProviders(<DMDashboardPage />, { route: '/dm' });
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: 'DM dashboard' }),
    ).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it('waits for account validation before mounting an admin body or starting queries', async () => {
    signIn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const me = { ...goodMe, roles: ['admin'] };
    mockMemberMe(async () => {
      await pending;
      return HttpResponse.json(me);
    }, async () => {
      await pending;
      return me;
    });
    const requested = track();
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.queryByRole('region', { name: 'Members & roles' }),
    ).not.toBeInTheDocument();
    expect(requested).toEqual([]);
    await act(async () => {
      release();
    });
    expect(await screen.findByText('Mira')).toBeInTheDocument();
    expect(requested).toContain(GRAPHQL_PATH);
  });

  it.each([
    [
      'invalid',
      () => HttpResponse.json({ ...goodMe, roles: [7] }),
      () => ({ ...goodMe, roles: [7] }),
      'The server returned data this screen cannot use.',
    ],
    [
      'upstream',
      () => HttpResponse.json({ title: 'private server detail' }, { status: 500 }),
      null,
      'Something went wrong. Please try again.',
    ],
    [
      'forbidden',
      () => HttpResponse.json({ title: 'private server detail' }, { status: 403 }),
      null,
      'Permissions may have changed. Reload or sign in again.',
    ],
  ] as const)(
    'shows controlled %s account failure without querying privileged data',
    async (_name, restResponse, graphqlData, copy) => {
      signIn();
      mockMemberMe(restResponse, graphqlData ?? undefined);
      const requested = track();
      renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
      expect(await screen.findByRole('alert')).toHaveTextContent(copy);
      expect(screen.queryByText(/private server detail/)).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reload account' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(requested).toEqual([]);
    },
  );

  it('invalidates me once for simultaneous and repeated forbidden queries within a page session', async () => {
    signIn();
    const forbidden = () =>
      HttpResponse.json({
        errors: [{ message: 'private detail', extensions: { code: 'FORBIDDEN' } }],
      });
    mockGraphqlOps({
      AdminOperations: forbidden,
      AdminCharacters: forbidden,
    });
    const { queryClient } = renderWithProviders(<AdminPage />, { route: '/admin' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    await waitFor(() => {
      expect(
        invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'me'),
      ).toHaveLength(1);
    });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['adminOperations'] });
    });
    expect(
      invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'me'),
    ).toHaveLength(1);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Permissions may have changed. Reload or sign in again.',
    );
    expect(screen.getByRole('button', { name: 'Reload account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shares a single permission refresh across Review tabs', async () => {
    signIn(['verifier']);
    const forbidden = () =>
      HttpResponse.json({ errors: [{ extensions: { code: 'FORBIDDEN' } }] });
    mockGraphqlOps(
      {
        PendingCharacterVerifications: forbidden,
        PendingDmProfiles: forbidden,
      },
      { ...goodMe, roles: ['verifier'] },
    );
    const { queryClient } = renderWithProviders(<AdminReviewPage />, {
      route: '/admin/review',
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('tab', { name: 'DM Profiles' }));
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.pendingDmProfiles)?.status).toBe(
        'error',
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Permissions may have changed. Reload or sign in again.',
    );
    expect(
      invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'me'),
    ).toHaveLength(1);
  });

  it('allows an administrator to save roles through the guarded mutation', async () => {
    signIn();
    const requested = track();
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    await userEvent.click(await screen.findByRole('button', { name: /Mira/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(requested).toContain(GRAPHQL_PATH));
  });

  it('shows controlled mutation 403 and refreshes account authority once', async () => {
    signIn();
    mockGraphqlOps({
      SetMemberRoles: () =>
        HttpResponse.json({
          errors: [
            { message: 'private detail', extensions: { code: 'FORBIDDEN' } },
          ],
        }),
    });
    const { queryClient } = renderWithProviders(<AdminPeoplePage />, {
      route: '/admin/people',
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.click(await screen.findByRole('button', { name: /Mira/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save roles' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Permissions may have changed. Reload or sign in again.',
    );
    expect(
      invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'me'),
    ).toHaveLength(1);
    expect(screen.queryByText('private detail')).not.toBeInTheDocument();
  });

  it('stops direct privileged mutations after validated account roles are revoked', async () => {
    signIn();
    const requested = track();
    let current!: ReturnType<typeof useMembersPanel>;
    function HookProbe() {
      current = useMembersPanel();
      return <p>{current.directory.data?.[0]?.displayName ?? 'Waiting'}</p>;
    }
    const { queryClient } = renderWithProviders(<HookProbe />);
    await screen.findByText('Mira');
    await act(async () => {
      current.setSelected(goodMembers.items[0]);
    });
    const verifier = { ...goodMe, roles: ['verifier'] };
    mockMemberMe(
      () => HttpResponse.json(verifier),
      () => verifier,
    );
    await act(async () => {
      queryClient.setQueryData(queryKeys.me, verifier);
    });
    const graphqlBefore = requested.filter((path) => path === GRAPHQL_PATH).length;
    await act(async () => {
      await expect(current.saveRoles.mutateAsync()).rejects.toMatchObject({
        kind: 'forbidden',
      });
    });
    // Guard rejects locally — SetMemberRoles must not hit the wire.
    expect(requested.filter((path) => path === GRAPHQL_PATH)).toHaveLength(
      graphqlBefore,
    );
  });

  it('disables admin query hooks even when called outside their routed gate', async () => {
    signIn(['verifier']);
    const requested = track();
    function HookProbe() {
      const view = useMembersPanel();
      return <p>{view.directory.fetchStatus}</p>;
    }
    renderWithProviders(<HookProbe />);
    await screen.findByText('idle');
    expect(requested).toEqual([]);
  });
});
