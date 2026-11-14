import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { useFencedMutation } from '../../src/hooks/useFencedMutation.js';
import { createTestQueryClient } from '../../src/providers.js';
import goodMe from '../fixtures/wire/me/good.json';

function token(expOffset = 3600) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-dev', exp: Math.floor(Date.now() / 1000) + expOffset }))}.dev`;
}

function setup(
  run: (
    input: { n: number },
    cmd: { token: string; idempotencyKey: string },
  ) => Promise<string>,
) {
  const client = createTestQueryClient();
  const invalidate = vi.fn(async () => undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      fence: useFencedMutation({
        context: 'fence:test',
        run,
        invalidate,
      }),
      auth: useAuth(),
    }),
    { wrapper },
  );
  act(() => {
    client.setQueryData(queryKeys.me, { ...goodMe, roles: ['player'] });
  });
  return { ...hook, client, invalidate };
}

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, token());
});

describe('useFencedMutation', () => {
  it('reuses one idempotency key for the same input until success clears it', async () => {
    const keys: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attempt = 0;
    const { result } = setup(async (_input, cmd) => {
      keys.push(cmd.idempotencyKey);
      attempt += 1;
      if (attempt === 1) {
        await held;
        throw new Error('lost');
      }
      return 'ok';
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.fence.execute({ n: 1 });
      expect(await result.current.fence.execute({ n: 1 })).toBe(false);
    });
    await waitFor(() => expect(keys).toHaveLength(1));
    await act(async () => {
      release();
      expect(await first).toBe(false);
    });
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(true);
    });
    expect(keys).toHaveLength(3);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('refuses a second call while busy and surfaces an error', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = setup(async (_input, cmd) => {
      await held;
      return cmd.idempotencyKey;
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.fence.execute({ n: 1 });
      expect(await result.current.fence.execute({ n: 1 })).toBe(false);
    });
    expect(result.current.fence.error).not.toBeNull();
    await act(async () => {
      release();
      expect(await first).toBe(true);
    });
  });

  it('refuses a second call while invalidate is still in flight', async () => {
    const keys: string[] = [];
    let releaseInvalidate!: () => void;
    const heldInvalidate = new Promise<void>((resolve) => {
      releaseInvalidate = resolve;
    });
    const client = createTestQueryClient();
    const invalidate = vi.fn(async () => {
      await heldInvalidate;
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        fence: useFencedMutation({
          context: 'fence:test',
          run: async (_input, cmd) => {
            keys.push(cmd.idempotencyKey);
            return 'ok';
          },
          invalidate,
        }),
        auth: useAuth(),
      }),
      { wrapper },
    );
    act(() => {
      client.setQueryData(queryKeys.me, { ...goodMe, roles: ['player'] });
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.fence.execute({ n: 1 });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(result.current.fence.pending).toBe(true);
    let secondDone = false;
    let secondValue: boolean | undefined;
    await act(async () => {
      void result.current.fence.execute({ n: 1 }).then((value) => {
        secondDone = true;
        secondValue = value;
      });
      await Promise.resolve();
    });
    expect(secondDone).toBe(true);
    expect(secondValue).toBe(false);
    expect(keys).toHaveLength(1);
    await act(async () => {
      releaseInvalidate();
      expect(await first).toBe(true);
    });
    await waitFor(() => expect(result.current.fence.pending).toBe(false));
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('keeps the idempotency key across a token refresh for the same member', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const { result, client } = setup(async (_input, cmd) => {
      keys.push(cmd.idempotencyKey);
      attempt += 1;
      if (attempt === 1) throw new Error('lost');
      return 'ok';
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(false);
    });
    await act(async () => {
      result.current.auth.storeToken(token(7200));
      client.setQueryData(queryKeys.me, { ...goodMe, roles: ['player'] });
    });
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('issues a new idempotency key when the member id changes', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const { result, client } = setup(async (_input, cmd) => {
      keys.push(cmd.idempotencyKey);
      attempt += 1;
      if (attempt === 1) throw new Error('lost');
      return 'ok';
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(false);
    });
    const priorSession = result.current.fence.sessionKey;
    act(() => {
      client.setQueryData(queryKeys.me, {
        ...goodMe,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        roles: ['player'],
      });
    });
    await waitFor(() =>
      expect(result.current.fence.sessionKey).not.toBe(priorSession),
    );
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('rejects a second call across a same-member token refresh while busy', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = setup(async (_input, cmd) => {
      await held;
      return cmd.idempotencyKey;
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.fence.execute({ n: 1 });
    });
    await act(async () => {
      result.current.auth.storeToken(token(7200));
    });
    await act(async () => {
      expect(await result.current.fence.execute({ n: 1 })).toBe(false);
    });
    expect(result.current.fence.error).not.toBeNull();
    await act(async () => {
      release();
      expect(await first).toBe(false);
    });
  });

  it('rejects a token swap mid-call and does not invalidate', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, invalidate } = setup(async (_input, cmd) => {
      await held;
      return cmd.idempotencyKey;
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let outcome: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      outcome = result.current.fence.execute({ n: 1 });
    });
    await act(async () => {
      result.current.auth.storeToken(token(7200));
    });
    await act(async () => {
      release();
      expect(await outcome).toBe(false);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('rejects a role change mid-call', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, client, invalidate } = setup(async (_input, cmd) => {
      await held;
      return cmd.idempotencyKey;
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let outcome: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      outcome = result.current.fence.execute({ n: 1 });
    });
    act(() => {
      client.setQueryData(queryKeys.me, { ...goodMe, roles: ['admin'] });
    });
    await act(async () => {
      release();
      expect(await outcome).toBe(false);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('rejects a live me identity change without owner rotation', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, client, invalidate } = setup(async (_input, cmd) => {
      await held;
      return cmd.idempotencyKey;
    });
    await waitFor(() => expect(result.current.auth.sessionReady).toBe(true));
    let outcome: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      outcome = result.current.fence.execute({ n: 1 });
    });
    const cached = client.getQueryData(queryKeys.me) as { roles: string[] };
    cached.roles = ['admin'];
    await act(async () => {
      release();
      expect(await outcome).toBe(false);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
