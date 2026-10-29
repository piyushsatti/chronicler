import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import { isAdmin } from '../../../auth/roles.js';
import { loadMyCharacters } from '../adapters/questAdapter.js';
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
    // A guest who also holds player is a player (D47).
    isGuest: (me.data?.roles.includes('guest') && !me.data.roles.includes('player')) ?? false,
    memberId: me.data?.id ?? null,
    retryCharacters: () => {
      // Once the member lookup succeeds the character query enables itself.
      if (me.isError) void me.refetch();
      else void characters.refetch();
    },
  };
}
