import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.js';
import { isAdmin } from '../../../auth/roles.js';
import { TransportError } from '../../../errors/types.js';
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
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () =>
    mounted.current &&
    sessionReady &&
    token !== null &&
    isCurrentSession(token) &&
    current.current.token === token &&
    current.current.epoch === epoch;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const replay = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    lock.current = false;
    setPending(false);
    setError('');
  }, [epoch]);
  async function set(next: NodeState) {
    if (next === node.state || lock.current || !canSet || !isCurrent()) return;
    const identity = `${node.id}:${next}`;
    const key = replay.current.get(identity) ?? crypto.randomUUID();
    replay.current.set(identity, key);
    lock.current = true;
    setPending(true);
    setError('');
    try {
      await setNodeState(map.id, node.id, next, key);
      if (!isCurrent()) return;
      replay.current.delete(identity);
      await onReload();
    } catch (cause) {
      if (!isCurrent()) return;
      setError(mapWriteError(cause));
      if (
        cause instanceof TransportError &&
        ['FORBIDDEN', 'UNAUTHENTICATED', 'UNAUTHORIZED', 'NOT_FOUND'].includes(
          cause.code,
        )
      )
        await onReload();
    } finally {
      if (isCurrent()) {
        lock.current = false;
        setPending(false);
      }
    }
  }
  return { hexMap, state: node.state, canSet, pending, error, set };
}
