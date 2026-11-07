import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { searchRosterCharacters } from '../adapters/questRosterSearch.js';

export function useRosterCharacterSearch() {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const query = useQuery({
    queryKey: ['questRosterCharacters', trimmed],
    queryFn: () => searchRosterCharacters(trimmed),
    enabled: trimmed.length >= 2,
  });
  return {
    name,
    setName,
    matches: query.data ?? [],
    searching: query.isFetching,
    error: query.error,
  };
}

export type RosterCharacterSearch = ReturnType<typeof useRosterCharacterSearch>;
