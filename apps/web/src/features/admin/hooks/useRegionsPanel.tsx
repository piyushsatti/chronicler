import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRegion,
  loadAdminRegions,
  loadRegionArchonMemberId,
  updateRegion,
  type AdminRegionRow,
} from '../adapters/adminAdapter.js';

const KEY = ['adminRegions'] as const;

export function useRegionsPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const regions = useQuery({
    enabled: authority.allowed,
    queryKey: KEY,
    queryFn: loadAdminRegions,
  });
  const [name, setName] = useState('');
  const [kind, setKind] = useState('uncharted');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRegionRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState('uncharted');
  const [editArchon, setEditArchon] = useState('');
  const [previousArchon, setPreviousArchon] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: authority.guardMutation(() =>
      createRegion({ name: name.trim(), kind }),
    ),
    onSuccess: async (region) => {
      setMessage(`Region "${region.name}" created.`);
      setName('');
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const beginEdit = async (region: AdminRegionRow) => {
    setEditing(region);
    setEditName(region.name);
    setEditKind(region.kind);
    setEditArchon('');
    setPreviousArchon(null);
    try {
      const current = await loadRegionArchonMemberId(region.id);
      setPreviousArchon(current);
      setEditArchon(current ?? '');
    } catch {
      // Authority failure path still surfaces via saveEdit / regions.
    }
  };

  const saveEdit = useMutation({
    mutationFn: authority.guardMutation(() => {
      if (!editing) throw new Error('No region selected');
      return updateRegion({
        regionId: editing.id,
        name: editName.trim(),
        kind: editKind,
        archonMemberId: editArchon.trim() || null,
        previousArchonMemberId: previousArchon,
      });
    }),
    onSuccess: async (region) => {
      setMessage(`Region "${region.name}" updated.`);
      setEditing(null);
      setPreviousArchon(null);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  useAuthorityFailures(regions.error, create.error, saveEdit.error);
  return {
    regions: panelState(regions, 'admin:RegionsPanel'),
    name,
    setName,
    kind,
    setKind,
    message,
    editing,
    beginEdit,
    setEditing,
    editName,
    setEditName,
    editKind,
    setEditKind,
    editArchon,
    setEditArchon,
    create: panelState(create, 'admin:RegionsPanel'),
    saveEdit: panelState(saveEdit, 'admin:RegionsPanel'),
  };
}
