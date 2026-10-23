import type { ReactNode } from 'react';
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

/** One designed denial: heading, plain explanation, one way forward.
 * Guests (and ended sessions) sign in; members who lack access go back home,
 * with the caller's retry (e.g. reload account) as the only extra. */
function DeniedPanel({
  reason,
  title,
  message,
  action,
  onRetry,
  retryLabel = 'Reload account',
}: {
  reason: DeniedReason;
  title?: string;
  message?: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}): React.JSX.Element {
  const { audience, rememberReturn } = useViewerAudience();
  const copy = DENIED_COPY[reason][audience];
  const body = audience === 'member' && message ? message : copy.body;
  const signIn = audience === 'guest' || reason === 'unauthorized';
  return (
    <PanelSurface
      state="denied"
      role="alert"
      title={audience === 'member' && title ? title : copy.title}
      body={body}
      data={{ 'data-reason': reason, 'data-audience': audience }}
    >
      {signIn ? (
        <Link className="btn btn--primary" to="/login" onClick={rememberReturn}>
          {audience === 'guest' ? 'Sign in' : 'Sign in again'}
        </Link>
      ) : (
        <>
          {action ?? (
            <Link className="btn" to="/">
              Back to home
            </Link>
          )}
          {onRetry ? (
            <Button variant="ghost" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </>
      )}
    </PanelSurface>
  );
}

/** The one page-level state surface: a parchment card at frame width with an
 * optional heading, one sentence, and its action row. */
function PanelSurface({
  state,
  role,
  title,
  body,
  data,
  busy,
  children,
}: {
  state: 'denied' | 'error' | 'empty' | 'loading';
  role?: 'alert' | 'status';
  title?: string;
  body: ReactNode;
  data?: Record<string, string>;
  busy?: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <section
      className={state === 'loading' ? 'card state-panel state-loading' : 'card state-panel'}
      role={role}
      aria-busy={busy || undefined}
      data-state={state}
      {...data}
    >
      {title ? <h2 className="type-title">{title}</h2> : null}
      <p className={state === 'loading' ? 'type-caption' : 'type-body'}>{body}</p>
      {children ? (
        <div className="state-panel__actions row" data-wrap="1" data-gap="3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** One line plus its action, for a region inside a page (a tab, a section). */
function InlineState({
  status,
  error,
  emptyMessage,
  deniedMessage,
  action,
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
    return action ? (
      <div className="state-inline row" data-wrap="1" data-gap="3">
        <p className="type-body">{emptyMessage}</p>
        {action}
      </div>
    ) : (
      <p className="state-inline type-caption">{emptyMessage}</p>
    );
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
  /** Page variant: a short heading ("DM table not found"). Denials keep their
   * own heading for guests; members see this one when given. */
  title?: string;
  emptyMessage?: string;
  /** Replaces the member explanation on a denial; guests always get the sign-in copy. */
  deniedMessage?: string;
  /** The one action for an empty, error or member-denied page state, usually
   * a Link ("Find a quest", "Back to Codex"). */
  action?: ReactNode;
  /** Offered on a member denial, for example to reload current access; on any error. */
  onRetry?: () => void;
  retryLabel?: string;
  /** `page` (default) is the full card for page-level states; `inline` is one line plus the action, for sub-panels. */
  variant?: 'page' | 'inline';
};

export function StatePanel({
  status,
  error,
  title,
  emptyMessage = 'Nothing here yet.',
  deniedMessage,
  action,
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
        action={action}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    );
  }
  if (status === 'denied') {
    return (
      <DeniedPanel
        reason="forbidden"
        title={title}
        message={deniedMessage}
        action={action}
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
          title={title}
          message={deniedMessage}
          action={action}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      );
    }
    return (
      <PanelSurface
        state="error"
        role="alert"
        title={title}
        body={error?.userMessage ?? 'Something went wrong.'}
      >
        {action}
        {onRetry ? (
          <Button variant={action ? 'ghost' : 'secondary'} onClick={onRetry}>
            {retryLabel ?? 'Try again'}
          </Button>
        ) : null}
      </PanelSurface>
    );
  }
  if (status === 'loading') {
    return <PanelSurface state="loading" role="status" busy body="Loading…" />;
  }
  return (
    <PanelSurface state="empty" title={title} body={emptyMessage}>
      {action}
    </PanelSurface>
  );
}
