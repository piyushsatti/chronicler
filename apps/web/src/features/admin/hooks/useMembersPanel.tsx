import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadAdminMembers,
  setMemberRoles,
  type AdminMemberRow,
} from '../adapters/adminAdapter.js';
import { useBulkRoleBar } from './useBulkRoleBar.js';

const MEMBERS_KEY = ['adminMembers'] as const;

const ROLE_OPTIONS = [
  'player',
  'dm',
  'lieutenant',
  'archon',
  'verifier',
  'admin',
] as const;

export function useMembersPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminMemberRow | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const directory = useQuery({
    enabled: authority.allowed,
    queryKey: [...MEMBERS_KEY, search],
    queryFn: () => loadAdminMembers(search),
  });

  const saveRoles = useMutation({
    mutationFn: authority.guardMutation(() => {
      if (!selected) throw new Error('No member selected');
      return setMemberRoles(selected.id, draftRoles);
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
    },
  });

  const bulkSelected = (directory.data ?? []).filter((m) => checkedIds.has(m.id));
  const bulkBar = useBulkRoleBar({
    selected: bulkSelected.map((m) => ({
      id: m.id,
      handle: m.handle,
      roles: m.roles,
    })),
    onApplied: (succeededIds) => {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const id of succeededIds) next.delete(id);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
    },
  });
  useAuthorityFailures(directory.error, saveRoles.error);
  return {
    ROLE_OPTIONS,
    searchInput,
    setSearchInput,
    selected,
    setSelected,
    draftRoles,
    setDraftRoles,
    checkedIds,
    setCheckedIds,
    directory: panelState(directory, 'admin:MembersPanel'),
    saveRoles: panelState(saveRoles, 'admin:MembersPanel'),
    bulkBar,
  };
}
