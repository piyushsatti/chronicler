import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function useTimeAnchorPanel() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
  const anchors = useQuery({
    enabled: authority.allowed,
    queryKey: KEY,
    queryFn: loadTimeAnchors,
  });
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: authority.guardMutation(async () => {
      const epochDay = Number(form.epochDay);
      const rate = Number(form.rate);
      if (!form.realUtc || Number.isNaN(epochDay) || Number.isNaN(rate)) {
        throw new Error('Real UTC, epoch day, and rate are required.');
      }
      const realUtc = new Date(form.realUtc).toISOString();
      const note = form.note.trim() || null;
      if (editingId === 'new') {
        await createTimeAnchor({ realUtc, epochDay, rate, note });
      } else if (editingId) {
        await updateTimeAnchor({
          anchorId: editingId,
          realUtc,
          epochDay,
          rate,
          note,
        });
      }
    }),
    onSuccess: async () => {
      setMessage(editingId === 'new' ? 'Time anchor created.' : 'Time anchor updated.');
      setEditingId(null);
      setForm(BLANK);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  useAuthorityFailures(anchors.error, save.error);
  return {
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
