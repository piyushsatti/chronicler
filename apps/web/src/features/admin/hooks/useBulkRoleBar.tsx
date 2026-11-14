import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { setMemberRolesBatch } from '../adapters/adminAdapter.js';
import {
  roleFormFromRoles,
  roleFormsEqual,
  rolesFromForm,
  type MemberRoleForm,
} from '../personRoles.js';

export type BulkRoleMember = {
  id: string;
  handle: string;
  displayName: string;
  roles: string[];
};

type BulkRoleBarProps = {
  selected: BulkRoleMember[];
  onApplied: (succeededIds: string[]) => void;
};

export const BLANK_BULK_ROLE_FORM: MemberRoleForm = {
  baseTier: 'Player',
  grantDm: false,
  grantArchon: false,
  grantLieutenant: false,
  grantVerifier: false,
  grantAdmin: false,
};

export function useBulkRoleBar({ selected, onApplied }: BulkRoleBarProps) {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const [submittedMembers, setSubmittedMembers] = useState<BulkRoleMember[]>([]);
  const [report, setReport] = useState<{ id: string; ok: boolean; error?: string }[]>(
    [],
  );

  const selectedKey = useMemo(
    () => [...selected.map((m) => m.id)].sort().join(','),
    [selected],
  );

  const homogeneousForm = useMemo<MemberRoleForm | null>(() => {
    if (selected.length === 0) return null;
    const forms = selected.map((m) => roleFormFromRoles(m.roles));
    const [first, ...rest] = forms;
    return rest.every((f) => roleFormsEqual(f, first)) ? first : null;
  }, [selected]);

  const requiresExplicitChoice = homogeneousForm === null;

  const batch = useMutation<
    Awaited<ReturnType<typeof setMemberRolesBatch>>,
    unknown,
    MemberRoleForm
  >({
    mutationKey: ['adminCommand', authority.commandKey, 'useBulkRoleBar'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(async (command, form) => {
      setSubmittedMembers(selected);
      return setMemberRolesBatch(
        {
          memberIds: selected.map((m) => m.id),
          roles: rolesFromForm(form),
        },
        command,
      );
    }),
    onSuccess: (results) => {
      if (!authority.isCurrent()) return;
      setReport(
        results.map((r) => ({
          id: r.memberId,
          ok: r.ok,
          error: r.error,
        })),
      );
      onApplied(results.filter((r) => r.ok).map((r) => r.memberId));
      if (results.some((r) => r.ok && r.memberId === authority.actorId))
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  useAuthorityFailures(batch.error);
  return {
    submittedMembers,
    report,
    requiresExplicitChoice,
    homogeneousForm,
    selectedKey,
    batch: panelState(batch, 'admin:BulkRoleBar'),
    selected,
  };
}

export function useBulkRoleForm(initial: MemberRoleForm) {
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  return { form, setForm, touched, setTouched };
}
