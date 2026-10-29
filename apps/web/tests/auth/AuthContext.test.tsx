import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { graphql, http, HttpResponse } from 'msw';
import { StrictMode, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.js';
import { EXPIRES_KEY, TOKEN_KEY } from '../../src/auth/storage.js';
import { consumeOAuthState, OAUTH_STATE_KEY } from '../../src/auth/oauthState.js';
import { toAppError } from '../../src/errors/toAppError.js';
import { TransportError } from '../../src/errors/types.js';
import { AppProviders, createTestQueryClient } from '../../src/providers.js';
import { GRAPHQL_PATH } from '../../src/api/endpoints.js';
import { graphqlRequest } from '../../src/api/graphql.js';
import { HomePage } from '../../src/features/home/pages/HomePage.js';
import { server } from '../../src/mocks/server.js';
import { renderWithProviders } from '../test-utils.js';
import lanesBad from '../fixtures/wire/home/lanes-bad-board.json';
import { App } from '../../src/App.js';
import goodSettings from '../fixtures/wire/personalize/good.json';
import { DEFAULT_PREFERENCES, savePrefs } from '../../src/context/theme.utils.js';
import { useEditorDraft } from '../../src/features/editor/hooks/useEditorDraft.js';

function token(exp = Date.now() / 1000 + 3600): string {
  return `${btoa('{}')}.${btoa(JSON.stringify({ member_id: 'member-one', exp, roles: ['admin'] }))}.test`;
}

function setup() {
  const queryClient = createTestQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return { queryClient, ...renderHook(() => useAuth(), { wrapper }) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('AuthProvider session lifecycle', () => {
  it('preserves editor queries and mutations after transient memberMe failure', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['me'], { id: 'member-one', roles: ['player'] });
    function Draft() {
      const draft = useEditorDraft('guide', 'transient-session', {
        meta: { title: 'Guide' },
        body: 'Original',
      });
      return (
        <>
          <input
            aria-label="Editor body"
            value={draft.body}
            onChange={(event) => draft.setBody(event.target.value)}
          />
          <button onClick={draft.undo} disabled={!draft.canUndo}>
            Undo draft
          </button>
        </>
      );
    }
    function Editor() {
      const record = useQuery({
        queryKey: ['editor', 'record'],
        queryFn: async () => 'Record',
      });
      return record.data ? <Draft /> : <p>Loading editor</p>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Editor />
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByRole('textbox', { name: 'Editor body' }), {
      target: { value: 'First edit' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Editor body' }), {
      target: { value: 'Second edit' },
    });
    const mutation = queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['editor', 'save'] });
    await act(async () => {
      await expect(
        queryClient.fetchQuery({
          queryKey: ['me'],
          queryFn: async () => {
            throw new TransportError('HTTP', { status: 503 });
          },
        }),
      ).rejects.toThrow();
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(queryClient.getQueryData(['editor', 'record'])).toBe('Record');
    expect(queryClient.getMutationCache().getAll()).toContain(mutation);
    expect(screen.getByRole('textbox', { name: 'Editor body' })).toHaveValue(
      'Second edit',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo draft' }));
    expect(screen.getByRole('textbox', { name: 'Editor body' })).toHaveValue(
      'First edit',
    );
  });

  it('still clears caches when authority changes after a transient failure', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['me'], { id: 'member-one', roles: ['player', 'dm'] });
    await act(async () => {
      await expect(
        queryClient.fetchQuery({
          queryKey: ['me'],
          queryFn: async () => {
            throw new TransportError('HTTP', { status: 503 });
          },
        }),
      ).rejects.toThrow();
    });
    queryClient.setQueryData(['editor', 'record'], 'Previous authority');
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['editor', 'save'] });
    act(() => queryClient.setQueryData(['me'], { id: 'member-one', roles: ['player'] }));
    expect(result.current.isAuthenticated).toBe(true);
    expect(queryClient.getQueryData(['editor', 'record'])).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('places the site header outside the page main landmark', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderWithProviders(<App />, { route: '/settings' });
    const header = await screen.findByRole('banner');
    expect(header.closest('main')).toBeNull();
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it.each([0, 10])(
    'updates the real header with multiple mounted member observers after a storage account switch (response delay %i)',
    async (responseDelay) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
      window.history.replaceState({}, '', '/me/personalize');
      const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const session = (memberId: string) =>
        `e30.${btoa(JSON.stringify({ member_id: memberId, exp: Date.now() / 1000 + 3600 }))}.sig`;
      const firstToken = session(firstId);
      const secondToken = session(secondId);
      await import('../../src/features/personalize/pages/PersonalizePage.js');
      localStorage.setItem(TOKEN_KEY, firstToken);
      savePrefs(
        {
          ...DEFAULT_PREFERENCES,
          theme: 'midnight',
          mode: 'dark',
          modeExplicit: true,
          density: 'compact',
          timezone: 'America/New_York',
          colorblindSafe: true,
        },
        firstId,
      );
      const responses: string[] = [];
      server.use(
        graphql.query('MyPersonalization', ({ request }) => {
          const first = request.headers.get('authorization') === `Bearer ${firstToken}`;
          return HttpResponse.json({
            data: {
              myPersonalization: {
                settings: {
                  ...goodSettings.settings,
                  memberId: first ? firstId : secondId,
                  theme: first ? 'MIDNIGHT' : 'PARCHMENT',
                  mode: first ? 'DARK' : 'SYSTEM',
                  density: first ? 'COMPACT' : 'COMFORTABLE',
                  timezone: first ? 'America/New_York' : null,
                  colorblindSafe: first,
                },
              },
            },
          });
        }),
        graphql.query('MemberMe', async ({ request }) => {
          const first = request.headers.get('authorization') === `Bearer ${firstToken}`;
          if (responseDelay)
            await new Promise((resolve) => setTimeout(resolve, responseDelay));
          const member = {
            id: first ? firstId : secondId,
            handle: first ? 'account-fixture-owner' : 'account-fixture-other',
            displayName: first ? 'account-fixture-owner' : 'account-fixture-other',
            roles: ['player'],
          };
          responses.push(member.id);
          return HttpResponse.json({ data: { memberMe: member } });
        }),
      );
      let queryClient: QueryClient | undefined;
      function ActualApp() {
        queryClient = useQueryClient();
        return <App />;
      }
      render(
        <StrictMode>
          <AppProviders>
            <ActualApp />
          </AppProviders>
        </StrictMode>,
      );
      await within(await screen.findByRole('banner')).findByRole('link', {
        name: 'account-fixture-owner',
      });
      await screen.findByRole('heading', { name: 'Personalize' });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Theme/ })).toHaveTextContent('Midnight'),
      );
      expect(
        queryClient
          ?.getQueryCache()
          .find({ queryKey: ['me'] })
          ?.getObserversCount(),
      ).toBeGreaterThan(2);
      act(() => {
        localStorage.setItem(TOKEN_KEY, secondToken);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: TOKEN_KEY,
            oldValue: firstToken,
            newValue: secondToken,
          }),
        );
      });
      await waitFor(() =>
        expect(queryClient?.getQueryData(['me'])).toMatchObject({ id: secondId }),
      );
      expect(responses).toContain(secondId);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Theme/ })).toHaveTextContent(
          'Parchment',
        ),
      );
      expect(
        await within(screen.getByRole('banner')).findByRole('link', {
          name: 'account-fixture-other',
        }),
      ).toHaveAttribute('href', '/me');
      expect(
        within(screen.getByRole('banner')).queryByRole('link', {
          name: 'account-fixture-owner',
        }),
      ).not.toBeInTheDocument();
    },
  );

  it('clears a mounted protected reader and prior caches for an HTTP 200 GraphQL UNAUTHENTICATED response', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    let rejected = false;
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json(
          rejected
            ? {
                errors: [
                  {
                    message: 'sign in required',
                    extensions: { code: 'UNAUTHENTICATED' },
                  },
                ],
              }
            : { data: { document: { effectiveBody: 'Private session notes' } } },
        ),
      ),
    );
    function ProtectedReader() {
      const auth = useAuth();
      const document = useQuery({
        queryKey: ['protected-reader'],
        enabled: auth.isAuthenticated,
        queryFn: async () => {
          try {
            return await graphqlRequest<{ document: { effectiveBody: string } }>(
              'query ProtectedReader { document(slug: "private") { effectiveBody } }',
            );
          } catch (error) {
            throw toAppError(error, 'protected-reader');
          }
        },
      });
      return (
        <>
          <p>{auth.isAuthenticated ? 'Signed in' : 'Signed out'}</p>
          <p>{document.data?.document.effectiveBody}</p>
        </>
      );
    }
    const { queryClient } = renderWithProviders(<ProtectedReader />);
    expect(await screen.findByText('Private session notes')).toBeVisible();
    queryClient.setQueryData(['other-private-reader'], 'another secret');
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['private-write'] });
    rejected = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['protected-reader'] });
    });
    expect(await screen.findByText('Signed out')).toBeVisible();
    expect(screen.queryByText('Private session notes')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['protected-reader'])).toBeUndefined();
    expect(queryClient.getQueryData(['other-private-reader'])).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('starts sign-in with a retained nonce in the existing authorize query and clears prior authority', () => {
    sessionStorage.clear();
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'prior account');
    const destination = { href: '' };
    // Capture navigation without opening a provider or replacing its registered redirect.
    vi.stubGlobal(
      'window',
      new Proxy(window, {
        get(target, property) {
          return property === 'location'
            ? destination
            : Reflect.get(target, property, target);
        },
      }),
    );
    act(() => result.current.login());
    vi.unstubAllGlobals();
    const url = new URL(destination.href, 'http://localhost');
    expect(url.pathname).toBe('/auth/discord');
    expect([...url.searchParams.keys()]).toEqual(['state']);
    const state = url.searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(consumeOAuthState(state)).toBe(true);
    expect(result.current.token).toBeNull();
    expect(result.current.loginError).toBeNull();
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('preserves an existing account and cache when secure sign-in initiation is unavailable', () => {
    const retainedToken = token();
    localStorage.setItem(TOKEN_KEY, retainedToken);
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'retain current authority');
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('crypto unavailable');
    });
    act(() => result.current.login());
    expect(result.current.token).toBe(retainedToken);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(retainedToken);
    expect(queryClient.getQueryData(['private'])).toBe('retain current authority');
    expect(result.current.loginError?.userMessage).toBe(
      'Sign-in could not start in this browser. Please try again.',
    );
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
  });

  it('lets a whole anonymous public page reach ready after cache initialization', async () => {
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Welcome to Chronicler.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /Siege of Kraghold/ }).length,
    ).toBeGreaterThan(0);
  });

  it('lets a whole anonymous public page surface a controlled query error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            questBoard: lanesBad.questBoard,
            quests: lanesBad.quests,
            recentlyClosedQuests: lanesBad.recentlyClosedQuests,
            communityDirectory: lanesBad.communityDirectory,
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server returned data this screen cannot use.',
    );
  });

  it('shows an anonymous public 401 once without repeatedly resetting its query', async () => {
    const HOME_PUBLIC_OPS = 3;
    let requested = 0;
    server.use(
      http.post(GRAPHQL_PATH, () => {
        requested++;
        return HttpResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
      }),
    );
    renderWithProviders(<HomePage />);
    // A signed-out visitor is asked to sign in, not told a session ended.
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to see this');
    expect(requested).toBe(HOME_PUBLIC_OPS);
  });

  it('recovers an observed public query on logout without remounting an unrelated draft', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const HOME_PUBLIC_OPS = 3;
    let requested = 0;
    const record = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === GRAPHQL_PATH) requested++;
    };
    server.events.on('request:start', record);
    function Controls() {
      const { logout } = useAuth();
      return <button onClick={logout}>End session</button>;
    }
    function PublicDraft() {
      const [draft, setDraft] = useState('');
      return (
        <>
          <input
            aria-label="Unrelated draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <HomePage />
        </>
      );
    }
    try {
      renderWithProviders(
        <>
          <Controls />
          <PublicDraft />
        </>,
      );
      await screen.findByRole('heading', {
        level: 1,
        name: /Good (morning|afternoon|evening|night), .+\./,
      });
      const initialRequested = requested;
      expect(initialRequested).toBeGreaterThanOrEqual(HOME_PUBLIC_OPS);
      fireEvent.change(screen.getByRole('textbox', { name: 'Unrelated draft' }), {
        target: { value: 'Keep this draft' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'End session' }));
      await waitFor(() =>
        expect(requested).toBeGreaterThanOrEqual(initialRequested + HOME_PUBLIC_OPS),
      );
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Welcome to Chronicler.',
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Unrelated draft' })).toHaveValue(
        'Keep this draft',
      );
    } finally {
      server.events.removeListener('request:start', record);
    }
  });

  it('cancels a pending private query at expiry without refetching or publishing its late value', async () => {
    vi.useFakeTimers();
    localStorage.setItem(TOKEN_KEY, token(Date.now() / 1000 + 1));
    const queryClient = createTestQueryClient();
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const load = vi.fn(() => pending);
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      );
    }
    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const privateQuery = useQuery({
          queryKey: ['private-pending-expiry'],
          queryFn: load,
          enabled: auth.isAuthenticated,
        });
        return { auth, privateQuery };
      },
      { wrapper },
    );
    expect(load).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.auth.isAuthenticated).toBe(false);
    await act(async () => {
      finish('late private secret');
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.privateQuery.data).toBeUndefined();
    expect(queryClient.getQueryData(['private-pending-expiry'])).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([null, 'malformed', token(Date.now() / 1000 - 1), token(Date.now() / 1000)])(
    'starts anonymous for a missing, malformed, or expired token: %s',
    (stored) => {
      if (stored) localStorage.setItem(TOKEN_KEY, stored);
      localStorage.setItem(EXPIRES_KEY, 'old');
      const { result } = setup();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(EXPIRES_KEY)).toBeNull();
    },
  );

  it('keeps JWT identity as a hint without exposing JWT roles', () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result } = setup();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.memberId).toBe('member-one');
    expect(result.current).not.toHaveProperty('discordId');
    expect(result.current).not.toHaveProperty('roles');
  });

  it('does not use an unrelated sub claim as the member cache identity', () => {
    localStorage.setItem(
      TOKEN_KEY,
      `e30.${btoa(JSON.stringify({ sub: 'legacy-sub', exp: Date.now() / 1000 + 3600 }))}.sig`,
    );
    const { result } = setup();
    expect(result.current.memberId).toBeNull();
  });

  it('expires a mounted session at the NumericDate boundary and clears all caches', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    localStorage.setItem(TOKEN_KEY, token(Date.now() / 1000 + 2));
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], { secret: 'private data' });
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['private-write'] });
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.isAuthenticated).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('checks expiry on focus when a suspended tab has not run its timer', () => {
    vi.useFakeTimers();
    const expiry = Date.now() / 1000 + 1;
    localStorage.setItem(TOKEN_KEY, token(expiry));
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'secret');
    vi.setSystemTime((expiry + 1) * 1000);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('does not overflow the browser timer for a long-lived token', () => {
    vi.useFakeTimers();
    localStorage.setItem(TOKEN_KEY, token(Date.now() / 1000 + 40 * 24 * 60 * 60));
    const { result } = setup();
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears query and mutation caches on logout and every accepted token', () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    for (const transition of [
      () => result.current.storeToken(token()),
      () => result.current.logout(),
    ]) {
      queryClient.setQueryData(['private'], 'secret');
      queryClient.getMutationCache().build(queryClient, { mutationKey: ['write'] });
      act(transition);
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    }
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(EXPIRES_KEY)).toBeNull();
  });

  it.each([
    'malformed',
    token(Date.now() / 1000 - 1),
    `${btoa('{}')}.${btoa('null')}.test`,
  ])('rejects an unusable callback token without keeping authority: %s', (invalid) => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'secret');
    act(() => expect(() => result.current.storeToken(invalid)).toThrow());
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('ends the session for a real query 401 and ignores unrelated failures', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    await act(async () => {
      await expect(
        queryClient.fetchQuery({
          queryKey: ['failed-public'],
          queryFn: async () => {
            throw new TransportError('HTTP', { status: 500 });
          },
        }),
      ).rejects.toThrow();
    });
    expect(result.current.isAuthenticated).toBe(true);
    queryClient.setQueryData(['private'], 'secret');
    await act(async () => {
      await expect(
        queryClient.fetchQuery({
          queryKey: ['expired-private'],
          queryFn: async () => {
            throw toAppError(
              new TransportError('HTTP', { status: 401 }),
              'private:load',
            );
          },
        }),
      ).rejects.toMatchObject({ kind: 'unauthorized' });
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('ends the session for a real mutation 401', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'secret');
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw new TransportError('HTTP', { status: 401 });
      },
    });
    await act(async () => {
      await expect(mutation.execute(undefined)).rejects.toThrow();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('synchronizes cross-tab token removal and replacement, clearing caches', () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private'], 'secret');
    localStorage.removeItem(TOKEN_KEY);
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }),
      ),
    );
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
    const replacement = token(Date.now() / 1000 + 7200);
    localStorage.setItem(TOKEN_KEY, replacement);
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: TOKEN_KEY, newValue: replacement }),
      ),
    );
    expect(result.current.token).toBe(replacement);
  });

  it('does not let a cleared mutation from an older token end a new session', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    const { result, queryClient } = setup();
    let reject!: (error: unknown) => void;
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () =>
        new Promise<never>((_resolve, fail) => {
          reject = fail;
        }),
    });
    const outcome = mutation.execute(undefined).catch(() => undefined);
    await act(async () => {
      await Promise.resolve();
    });
    const replacement = token(Date.now() / 1000 + 7200);
    act(() => result.current.storeToken(replacement));
    await act(async () => {
      reject(new TransportError('HTTP', { status: 401 }));
      await outcome;
    });
    expect(result.current.token).toBe(replacement);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
