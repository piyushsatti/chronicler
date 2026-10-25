import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useQuery } from '@tanstack/react-query';
import { loadCharacterDirectory } from '../features/character/adapters/characterDirectoryAdapter.js';
import { loadCharacterParticipations } from '../features/character/adapters/characterTabsAdapter.js';
import { loadProfileActivity } from '../features/profile/adapters/profileActivityAdapter.js';

/** `loadHistory` loads quest history without the profile's own tab state (the /me history route). */
export function useProfileActivity(memberId: string, { loadHistory = false }: { loadHistory?: boolean } = {}) {
  const { token, sessionReady } = useAuth();
  const headers = { Authorization: token ? `Bearer ${token}` : '' };
  const [tab, setTab] = useState('about');
  const [characterPage, setCharacterPage] = useState(1);
  const characters = useQuery({
    queryKey: ['profileCharacters', memberId, characterPage],
    // An empty member id would read the whole directory, not one member's characters.
    enabled: sessionReady && Boolean(memberId),
    queryFn: ({ signal }) => loadCharacterDirectory({ ownerId: memberId }, 24, (characterPage - 1) * 24, { signal, headers }),
  });
  const activity = useQuery({
    queryKey: ['profileActivity', memberId],
    enabled: sessionReady && Boolean(memberId),
    queryFn: ({ signal }) => loadProfileActivity(memberId, { signal, headers }),
  });
  const history = useQuery({
    queryKey: ['profileHistory', memberId],
    enabled: sessionReady && Boolean(memberId) && (loadHistory || tab === 'history'),
    queryFn: async ({ signal }) => {
      const roster = [];
      for (;;) {
        signal.throwIfAborted();
        const page = await loadCharacterDirectory({ ownerId: memberId }, 100, roster.length, { signal, headers });
        roster.push(...page.items);
        if (roster.length >= page.total || page.items.length === 0) break;
      }
      signal.throwIfAborted();
      const lists = [];
      for (let offset = 0; offset < roster.length; offset += 4) {
        signal.throwIfAborted();
        lists.push(...await Promise.all(roster.slice(offset, offset + 4).map((character) => loadCharacterParticipations(character.id, { signal, headers }))));
      }
      return [...new Map(lists.flat().map((row) => [row.key, row])).values()];
    },
  });
  return { tab, setTab, characters, activity, history, characterPage, setCharacterPage };
}
