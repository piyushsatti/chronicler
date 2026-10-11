import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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

  const batch = useMutation({
    mutationFn: authority.guardMutation(() =>
      setMemberRolesBatch({
        memberIds: selected.map((m) => m.id),
        roles: rolesFromForm(form),
      }),
    ),
    onSuccess: (results) => {
      setSubmittedMembers(selected);
      setReport(
        results.map((r) => ({
          id: r.memberId,
          ok: r.ok,
          error: r.error,
        })),
      );
      onApplied(results.filter((r) => r.ok).map((r) => r.memberId));
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
