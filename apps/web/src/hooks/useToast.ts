import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { addToast, type ToastTone } from '../store/toastsSlice.js';

/** Hook-shaped helper for gallery / panels without prop drilling. */
export function useToast(): {
  addToast: (
    message: string,
    tone?: ToastTone,
    options?: { id?: string; durationMs?: number },
  ) => void;
} {
  const dispatch = useAppDispatch();
  const generation = useAppSelector((s) => s.toasts.generation);
  const { token, isCurrentSession } = useAuth();
  const enqueue = useCallback(
    (
      message: string,
      tone: ToastTone = 'info',
      options?: { id?: string; durationMs?: number },
    ) => {
      if (token !== null && !isCurrentSession(token)) return;
      dispatch(addToast({ message, tone, generation, ...options }));
    },
    [dispatch, generation, token, isCurrentSession],
  );
  return {
    addToast: enqueue,
  };
}
