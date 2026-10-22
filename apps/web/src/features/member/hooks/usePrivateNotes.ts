import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  loadMyPrivateNotes,
  PRIVATE_NOTES_MAX,
  privateNotesLength,
  saveMyPrivateNotes,
  type PrivateNotesView,
} from '../adapters/privateNotesAdapter.js';

export type PrivateNotesData =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty'; view: PrivateNotesView }
  | { status: 'ready'; view: PrivateNotesView };

type Attempt = { token: string | null; memberId: string; body: string; key: string };

/** The signed-in member's private notes: load, a local draft, and an explicit save. */
export function usePrivateNotes() {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const client = useQueryClient();
  const memberId = me.data?.id;
  const q = useQuery({
    queryKey: queryKeys.myPrivateNotes(memberId ?? ''),
    queryFn: loadMyPrivateNotes,
    enabled: Boolean(memberId),
  });
  // The draft is tied to the member who typed it, so an account switch never shows it.
  const [draft, setDraft] = useState<{ memberId: string; value: string } | null>(null);
  const [savedFor, setSavedFor] = useState<Attempt | null>(null);
  const replay = useRef<Attempt | null>(null);

  const current = (attempt: Attempt | null | undefined) => {
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return Boolean(
      attempt &&
      isCurrentSession(attempt.token) &&
      account?.status === 'success' &&
      account.data?.id === attempt.memberId,
    );
  };

  const save = useMutation({
    mutationFn: (attempt: Attempt) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'notes:session');
      return saveMyPrivateNotes(attempt.body, attempt.key);
    },
    onMutate: (attempt) => {
      if (current(attempt)) setSavedFor(null);
    },
    onSuccess: (saved, attempt) => {
      if (!current(attempt)) return;
      if (replay.current === attempt) replay.current = null;
      client.setQueryData(queryKeys.myPrivateNotes(attempt.memberId), saved);
      setSavedFor(attempt);
      setDraft((value) =>
        value?.memberId === attempt.memberId && value.value === attempt.body
          ? null
          : value,
      );
    },
  });

  const saved = q.data?.body ?? '';
  const text = draft && draft.memberId === memberId ? draft.value : saved;
  const length = privateNotesLength(text);
  const overLimit = length > PRIVATE_NOTES_MAX;
  const dirty = text !== saved;

  const controls = {
    text,
    setText: (value: string) => {
      if (memberId) setDraft({ memberId, value });
    },
    length,
    max: PRIVATE_NOTES_MAX,
    overLimit,
    dirty,
    saving: save.isPending,
    justSaved: !dirty && current(savedFor),
    saveError:
      current(save.variables) && save.error
        ? toAppError(save.error, 'notes:save')
        : null,
    save: () => {
      if (!memberId || overLimit || !dirty || save.isPending) return;
      // A retry of the same text reuses its idempotency key.
      if (
        replay.current?.body !== text ||
        replay.current.token !== token ||
        replay.current.memberId !== memberId
      )
        replay.current = { token, memberId, body: text, key: crypto.randomUUID() };
      save.mutate(replay.current);
    },
  };

  let data: PrivateNotesData;
  if (me.isError) data = { status: 'error', error: toAppError(me.error, 'notes:me') };
  else if (q.isError)
    data = { status: 'error', error: toAppError(q.error, 'notes:load') };
  else if (!q.data) data = { status: 'loading' };
  else if (!q.data.body) data = { status: 'empty', view: q.data };
  else data = { status: 'ready', view: q.data };
  return { ...data, ...controls, retry: () => void q.refetch() };
}
