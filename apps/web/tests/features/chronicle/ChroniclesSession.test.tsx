import type { ReactNode } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { useChroniclesPage } from '../../../src/features/chronicle/hooks/useChroniclesPage.js';
import { ChroniclesListPage } from '../../../src/features/chronicle/pages/ChroniclesListPage.js';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/chronicle/list-good.json';
import goodMe from '../../fixtures/wire/me/good.json';

const token = (subject: string) =>
  `${btoa('{}')}.${btoa(JSON.stringify({ sub: subject, exp: Date.now() / 1000 + 3600 }))}.test`;
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function rows(count: number, title: string) {
  return Array.from({ length: count }, (_, index) => ({
    ...good.items[0],
    id: `6f000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `scope-summary-${index + 1}`,
    title: `${title} ${index + 1}`,
  }));
}
type ChronicleResponse = {
  data: {
    documents: { items: ReturnType<typeof rows>; total: number };
    gameCalendar: { definition: { era: { abbrev: string } } };
  };
};
const response = (
  items: ReturnType<typeof rows>,
  total = items.length,
): HttpResponse<ChronicleResponse> =>
  HttpResponse.json({
    data: {
      documents: { items, total },
      gameCalendar: { definition: { era: { abbrev: 'CY' } } },
    },
  });
function harness() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  const rendered = renderHook(() => ({ page: useChroniclesPage(), auth: useAuth() }), {
    wrapper: Wrapper,
  });
  return {
    ...rendered,
    client,
    dispose: () => {
      rendered.unmount();
      client.clear();
    },
  };
}

describe('Chronicle current account and audience scope', () => {
  it('eagerly reports initial membership failure and replaces it with the current anonymous read outcome after logout', async () => {
    localStorage.setItem(TOKEN_KEY, token('failed-membership'));
    const gate = deferred();
    let guestReads = 0;
    let guestFails = true;
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          errors: [{ message: 'Inactive', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
      graphql.query('ChronicleList', async ({ request }) => {
        expect(request.headers.get('authorization')).toBe('');
        guestReads++;
        await gate.promise;
        return guestFails
          ? HttpResponse.json({
              errors: [
                { message: 'Read unavailable', extensions: { code: 'INTERNAL' } },
              ],
            })
          : response(rows(1, 'Current guest summary'));
      }),
    );
    const rendered = harness();
    try {
      await waitFor(() =>
        expect(rendered.result.current.page).toMatchObject({
          status: 'error',
          error: { kind: 'forbidden' },
        }),
      );
      expect(guestReads).toBe(0);
      act(() => rendered.result.current.auth.logout());
      await waitFor(() => expect(guestReads).toBeGreaterThan(0));
      expect(rendered.result.current.page.status).toBe('loading');
      await act(async () => gate.release());
      await waitFor(() =>
        expect(rendered.result.current.page).toMatchObject({
          status: 'error',
          error: { kind: 'upstream' },
        }),
      );
      guestFails = false;
      act(() => {
        const page = rendered.result.current.page;
        if (page.status === 'error') page.refetch();
      });
      await waitFor(() =>
        expect(rendered.result.current.page).toMatchObject({
          status: 'ready',
          view: { total: 1, items: [{ title: 'Current guest summary 1' }] },
        }),
      );
      expect(rendered.result.current.auth.token).toBeNull();
    } finally {
      gate.release();
      rendered.dispose();
    }
  });

  it.each(['success', 'failure'])(
    'cannot expose a previous account partial collection after its late %s',
    async (outcome) => {
      const first = token('first');
      const second = token('second');
      localStorage.setItem(TOKEN_KEY, first);
      const gate = deferred();
      let held: Request | null = null;
      server.use(
        graphql.query('MemberMe', ({ request }) =>
          HttpResponse.json({
            data: {
              memberMe:
                request.headers.get('authorization') === `Bearer ${first}`
                  ? goodMe
                  : {
                      ...goodMe,
                      id: '71000000-0000-4000-8000-000000000002',
                      roles: ['player'],
                    },
            },
          }),
        ),
        graphql.query('ChronicleList', async ({ variables, request }) => {
          if (request.headers.get('authorization') !== `Bearer ${first}`)
            return response(rows(1, 'Current public summary'));
          if (Number(variables.offset) === 0)
            return response(rows(100, 'Previous private summary'), 101);
          held = request;
          await gate.promise;
          return outcome === 'failure'
            ? HttpResponse.json({
                errors: [{ message: 'Late failure', extensions: { code: 'INTERNAL' } }],
              })
            : response(rows(101, 'Previous private summary').slice(100), 101);
        }),
      );
      const rendered = harness();
      try {
        await waitFor(() => expect(held).not.toBeNull());
        expect(rendered.result.current.page.status).toBe('loading');
        act(() => rendered.result.current.auth.storeToken(second));
        await waitFor(() =>
          expect(rendered.result.current.page).toMatchObject({
            status: 'ready',
            view: { total: 1, items: [{ title: 'Current public summary 1' }] },
          }),
        );
        expect(held!.signal.aborted).toBe(true);
        await act(async () => {
          gate.release();
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(rendered.result.current.page).toMatchObject({
          status: 'ready',
          view: { total: 1, items: [{ title: 'Current public summary 1' }] },
        });
      } finally {
        gate.release();
        rendered.dispose();
      }
    },
  );

  it('removes an already cached private timeline before a same-token role refetch and never repaints it', async () => {
    localStorage.setItem(TOKEN_KEY, token('same-account'));
    const gate = deferred();
    let changed = false;
    let currentRequests = 0;
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: changed ? ['player'] : ['dm'] } },
        }),
      ),
      graphql.query('ChronicleList', async () => {
        if (changed) {
          currentRequests++;
          await gate.promise;
          return response(rows(1, 'Current readable summary'));
        }
        return response(rows(1, 'Private DM summary'));
      }),
    );
    const rendered = renderWithProviders(<ChroniclesListPage />);
    try {
      await screen.findByText('Private DM summary 1');
      changed = true;
      await act(async () => {
        await rendered.queryClient.refetchQueries({ queryKey: queryKeys.me });
      });
      await waitFor(() => expect(currentRequests).toBeGreaterThan(0));
      expect(screen.queryByText('Private DM summary 1')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Search entries')).not.toBeInTheDocument();
      await act(async () => {
        gate.release();
      });
      await screen.findByText('Current readable summary 1');
      expect(screen.queryByText('Private DM summary 1')).not.toBeInTheDocument();
      expect(
        rendered.queryClient
          .getQueryCache()
          .findAll({ queryKey: queryKeys.chronicleList })
          .some((query) => JSON.stringify(query.queryKey).includes('Bearer')),
      ).toBe(false);
    } finally {
      gate.release();
      rendered.unmount();
      rendered.queryClient.clear();
    }
  });

  it('switches to an explicitly anonymous collection when logout cancels a private page', async () => {
    const first = token('logout');
    localStorage.setItem(TOKEN_KEY, first);
    const gate = deferred();
    let held = false;
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: goodMe } }),
      ),
      graphql.query('ChronicleList', async ({ variables, request }) => {
        if (request.headers.get('authorization') === '')
          return response(rows(1, 'Guest summary'));
        if (Number(variables.offset) === 0)
          return response(rows(100, 'Private summary'), 101);
        held = true;
        await gate.promise;
        return response(rows(101, 'Private summary').slice(100), 101);
      }),
    );
    const rendered = harness();
    try {
      await waitFor(() => expect(held).toBe(true));
      act(() => rendered.result.current.auth.logout());
      await waitFor(() =>
        expect(rendered.result.current.page).toMatchObject({
          status: 'ready',
          view: { total: 1, items: [{ title: 'Guest summary 1' }] },
        }),
      );
      await act(async () => {
        gate.release();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(rendered.result.current.page).toMatchObject({
        status: 'ready',
        view: { total: 1, items: [{ title: 'Guest summary 1' }] },
      });
    } finally {
      gate.release();
      rendered.dispose();
    }
  });

  it('hides cached private rows on membership failure and retries validated membership before reading again', async () => {
    localStorage.setItem(TOKEN_KEY, token('membership'));
    let denied = false;
    let reads = 0;
    server.use(
      graphql.query('MemberMe', () =>
        denied
          ? HttpResponse.json({
              errors: [{ message: 'Inactive', extensions: { code: 'FORBIDDEN' } }],
            })
          : HttpResponse.json({ data: { memberMe: goodMe } }),
      ),
      graphql.query('ChronicleList', () => {
        reads++;
        return response(rows(1, 'Private member summary'));
      }),
    );
    const rendered = harness();
    try {
      await waitFor(() => expect(rendered.result.current.page.status).toBe('ready'));
      const before = reads;
      denied = true;
      await act(async () => {
        await rendered.client.refetchQueries({ queryKey: queryKeys.me });
      });
      await waitFor(() =>
        expect(rendered.result.current.page).toMatchObject({ status: 'error' }),
      );
      expect(reads).toBe(before);
      denied = false;
      act(() => {
        const page = rendered.result.current.page;
        if (page.status === 'error') page.refetch();
      });
      await waitFor(() => expect(rendered.result.current.page.status).toBe('ready'));
      expect(reads).toBeGreaterThan(before);
    } finally {
      rendered.dispose();
    }
  });
});
