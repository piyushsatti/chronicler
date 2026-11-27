import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../auth/AuthContext.js';
import { isAdmin } from '../../../auth/roles.js';
import { TransportError } from '../../../errors/types.js';
import { useCommandFence } from '../../../hooks/useFencedMutation.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  mapWriteError,
  setNodeState,
  type MapNode,
  type Pointcrawl,
} from '../adapters/mapAdapter.js';
import { isHexMap } from '../mapWords.js';
import type { NodeState } from '../nodeState.js';

/**
 * A hex's display state and the admin-only control that sets it. Every viewer sees
 * the state; only admins on a hex map get `set`. The server re-checks authority.
 */
export function useNodeState({
  map,
  node,
  onReload,
}: {
  map: Pointcrawl;
  node: MapNode;
  onReload: () => Promise<void>;
}) {
  const { token, sessionReady, isCurrentSession } = useAuth();
  const me = useMe();
  const hexMap = isHexMap(map);
  const canSet = hexMap && isAdmin(me.data?.roles);
  const scope = `${map.id}:${node.id}:${node.state}`;
  const current = useRef({ token, scope, epoch: 0 });
  if (current.current.token !== token || current.current.scope !== scope)
    current.current = { token, scope, epoch: current.current.epoch + 1 };
  const { epoch } = current.current;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;
  const isCurrent = () =>
    sessionReady &&
    token !== null &&
    isCurrentSession(token) &&
    current.current.token === token &&
    current.current.epoch === epoch;
  const fence = useCommandFence('map:session');
  const write = useMutation({
    mutationFn: async (next: NodeState) => {
      if (!isCurrent() || !canSet || next === node.state)
        throw new Error('stale');
      const identity = `${node.id}:${next}`;
      // A retry of the same state change reuses its idempotency key.
      return fence.runExclusive(async (cmd) => {
        await setNodeState(map.id, node.id, next, {
          token: cmd.token,
          idempotencyKey: cmd.keyFor(identity),
          signal: cmd.signal,
        });
        return { identity, skipped: !isCurrent() };
      });
    },
  });
  const active =
    write.variables !== undefined && current.current.epoch === epoch;
  return {
    hexMap,
    state: node.state,
    canSet,
    pending: Boolean(active && write.isPending),
    error:
      active && write.isError && !(write.error instanceof Error && write.error.message === 'stale')
        ? mapWriteError(write.error)
        : '',
    set: (next: NodeState) => {
      if (next === node.state || write.isPending || !canSet || !isCurrent()) return;
      write.mutate(next, {
        onSuccess: async (result) => {
          if (result.skipped || !isCurrent()) return;
          await onReloadRef.current();
        },
        onError: async (cause) => {
          if (
            !isCurrent() ||
            !(cause instanceof TransportError) ||
            !['FORBIDDEN', 'UNAUTHENTICATED', 'UNAUTHORIZED', 'NOT_FOUND'].includes(
              cause.code,
            )
          )
            return;
          await onReloadRef.current();
        },
      });
    },
  };
}
