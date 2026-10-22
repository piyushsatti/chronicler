import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import { TransportError } from '../../../errors/types.js';
import {
  mapWriteError,
  changeEntry,
  loadMapDocuments,
  type MapAtlasView,
  type MapNode,
  type Pointcrawl,
} from '../adapters/mapAdapter.js';
import { queryKeys } from '../feature.js';
import type { MapEdit } from './useMapEdit.js';
export type MapNodeDetailsProps = {
  map: Pointcrawl;
  node: MapNode;
  maps: MapAtlasView[];
  onEdit: (edit: MapEdit) => void;
  onReload: () => Promise<void>;
};
export function useMapNodeDetails({ map, node, maps, onReload }: MapNodeDetailsProps) {
  const { token, sessionReady, isCurrentSession } = useAuth();
  const scope = JSON.stringify([map.id, node.id, node.linkedEntries]);
  const current = useRef({
    token,
    scope,
    canEdit: map.canEdit,
    readEpoch: 0,
    writeEpoch: 0,
  });
  const changedScope =
    current.current.token !== token || current.current.scope !== scope;
  if (changedScope || current.current.canEdit !== map.canEdit)
    current.current = {
      token,
      scope,
      canEdit: map.canEdit,
      readEpoch: current.current.readEpoch + (changedScope ? 1 : 0),
      writeEpoch: current.current.writeEpoch + 1,
    };
  const { readEpoch, writeEpoch } = current.current;
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
    current.current.token === token &&
    current.current.scope === scope &&
    current.current.readEpoch === readEpoch &&
    (token === null || isCurrentSession(token));
  const canWrite = () =>
    isCurrent() &&
    token !== null &&
    isCurrentSession(token) &&
    current.current.canEdit &&
    current.current.writeEpoch === writeEpoch;
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const replay = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    lock.current = false;
    setPending('');
  }, [writeEpoch]);
  useLayoutEffect(() => {
    setError('');
  }, [token, scope]);
  const documentIds = [...new Set(node.linkedEntries.map((link) => link.documentId))];
  const client = useQueryClient();
  const chunks = Array.from({ length: Math.ceil(documentIds.length / 5) }, (_, index) =>
    documentIds.slice(index * 5, index * 5 + 5),
  );
  const documents = useQueries({
    queries: chunks.map((ids) => ({
      queryKey: queryKeys.mapDocuments(ids),
      queryFn: async () => {
        if (!isCurrent()) throw toAppError({ failure: 'Unauthorized' }, 'map:session');
        const values = await loadMapDocuments(ids);
        if (!isCurrent()) throw toAppError({ failure: 'Unauthorized' }, 'map:session');
        values.forEach((value, index) => {
          const id = ids[index];
          if (id) client.setQueryData(queryKeys.mapDocument(id), value);
        });
        return values;
      },
      retry: false,
    })),
  });
  const submap = maps.find((item) => item.id === node.submapId);
  async function unlink(documentId: string, relation: string) {
    if (
      lock.current ||
      !canWrite() ||
      !node.linkedEntries.some(
        (link) => link.documentId === documentId && link.relation === relation,
      )
    )
      return;
    const identity = `${documentId}:${relation}`;
    const key = replay.current.get(identity) ?? crypto.randomUUID();
    replay.current.set(identity, key);
    lock.current = true;
    setPending(identity);
    setError('');
    try {
      await changeEntry(
        { mapId: map.id, nodeId: node.id, documentId, relation },
        true,
        key,
      );
      if (!canWrite()) return;
      replay.current.delete(identity);
      await onReload();
    } catch (cause) {
      if (!canWrite()) return;
      setError(mapWriteError(cause));
      if (
        cause instanceof TransportError &&
        ['FORBIDDEN', 'UNAUTHENTICATED', 'UNAUTHORIZED'].includes(cause.code)
      ) {
        await onReload();
      }
    } finally {
      if (canWrite()) {
        lock.current = false;
        setPending('');
      }
    }
  }
  return {
    pending,
    error,
    documentIds,
    documents: documents.map((query) => ({
      ...query,
      retry: () => {
        if (isCurrent()) void query.refetch();
      },
    })),
    submap,
    unlink,
  };
}
