import type { AppError } from '../../errors/types.js';

export function StatePanel({
  status,
  error,
  emptyMessage = 'Nothing here yet.',
}: {
  status: 'loading' | 'error' | 'empty';
  error?: AppError;
  emptyMessage?: string;
}): React.JSX.Element {
  if (status === 'error') {
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
