import { useLayoutEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { currentAccessIdentity } from '../auth/useCurrentAccess.js';
import { Toast } from '../components/primitives/Toast.js';
import { useMe } from '../hooks/useMe.js';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { clearToasts, dismissToast } from '../store/toastsSlice.js';

/** Live host bound to Redux toasts slice. */
export function ToastHost(): React.JSX.Element | null {
  const auth = useAuth();
  const me = useMe();
  const items = useAppSelector((s) => s.toasts.items);
  const dispatch = useAppDispatch();
  const authority =
    auth.token === null
      ? 'guest'
      : me.isSuccess && me.data.id === auth.memberId
        ? currentAccessIdentity(me.data)
        : null;
  const ready =
    auth.sessionReady &&
    (auth.token === null || (auth.isCurrentSession(auth.token) && authority !== null));
  const binding = useRef<{
    token: string | null;
    authority: string | null;
    ready: boolean;
  } | null>(null);
  const current =
    binding.current?.token === auth.token &&
    binding.current.authority === authority &&
    binding.current.ready === ready;
  useLayoutEffect(() => {
    if (
      binding.current?.token === auth.token &&
      binding.current.authority === authority &&
      binding.current.ready === ready
    )
      return;
    binding.current = { token: auth.token, authority, ready };
    dispatch(clearToasts());
  }, [auth.token, authority, ready, dispatch]);
  if (!current || !ready || items.length === 0) return null;
  return (
    <div className="pr-toast__stack" data-el="toast.host" aria-live="polite">
      {items.map((t) => (
        <Toast key={t.id} tone={t.tone} onDismiss={() => dispatch(dismissToast(t.id))}>
          {t.message}
        </Toast>
      ))}
    </div>
  );
}
