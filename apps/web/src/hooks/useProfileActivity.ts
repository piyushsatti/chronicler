import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useQuery } from '@tanstack/react-query';
import { loadCharacterDirectory } from '../features/character/adapters/characterDirectoryAdapter.js';
import { loadCharacterParticipations } from '../features/character/adapters/characterTabsAdapter.js';
import { loadProfileActivity } from '../features/profile/adapters/profileActivityAdapter.js';

export function useProfileActivity(memberId: string) {
  const { token, sessionReady } = useAuth();
  const headers = { Authorization: token ? `Bearer ${token}` : '' };
  const [tab, setTab] = useState('about');
  const [characterPage, setCharacterPage] = useState(1);
  const characters = useQuery({
    queryKey: ['profileCharacters', memberId, characterPage],
    enabled: sessionReady,
    queryFn: ({ signal }) => loadCharacterDirectory({ ownerId: memberId }, 24, (characterPage - 1) * 24, { signal, headers }),
  });
  const activity = useQuery({
    queryKey: ['profileActivity', memberId],
    enabled: sessionReady,
    queryFn: ({ signal }) => loadProfileActivity(memberId, { signal, headers }),
  });
  const history = useQuery({
    queryKey: ['profileHistory', memberId],
    enabled: sessionReady && tab === 'history',
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
