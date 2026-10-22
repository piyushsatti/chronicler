import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { regionInput, type RegionDraft } from '../adapters/adminForms.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AppError } from '../../../errors/types.js';
import {
  createRegion,
  loadAdminRegions,
  loadRegionArchonMemberIds,
  updateRegion,
  transitionRegion,
  type AdminRegionRow,
} from '../adapters/adminAdapter.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useAdminPage } from './useAdminPage.js';

const KEY = ['adminRegions'] as const;
type RegionEditor =
  | { status: 'loading'; region: AdminRegionRow }
  | { status: 'error'; region: AdminRegionRow; error: AppError }
  | {
      status: 'ready';
      region: AdminRegionRow;
      draft: RegionDraft;
      previousArchons: string[];
    };

type RegionAdvance = {
  region: AdminRegionRow;
  to: Parameters<typeof transitionRegion>[0]['to'];
  selection: number;
  scope: string;
};

function nextRegionKind(kind: string): RegionAdvance['to'] | null {
  return kind === 'uncharted' ? 'archon' : kind === 'archon' ? 'server' : null;
}

export function useRegionsPanel() {
  const authority = useAdminAuthority();
  const client = useQueryClient();
  const [filterKind, setFilterKind] = useState('');
  const { query: regions, pagination } = useAdminPage(
    KEY,
    authority,
    { filterKind },
    async (page, request) => {
      const rows = await loadAdminRegions(
        { ...page, limit: page.limit + 1, kind: filterKind || undefined },
        request,
      );
      return {
        items: rows.slice(0, page.limit),
        total: null,
        hasNext: rows.length > page.limit,
      };
    },
  );
  const [name, setName] = useState('');
  const [kind, setKind] = useState('uncharted');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<RegionEditor | null>(null);
  const [advancement, setAdvancement] = useState<RegionAdvance | null>(null);
  const advanceDispatch = useRef<RegionAdvance | null>(null);
  const selection = useRef(0);
  const create = useMutation<Awaited<ReturnType<typeof createRegion>>, unknown, void>({
    mutationKey: ['adminCommand', authority.commandKey, 'useRegionsPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command) =>
      createRegion({ name: name.trim(), kind }, command),
    ),
    onSuccess: async (region) => {
      if (!authority.isCurrent()) return;
      setMessage(`Region "${region.name}" created.`);
      setName('');
      await client.invalidateQueries({ queryKey: KEY });
      await client.invalidateQueries({ queryKey: ['adminRegionOptions'] });
    },
  });
  const beginEdit = async (region: AdminRegionRow) => {
    const selected = ++selection.current;
    setAdvancement(null);
    setEditing({ status: 'loading', region });
    try {
      const archons = await authority.read((request) =>
        loadRegionArchonMemberIds(region.id, request),
      );
      if (!authority.isCurrent() || selection.current !== selected) return;
      setEditing({
        status: 'ready',
        region,
        previousArchons: archons,
        draft: {
          name: region.name,
          kind: region.kind,
          documentId: region.documentId ?? '',
          charterDeadline: region.charterDeadline ?? '',
          archons: archons.join('\n'),
        },
      });
    } catch (error) {
      if (authority.isCurrent() && selection.current === selected)
        setEditing({
          status: 'error',
          region,
          error: toAppError(error, 'admin:region-assignments'),
        });
    }
  };
  const saveEdit = useMutation<Awaited<ReturnType<typeof updateRegion>>, unknown, void>(
    {
      mutationKey: ['adminCommand', authority.commandKey, 'useRegionsPanel'],
      networkMode: 'always',
      retry: false,
      mutationFn: authority.guardMutation((command) => {
        if (!editing || editing.status !== 'ready')
          throw safeAppError(
            'Load the region and its assignments before saving.',
            'admin:region',
          );
        return updateRegion(
          {
            regionId: editing.region.id,
            ...regionInput(editing.draft),
            kind: editing.region.kind,
            previousArchonMemberIds: editing.previousArchons,
          },
          command,
        );
      }),
      onSuccess: async (result) => {
        if (!authority.isCurrent()) return;
        if (result.outcome === 'partial') {
          setMessage(result.message);
          setEditing({
            status: 'error',
            region: result.region,
            error: safeAppError(result.message, 'admin:region-partial'),
          });
        } else {
          setMessage(`Region "${result.region.name}" saved.`);
          setEditing(null);
        }
        await client.invalidateQueries({ queryKey: KEY });
        await client.invalidateQueries({ queryKey: ['adminRegionOptions'] });
      },
    },
  );
  const hasCurrentAdvanceAuthority = (target: RegionAdvance) =>
    authority.isCurrent() && target.scope === authority.commandKey;
  const isCurrentAdvance = (target: RegionAdvance) =>
    hasCurrentAdvanceAuthority(target) && target.selection === selection.current;
  const refreshRegionReads = async (target: RegionAdvance) => {
    if (!hasCurrentAdvanceAuthority(target)) return;
    await client.invalidateQueries({ queryKey: [...KEY, authority.cacheKey] });
    if (!hasCurrentAdvanceAuthority(target)) return;
    await client.invalidateQueries({
      queryKey: ['adminRegionOptions', authority.cacheKey],
    });
  };
  const advanceMutation = useMutation<AdminRegionRow, unknown, RegionAdvance>({
    mutationKey: ['adminCommand', authority.commandKey, 'transitionRegion'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command, target) =>
      transitionRegion({ regionId: target.region.id, to: target.to }, command),
    ),
    onSuccess: async (region, target) => {
      if (!hasCurrentAdvanceAuthority(target)) return;
      if (target.selection === selection.current) {
        setMessage(`Region "${region.name}" advanced to ${region.kind}.`);
        setAdvancement(null);
        selection.current += 1;
      }
      await refreshRegionReads(target);
    },
    onError: async (error, target) => {
      if (!isCurrentAdvance(target)) return;
      const failure = toAppError(error, 'admin:region-transition');
      if (
        failure.cause instanceof TransportError &&
        failure.cause.code === 'CONFLICT'
      ) {
        await refreshRegionReads(target);
      }
    },
    onSettled: (_data, _error, target) => {
      if (advanceDispatch.current === target) advanceDispatch.current = null;
    },
  });
  const currentAdvancement =
    advancement?.scope === authority.commandKey &&
    advancement.selection === selection.current &&
    authority.allowed
      ? advancement
      : null;
  const advancePending =
    advanceMutation.isPending &&
    advanceMutation.variables?.scope === authority.commandKey;
  const currentAdvanceResult =
    currentAdvancement !== null &&
    advanceMutation.variables?.scope === currentAdvancement.scope &&
    advanceMutation.variables.selection === currentAdvancement.selection;
  const advanceError =
    currentAdvanceResult && advanceMutation.isError
      ? toAppError(advanceMutation.error, 'admin:region-transition')
      : null;
  const advanceConflict =
    advanceError?.cause instanceof TransportError &&
    advanceError.cause.code === 'CONFLICT';
  const commandPending = create.isPending || saveEdit.isPending || advancePending;
  useAuthorityFailures(
    regions.error,
    create.error,
    saveEdit.error,
    editing?.status === 'error' ? editing.error : null,
    currentAdvanceResult ? advanceMutation.error : null,
  );
  return {
    regions,
    pagination,
    filterKind,
    setFilterKind,
    name,
    setName,
    kind,
    setKind,
    message,
    editing,
    commandPending,
    advancement: currentAdvancement,
    nextKind: nextRegionKind,
    advance: {
      isPending: advancePending,
      conflict: advanceConflict,
      error: advanceConflict
        ? safeAppError(
            'This region changed. Close this dialog and review its current state before advancing.',
            'admin:region-transition',
            advanceError,
          )
        : advanceError,
    },
    beginAdvance: (region: AdminRegionRow) => {
      const to = nextRegionKind(region.kind);
      if (!to || editing || commandPending || !authority.isCurrent()) return;
      setAdvancement({
        region,
        to,
        selection: ++selection.current,
        scope: authority.commandKey,
      });
    },
    cancelAdvance: () => {
      selection.current += 1;
      setAdvancement(null);
    },
    confirmAdvance: () => {
      if (
        !currentAdvancement ||
        commandPending ||
        advanceDispatch.current?.scope === authority.commandKey
      )
        return;
      advanceDispatch.current = currentAdvancement;
      advanceMutation.mutate(currentAdvancement);
    },
    beginEdit,
    cancelEdit: () => {
      selection.current += 1;
      setEditing(null);
    },
    setDraft: (draft: RegionDraft) =>
      setEditing((current) =>
        current?.status === 'ready' ? { ...current, draft } : current,
      ),
    create: panelState(create, 'admin:region-create'),
    saveEdit: panelState(saveEdit, 'admin:region-save'),
  };
}
