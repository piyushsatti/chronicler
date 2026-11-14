import { useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../auth/AuthContext.js';
import { currentAccessIdentity } from '../auth/useCurrentAccess.js';
import { toAppError } from '../errors/toAppError.js';
import { TransportError, type AppError } from '../errors/types.js';
import { useMe } from './useMe.js';

export type FencedCommand = {
  token: string;
  idempotencyKey: string;
  signal?: AbortSignal;
};

type Owner = {
  id: string;
  token: string | null;
  identity: string | null;
  active: boolean;
};

function createOwner(token: string | null, identity: string | null): Owner {
  return {
    id: crypto.randomUUID(),
    token,
    identity,
    active: true,
  };
}

export function useFencedMutation<TInput, TResult>(opts: {
  context: string;
  run: (input: TInput, cmd: FencedCommand) => Promise<TResult>;
  assert?: () => void;
  invalidate?: (client: QueryClient, input: TInput) => Promise<unknown>;
}): {
  execute(input: TInput): Promise<boolean>;
  pending: boolean;
  error: AppError | null;
  sessionKey: string;
  token: string | null;
  runExclusive: <T>(
    work: (
      cmd: FencedCommand & { keyFor: (payload: string) => string },
    ) => Promise<T>,
  ) => Promise<T>;
  assertCurrent: () => void;
} {
  const client = useQueryClient();
  const auth = useAuth();
  const me = useMe();
  const identity = me.isSuccess ? currentAccessIdentity(me.data) : null;
  const memberId = me.isSuccess ? me.data.id : null;
  const [owner, setOwner] = useState(() => createOwner(auth.token, identity));
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const sessionRef = useRef<{
    memberId: string | null;
    keys: Map<string, string>;
  }>({ memberId: null, keys: new Map() });
  const [fenceError, setFenceError] = useState<AppError | null>(null);

  if (owner.token !== auth.token || owner.identity !== identity) {
    const signedOut = auth.token === null;
    const memberChanged =
      memberId !== null &&
      sessionRef.current.memberId !== null &&
      memberId !== sessionRef.current.memberId;
    if (signedOut) {
      busyRef.current = false;
      setPending(false);
      sessionRef.current = { memberId: null, keys: new Map() };
    } else if (memberChanged) {
      busyRef.current = false;
      setPending(false);
      sessionRef.current = { memberId, keys: new Map() };
    } else if (memberId !== null) {
      sessionRef.current.memberId = memberId;
    }
    setOwner(createOwner(auth.token, identity));
  }

  const current = useRef(owner);
  current.current = owner;
  useEffect(() => {
    owner.active = true;
    return () => {
      owner.active = false;
    };
  }, [owner]);

  function assertCurrent(): void {
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    if (
      !auth.sessionReady ||
      !auth.isCurrentSession(owner.token) ||
      !owner.identity ||
      !owner.token ||
      account?.status !== 'success' ||
      !account.data
    ) {
      throw toAppError({ failure: 'Unauthorized' }, opts.context);
    }
    if (
      !owner.active ||
      current.current !== owner ||
      currentAccessIdentity(account.data) !== owner.identity
    ) {
      throw toAppError(
        new TransportError('FORBIDDEN', { status: 403 }),
        opts.context,
      );
    }
    opts.assert?.();
  }

  function keyFor(payload: string): string {
    assertCurrent();
    const existing = sessionRef.current.keys.get(payload);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionRef.current.keys.set(payload, key);
    return key;
  }

  function runExclusive<T>(
    work: (
      cmd: FencedCommand & { keyFor: (payload: string) => string },
    ) => Promise<T> | T,
  ): Promise<T> {
    assertCurrent();
    if (busyRef.current)
      throw toAppError(new TransportError('CONFLICT'), opts.context);
    const payloads = new Set<string>();
    const cmd = {
      token: owner.token!,
      idempotencyKey: '',
      keyFor: (payload: string) => {
        payloads.add(payload);
        return keyFor(payload);
      },
    };
    busyRef.current = true;
    setPending(true);
    return Promise.resolve()
      .then(() => {
        assertCurrent();
        return work(cmd);
      })
      .then((result) => {
        assertCurrent();
        for (const payload of payloads) sessionRef.current.keys.delete(payload);
        return result;
      })
      .finally(() => {
        busyRef.current = false;
        setPending(false);
      });
  }

  const mutation = useMutation({
    mutationFn: async ({
      input,
      cmd,
    }: {
      input: TInput;
      cmd: FencedCommand;
    }) => opts.run(input, cmd),
    retry: false,
  });

  async function execute(input: TInput): Promise<boolean> {
    if (busyRef.current) {
      setFenceError(toAppError(new TransportError('CONFLICT'), opts.context));
      return false;
    }
    try {
      await runExclusive(async (cmd) => {
        const idempotencyKey = cmd.keyFor(JSON.stringify(input));
        await mutation.mutateAsync({
          input,
          cmd: { token: cmd.token, idempotencyKey, signal: cmd.signal },
        });
        assertCurrent();
        if (opts.invalidate) await opts.invalidate(client, input);
      });
      setFenceError(null);
      return true;
    } catch (err) {
      setFenceError(toAppError(err, opts.context));
      return false;
    }
  }

  return {
    execute,
    pending,
    error: fenceError,
    sessionKey: owner.id,
    token: owner.token,
    runExclusive,
    assertCurrent,
  };
}
