import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import { loadMap, loadMapDirectory, loadMapDocument } from '../adapters/mapAdapter.js';
import { toAppError } from '../../../errors/toAppError.js';
import { queryKeys } from '../feature.js';
import type { MapEdit } from './useMapEdit.js';

export function useMapPage(atlasCode: string) {
  const client = useQueryClient();
  const { token, sessionReady, isCurrentSession } = useAuth();
  const me = useMe();
  const session = useRef({ token, epoch: 0 });
  if (session.current.token !== token)
    session.current = { token, epoch: session.current.epoch + 1 };
  const actorScope = JSON.stringify([session.current.epoch, me.data?.id ?? null]);
  const directory = useQuery({
    queryKey: queryKeys.mapDirectory,
    queryFn: loadMapDirectory,
  });
  const selectedAtlas = atlasCode;
  const map = useQuery({
    queryKey: queryKeys.map(selectedAtlas),
    queryFn: () => loadMap(selectedAtlas),
    enabled: Boolean(selectedAtlas),
  });
  const directoryMaps = directory.data?.maps ?? [];
  const siblingData = useQueries({
    queries: directoryMaps
      .filter((item) => item.atlasCode !== selectedAtlas)
      .map((item) => ({
        queryKey: queryKeys.map(item.atlasCode),
        queryFn: () => loadMap(item.atlasCode),
        enabled: Boolean(selectedAtlas),
      })),
  });
  const siblingMaps = directoryMaps.filter(
    (item) =>
      item.id === map.data?.id ||
      (map.data?.regionId && item.regionId === map.data.regionId) ||
      map.data?.nodes.some((node) => node.submapId === item.id) ||
      siblingData.some(
        (query) =>
          query.data?.id === item.id &&
          query.data.nodes.some((node) => node.submapId === map.data?.id),
      ),
  );
  const isAdmin = Boolean(me.data?.roles.includes('admin'));
  const creatableRegions =
    directory.data?.regions.filter((region) => region.canCreateMap) ?? [];
  const authorityScope = JSON.stringify([
    [...(me.data?.roles ?? [])].sort(),
    map.data?.canEdit ?? false,
    map.isError,
    creatableRegions.map((region) => region.id).sort(),
    directory.isError,
  ]);
  const selectedMap = map.data ?? directoryMaps.find((item) => item.atlasCode === selectedAtlas);
  const region = directory.data?.regions.find((item) => item.id === selectedMap?.regionId);
  const regionDocumentId = region?.documentId ?? '';
  const current = useRef({ token, actorScope, selectedAtlas, regionDocumentId, map, directory, me });
  current.current = { token, actorScope, selectedAtlas, regionDocumentId, map, directory, me };
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrentActor = () =>
    mounted.current &&
    sessionReady &&
    current.current.token === token &&
    current.current.actorScope === actorScope &&
    (token === null || isCurrentSession(token));
  const isCurrent = () =>
    isCurrentActor() && current.current.selectedAtlas === selectedAtlas;
  const isCurrentDocument = () =>
    isCurrentActor() && current.current.regionDocumentId === regionDocumentId;
  const admitEdit = (edit: MapEdit, regionId?: string | null) => {
    const live = current.current;
    if (!isCurrent() || token === null || !live.me.data) return false;
    if (edit.kind === 'create') {
      if (live.directory.isError) return false;
      const regions =
        live.directory.data?.regions.filter((region) => region.canCreateMap) ?? [];
      const admin = live.me.data.roles.includes('admin');
      return regionId === undefined
        ? admin || regions.length > 0
        : regionId === null
          ? admin
          : regions.some((region) => region.id === regionId);
    }
    const liveMap = live.map.data;
    if (live.map.isError || !liveMap?.canEdit || liveMap.id !== edit.map.id)
      return false;
    if (edit.kind === 'node')
      return (
        edit.node === null || liveMap.nodes.some((node) => node.id === edit.node?.id)
      );
    if (edit.kind === 'link')
      return liveMap.nodes.some((node) => node.id === edit.node.id);
    return true;
  };
  const regionDocument = useQuery({
    queryKey: queryKeys.mapDocument(regionDocumentId),
    queryFn: async () => {
      if (!isCurrentDocument()) throw toAppError({ failure: 'Unauthorized' }, 'map:session');
      const document = await loadMapDocument(regionDocumentId);
      if (!isCurrentDocument()) throw toAppError({ failure: 'Unauthorized' }, 'map:session');
      return document;
    },
    enabled: Boolean(regionDocumentId) && sessionReady,
    retry: false,
  });
  return {
    actorScope,
    authorityScope,
    isCurrent,
    admitEdit,
    refresh: async () => {
      if (!isCurrent()) return false;
      await Promise.all([
        client.invalidateQueries({ queryKey: ['me'] }),
        client.invalidateQueries({ queryKey: queryKeys.mapDirectory }),
        client.invalidateQueries({ queryKey: ['mapDocuments'] }),
        client.invalidateQueries({ queryKey: ['mapDocument'] }),
        client.invalidateQueries({ queryKey: queryKeys.map(selectedAtlas) }),
      ]);
      return isCurrent();
    },
    retryDirectory: () => {
      if (isCurrent()) void directory.refetch();
    },
    retryMap: () => {
      if (isCurrent()) void map.refetch();
    },
    directory,
    map,
    region,
    regionDocument: {
      ...regionDocument,
      retry: () => {
        if (isCurrent()) void regionDocument.refetch();
      },
    },
    selectedAtlas,
    siblingMaps,
    creatableRegions,
    canCreate: Boolean(
      me.data && !directory.isError && (isAdmin || creatableRegions.length),
    ),
    isAdmin,
  };
}
