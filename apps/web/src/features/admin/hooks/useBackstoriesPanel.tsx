import { useAdminPage } from './useAdminPage.js';
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
  loadAllAdminRegions,
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
  const [cohort, setCohort] = useState('');
  const [regionId, setRegionId] = useState('');
  const { query: backstories, pagination } = useAdminPage(
    KEY,
    authority,
    { cohort, regionId },
    (page, request) =>
      loadAdminBackstories(
        {
          ...page,
          ...{ cohort: cohort || undefined, regionId: regionId || undefined },
        },
        request,
      ),
  );
  const regions = useQuery({
    enabled: authority.allowed,
    queryKey: ['adminRegionOptions', authority.cacheKey],
    queryFn: ({ signal }) => authority.read(loadAllAdminRegions, signal),
  });
  const [form, setForm] = useState<FormState>(BLANK);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useBackstoriesPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(async (command) => {
      if (form.backstoryId) {
        await updateBackstory(
          {
            backstoryId: form.backstoryId,
            name: form.name.trim(),
            lore: form.lore.trim(),
            cohort: form.cohort.trim(),
            sourceRegionId: form.sourceRegionId,
            retired: form.retired,
          },
          command,
        );
        return;
      }
      await createBackstory(
        {
          name: form.name.trim(),
          lore: form.lore.trim(),
          cohort: form.cohort.trim(),
          sourceRegionId: form.sourceRegionId,
        },
        command,
      );
    }),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
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
    pagination,
    cohort,
    setCohort,
    regionId,
    setRegionId,
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
