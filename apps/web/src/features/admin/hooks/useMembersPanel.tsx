import { queryKeys } from '../../../api/queryKeys.js';
import { useAdminPage } from './useAdminPage.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const { query: directory, pagination } = useAdminPage(
    MEMBERS_KEY,
    authority,
    { search, role, status },
    (page, request) =>
      loadAdminMembers(
        {
          ...page,
          ...{
            search: search.trim() || undefined,
            role: role || undefined,
            status: status || undefined,
          },
        },
        request,
      ),
  );

  const saveRoles = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useMembersPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command) => {
      if (!selected) throw new Error('No member selected');
      return setMemberRoles(selected.id, draftRoles, command);
    }),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      if (selected?.id === authority.actorId)
        await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
    },
  });

  const bulkSelected = useMemo(
    () =>
      (directory.data ?? [])
        .filter((member) => checkedIds.has(member.id))
        .map((member) => ({
          id: member.id,
          handle: member.handle,
          displayName: member.displayName,
          roles: member.roles,
        })),
    [directory.data, checkedIds],
  );
  const bulkBar = useBulkRoleBar({
    selected: bulkSelected,
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
    pagination,
    role,
    setRole,
    status,
    setStatus,
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
