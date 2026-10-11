import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBackstory,
  loadAdminBackstories,
  loadAdminRegions,
  updateBackstory,
  type AdminBackstoryRow,
} from '../adapters/adminAdapter.js';

const KEY = ['adminBackstories'] as const;

type FormState = {
  backstoryId: string | null;
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
  retired: boolean;
};

const BLANK: FormState = {
  backstoryId: null,
  name: '',
  lore: '',
  cohort: '',
  sourceRegionId: '',
  retired: false,
};

export function useBackstoriesPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const backstories = useQuery({
    enabled: authority.allowed,
    queryKey: KEY,
    queryFn: loadAdminBackstories,
  });
  const regions = useQuery({
    enabled: authority.allowed,
    queryKey: ['adminRegions'],
    queryFn: loadAdminRegions,
  });
  const [form, setForm] = useState<FormState>(BLANK);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: authority.guardMutation(async () => {
      if (form.backstoryId) {
        await updateBackstory({
          backstoryId: form.backstoryId,
          name: form.name.trim(),
          lore: form.lore.trim(),
          cohort: form.cohort.trim(),
          sourceRegionId: form.sourceRegionId,
          retired: form.retired,
        });
        return;
      }
      await createBackstory({
        name: form.name.trim(),
        lore: form.lore.trim(),
        cohort: form.cohort.trim(),
        sourceRegionId: form.sourceRegionId,
      });
    }),
    onSuccess: async () => {
      setMessage(`Backstory "${form.name.trim()}" saved.`);
      setEditing(false);
      setForm(BLANK);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  function startEdit(row: AdminBackstoryRow): void {
    setForm({
      backstoryId: row.id,
      name: row.name,
      lore: row.lore,
      cohort: row.cohort,
      sourceRegionId: row.sourceRegionId,
      retired: row.retired,
    });
    setEditing(true);
  }
  useAuthorityFailures(backstories.error, regions.error, save.error);
  return {
    BLANK,
    backstories: panelState(backstories, 'admin:BackstoriesPanel'),
    regions: panelState(regions, 'admin:BackstoriesPanel'),
    form,
    setForm,
    editing,
    setEditing,
    message,
    save: panelState(save, 'admin:BackstoriesPanel'),
    startEdit,
  };
}
