import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useMemo, useState } from 'react';
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
  roles: string[];
};

type BulkRoleBarProps = {
  selected: BulkRoleMember[];
  onApplied: (succeededIds: string[]) => void;
};

const BLANK_FORM: MemberRoleForm = {
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
  }, [selected, selectedKey]);

  const requiresExplicitChoice = homogeneousForm === null;
  const [form, setForm] = useState<MemberRoleForm>(homogeneousForm ?? BLANK_FORM);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setForm(homogeneousForm ?? BLANK_FORM);
    setTouched(false);
  }, [selectedKey, homogeneousForm]);

  const batch = useMutation<
    Awaited<ReturnType<typeof setMemberRolesBatch>>,
    unknown,
    void
  >({
    mutationKey: ['adminCommand', authority.commandKey, 'useBulkRoleBar'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(async (command) => {
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
    form,
    setForm,
    touched,
    setTouched,
    batch: panelState(batch, 'admin:BulkRoleBar'),
    selected,
  };
}
