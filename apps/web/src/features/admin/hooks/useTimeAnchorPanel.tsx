import { safeAppError } from '../../../errors/toAppError.js';
import { timeAnchorInput } from '../adapters/adminForms.js';
import { useAdminPage } from './useAdminPage.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTimeAnchor,
  loadTimeAnchors,
  updateTimeAnchor,
} from '../adapters/adminAdapter.js';

const KEY = ['adminTimeAnchors'] as const;

type FormState = {
  realUtc: string;
  epochDay: string;
  rate: string;
  note: string;
};

const BLANK: FormState = { realUtc: '', epochDay: '', rate: '1', note: '' };

function toLocalInputValue(iso: string): string {
  return iso;
}

export function useTimeAnchorPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const { query: anchors, pagination } = useAdminPage(
    KEY,
    authority,
    {},
    (page, request) => loadTimeAnchors({ ...page, ...{} }, request),
  );
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationKey: ['adminCommand', authority.commandKey, 'useTimeAnchorPanel'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(async (command) => {
      if (!editingId)
        throw safeAppError('Select a time anchor before saving.', 'admin:time-anchor');
      const input = timeAnchorInput(form);
      if (editingId === 'new') await createTimeAnchor(input, command);
      else await updateTimeAnchor({ anchorId: editingId, ...input }, command);
    }),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      setMessage(editingId === 'new' ? 'Time anchor created.' : 'Time anchor updated.');
      setEditingId(null);
      setForm(BLANK);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  useAuthorityFailures(anchors.error, save.error);
  return {
    pagination,
    BLANK,
    toLocalInputValue,
    anchors: panelState(anchors, 'admin:TimeAnchorPanel'),
    editingId,
    setEditingId,
    form,
    setForm,
    message,
    save: panelState(save, 'admin:TimeAnchorPanel'),
  };
}
