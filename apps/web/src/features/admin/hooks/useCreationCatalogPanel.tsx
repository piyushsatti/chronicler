import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadAdminRegions,
  loadCreationCatalog,
  upsertCreationCatalogEntry,
  type AdminCatalogEntry,
} from '../adapters/adminAdapter.js';

const KEY = ['adminCreationCatalog'] as const;

type FormState = {
  optionId: string | null;
  kind: string;
  name: string;
  description: string;
  available: boolean;
  retired: boolean;
  introducedByRegionId: string;
};

const BLANK: FormState = {
  optionId: null,
  kind: '',
  name: '',
  description: '',
  available: true,
  retired: false,
  introducedByRegionId: '',
};

export function useCreationCatalogPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const catalog = useQuery({
    enabled: authority.allowed,
    queryKey: KEY,
    queryFn: loadCreationCatalog,
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
    mutationFn: authority.guardMutation(() =>
      upsertCreationCatalogEntry({
        optionId: form.optionId,
        kind: form.kind.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        available: form.available,
        retired: form.retired,
        introducedByRegionId: form.introducedByRegionId || null,
      }),
    ),
    onSuccess: async () => {
      setMessage(`Catalog entry "${form.name.trim()}" saved.`);
      setEditing(false);
      setForm(BLANK);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  function startEdit(entry: AdminCatalogEntry): void {
    setForm({
      optionId: entry.id,
      kind: entry.kind,
      name: entry.name,
      description: entry.description ?? '',
      available: entry.available,
      retired: entry.retired,
      introducedByRegionId: entry.introducedByRegionId ?? '',
    });
    setEditing(true);
  }
  useAuthorityFailures(catalog.error, regions.error, save.error);
  return {
    BLANK,
    catalog: panelState(catalog, 'admin:CreationCatalogPanel'),
    regions: panelState(regions, 'admin:CreationCatalogPanel'),
    form,
    setForm,
    editing,
    setEditing,
    message,
    save: panelState(save, 'admin:CreationCatalogPanel'),
    startEdit,
  };
}
