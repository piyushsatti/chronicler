import { Link } from 'react-router-dom';
import type { AppError } from '../../errors/types.js';
import { Button } from '../primitives/Button.js';
import { useViewerAudience, type ViewerAudience } from './viewerAudience.js';

type DeniedReason = 'forbidden' | 'unauthorized';

const DENIED_COPY: Record<
  DeniedReason,
  Record<ViewerAudience, { title: string; body: string }>
> = {
  forbidden: {
    guest: {
      title: 'Sign in to see this',
      body: 'This page is for members of the server. Sign in with Discord to continue.',
    },
    member: {
      title: 'You don’t have access to this',
      body: 'Your account can’t open this page. If your role changed recently, reload your account or sign in again.',
    },
  },
  unauthorized: {
    guest: {
      title: 'Sign in to see this',
      body: 'This page is for members of the server. Sign in with Discord to continue.',
    },
    member: {
      title: 'Your session ended',
      body: 'Sign in again to pick up where you left off.',
    },
  },
};

/** One designed denial: heading, plain explanation, and a sign-in or way back. */
function DeniedPanel({
  reason,
  message,
  onRetry,
  retryLabel = 'Reload account',
}: {
  reason: DeniedReason;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}): React.JSX.Element {
  const { audience, rememberReturn } = useViewerAudience();
  const copy = DENIED_COPY[reason][audience];
  const body = audience === 'member' && message ? message : copy.body;
  const guest = audience === 'guest';
  return (
    <section
      className="card state-denied"
      role="alert"
      data-reason={reason}
      data-audience={audience}
    >
      <h2 className="type-title">{copy.title}</h2>
      <p className="type-body">{body}</p>
      <div className="row" data-wrap="1" data-gap="3">
        {guest || reason === 'unauthorized' ? (
          <Link className="btn btn--primary" to="/login" onClick={rememberReturn}>
            {guest ? 'Sign in' : 'Sign in again'}
          </Link>
        ) : (
          <>
            <Link className="btn" to="/">
              Back to home
            </Link>
            {onRetry ? (
              <Button variant="ghost" onClick={onRetry}>
                {retryLabel}
              </Button>
            ) : null}
            <Link className="btn btn--ghost" to="/login" onClick={rememberReturn}>
              Sign in again
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/** One line plus its action, for a region inside a page (a tab, a section). */
function InlineState({
  status,
  error,
  emptyMessage,
  deniedMessage,
  onRetry,
  retryLabel,
}: StatePanelProps & { emptyMessage: string }): React.JSX.Element {
  const { audience, rememberReturn } = useViewerAudience();
  if (status === 'loading') {
    return (
      <p className="state-inline type-caption" role="status" aria-busy="true">
        Loading…
      </p>
    );
  }
  if (status === 'empty') {
    return <p className="state-inline type-caption">{emptyMessage}</p>;
  }
  const reason: DeniedReason | null =
    status === 'denied'
      ? 'forbidden'
      : error?.kind === 'forbidden' || error?.kind === 'unauthorized'
        ? error.kind
        : null;
  const signIn = reason !== null && (audience === 'guest' || reason === 'unauthorized');
  const message = reason
    ? audience === 'member' && deniedMessage
      ? deniedMessage
      : `${DENIED_COPY[reason][audience].title}.`
    : (error?.userMessage ?? 'Something went wrong.');
  return (
    <div className="state-inline row" role="alert" data-wrap="1" data-gap="3">
      <p className="type-body">{message}</p>
      {signIn ? (
        <Link className="btn btn--sm" to="/login" onClick={rememberReturn}>
          {audience === 'guest' ? 'Sign in' : 'Sign in again'}
        </Link>
      ) : onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel ?? (reason ? 'Reload account' : 'Try again')}
        </Button>
      ) : null}
    </div>
  );
}

type StatePanelProps = {
  status: 'loading' | 'error' | 'empty' | 'denied';
  error?: AppError;
  emptyMessage?: string;
  /** Replaces the member explanation on a denial; guests always get the sign-in copy. */
  deniedMessage?: string;
  /** Offered on a member denial, for example to reload current access; inline, on any error. */
  onRetry?: () => void;
  retryLabel?: string;
  /** `page` (default) is the full card for page-level states; `inline` is one line plus the action, for sub-panels. */
  variant?: 'page' | 'inline';
};

export function StatePanel({
  status,
  error,
  emptyMessage = 'Nothing here yet.',
  deniedMessage,
  onRetry,
  retryLabel,
  variant = 'page',
}: StatePanelProps): React.JSX.Element {
  if (variant === 'inline') {
    return (
      <InlineState
        status={status}
        error={error}
        emptyMessage={emptyMessage}
        deniedMessage={deniedMessage}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    );
  }
  if (status === 'denied') {
    return (
      <DeniedPanel
        reason="forbidden"
        message={deniedMessage}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    );
  }
  if (status === 'error') {
    if (error?.kind === 'forbidden' || error?.kind === 'unauthorized') {
      return (
        <DeniedPanel
          reason={error.kind}
          message={deniedMessage}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      );
    }
    return (
      <div className="card" role="alert">
        <p className="type-body">{error?.userMessage ?? 'Something went wrong.'}</p>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className="card state-loading" role="status" aria-busy="true">
        <p className="type-caption">Loading…</p>
      </div>
    );
  }
  return (
    <div className="card state-empty">
      <p className="state-empty__title">{emptyMessage}</p>
    </div>
  );
}
