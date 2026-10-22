import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.js';
import { TransportError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useQuery } from '@tanstack/react-query';
import type {
  MapAtlasView,
  MapEdge,
  MapNode,
  MapRegion,
} from '../adapters/mapAdapter.js';
import {
  mapWriteError,
  changeEntry,
  createMap,
  loadLocationDocuments,
  saveEdge,
  saveNode,
} from '../adapters/mapAdapter.js';
import { queryKeys } from '../feature.js';
export type MapEdit =
  | { kind: 'create'; regions: MapRegion[]; global: boolean }
  | { kind: 'node'; map: MapAtlasView; node: MapNode | null; maps: MapAtlasView[] }
  | { kind: 'edge'; map: MapAtlasView; edge: MapEdge | null; nodes: MapNode[] }
  | { kind: 'link'; map: MapAtlasView; node: MapNode };
export function useMapEdit({
  edit,
  onClose,
  onSaved,
  onDenied,
  scopeKey,
  admit,
}: {
  edit: MapEdit;
  onClose: () => void;
  onSaved: (atlasCode?: string, nodeId?: string) => Promise<void>;
  onDenied: (message: string) => Promise<void>;
  scopeKey: string;
  admit: (regionId?: string | null) => boolean;
}) {
  const { token, isCurrentSession } = useAuth();
  const identity = JSON.stringify(
    edit.kind === 'create'
      ? ['create']
      : [
          edit.kind,
          edit.map.id,
          edit.kind === 'node'
            ? (edit.node?.id ?? null)
            : edit.kind === 'edge'
              ? (edit.edge?.id ?? null)
              : edit.node.id,
        ],
  );
  const current = useRef({ token, scopeKey, identity, admit });
  current.current = { token, scopeKey, identity, admit };
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () =>
    mounted.current &&
    token !== null &&
    isCurrentSession(token) &&
    current.current.token === token &&
    current.current.scopeKey === scopeKey &&
    current.current.identity === identity;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const busy = useRef(false);
  const replay = useRef({ payload: '', key: crypto.randomUUID() });
  const locations = useQuery({
    queryKey: queryKeys.mapLocations(search, offset),
    queryFn: async () => {
      if (!isCurrent() || !current.current.admit())
        throw toAppError({ failure: 'Unauthorized' }, 'map:session');
      const values = await loadLocationDocuments(search, offset);
      if (!isCurrent() || !current.current.admit())
        throw toAppError({ failure: 'Unauthorized' }, 'map:session');
      return values;
    },
    enabled: edit.kind === 'link' && isCurrent() && admit(),
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !isCurrent()) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const regionId = edit.kind === 'create' ? text('regionId') || null : undefined;
    if (!current.current.admit(regionId)) return;
    const active = () => isCurrent() && current.current.admit(regionId);
    const payload = JSON.stringify([...data.entries()]);
    if (replay.current.payload !== payload)
      replay.current = { payload, key: crypto.randomUUID() };
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const key = replay.current.key;
      if (edit.kind === 'create') {
        const created = await createMap(
          {
            name: text('name'),
            atlasCode: text('atlasCode'),
            family: text('family'),
            mapKind: 'pointcrawl',
            regionId: text('regionId') || null,
          },
          key,
        );
        if (!active()) return;
        await onSaved(created.atlasCode);
      } else if (edit.kind === 'node') {
        const node = await saveNode(
          edit.map.id,
          {
            id: edit.node?.id,
            name: text('name'),
            x: Number(text('x')),
            y: Number(text('y')),
            submapId: text('submapId') || null,
          },
          key,
        );
        if (!active()) return;
        await onSaved(undefined, node.id);
      } else if (edit.kind === 'edge') {
        await saveEdge(
          edit.map.id,
          {
            id: edit.edge?.id,
            nodeA: text('nodeA'),
            nodeB: text('nodeB'),
            directed: data.has('directed'),
            kind: text('kind'),
            label: text('label') || null,
            documentId: edit.edge?.documentId ?? null,
          },
          key,
        );
        if (!active()) return;
        await onSaved();
      } else {
        await changeEntry(
          {
            mapId: edit.map.id,
            nodeId: edit.node.id,
            documentId: text('documentId'),
            relation: 'location',
          },
          false,
          key,
        );
        if (!active()) return;
        await onSaved();
      }
      if (active()) onClose();
    } catch (cause) {
      if (!active()) return;
      if (
        cause instanceof TransportError &&
        (cause.code === 'FORBIDDEN' ||
          cause.code === 'UNAUTHENTICATED' ||
          cause.code === 'UNAUTHORIZED')
      ) {
        await onDenied(mapWriteError(cause));
        if (!active()) return;
      }
      setError(
        `${mapWriteError(cause)} Your entries are retained. Retry or close and refresh the map.`,
      );
    } finally {
      if (isCurrent()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return {
    pending,
    error,
    search,
    setSearch,
    offset,
    setOffset,
    locations,
    retryLocations: () => {
      if (isCurrent() && current.current.admit()) void locations.refetch();
    },
    submit,
    close: () => {
      if (isCurrent() && current.current.admit() && !busy.current) onClose();
    },
  };
}
