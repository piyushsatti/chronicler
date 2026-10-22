import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import { isAdmin } from '../../../auth/roles.js';
import { loadMyCharacters } from '../adapters/questAdapter.js';
import {
  loadQuestArcOptions,
  loadQuestMapOptions,
  loadQuestNodeOptions,
} from '../adapters/questOptionsAdapter.js';
import { useQuestPage } from './useQuestPage.js';
import { useQuestMutations } from './useQuestMutations.js';

export function useQuestDetailPage(code: string) {
  const page = useQuestPage(code);
  const auth = useAuth();
  const me = useMe();
  const quest = page.status === 'ready' ? page.view : null;
  const canManage = Boolean(
    auth.isAuthenticated &&
    me.data &&
    quest &&
    (me.data.id === quest.dmId || isAdmin(me.data.roles)),
  );
  const characters = useQuery({
    queryKey: ['questCharacters', me.data?.id],
    queryFn: loadMyCharacters,
    enabled: auth.isAuthenticated && Boolean(me.data),
    retry: false,
  });
  const commands = useQuestMutations(quest?.shortCode ?? code, quest?.id ?? '');
  const [atlasCode, setAtlasCode] = useState('');
  const arcs = useQuery({
    queryKey: ['questOptions', 'arcs'],
    queryFn: loadQuestArcOptions,
    enabled: canManage,
  });
  const maps = useQuery({
    queryKey: ['questOptions', 'maps'],
    queryFn: loadQuestMapOptions,
    enabled: canManage,
  });
  const nodes = useQuery({
    queryKey: ['questOptions', 'nodes', atlasCode],
    queryFn: () => loadQuestNodeOptions(atlasCode),
    enabled: canManage && atlasCode !== '',
  });
  // The character query waits on the member lookup. A disabled query stays
  // `isPending` forever, so a failed lookup must surface as the error rather
  // than as an endless "Loading your characters…".
  const charactersError = characters.error ?? (me.isError ? me.error : null);
  const charactersLoading = !charactersError && (me.isLoading || characters.isLoading);
  return {
    page,
    commands,
    characters,
    charactersLoading,
    charactersError,
    canManage,
    isAuthenticated: auth.isAuthenticated,
    memberId: me.data?.id ?? null,
    arcs,
    maps,
    nodes,
    atlasCode,
    setAtlasCode,
    retryCharacters: () => {
      // Once the member lookup succeeds the character query enables itself.
      if (me.isError) void me.refetch();
      else void characters.refetch();
    },
    retryAssociations: () => {
      void arcs.refetch();
      void maps.refetch();
      if (atlasCode) void nodes.refetch();
    },
  };
}
