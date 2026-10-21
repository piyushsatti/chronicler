import { ErrorState } from '@pi/chronicler-ds';

const noop = () => undefined;

export function WithRetry() {
  return (
    <ErrorState
      title="Could not load the quest board"
      message="The tavern runner never came back. Check your connection and try again."
      onRetry={noop}
    />
  );
}

export function DefaultTitle() {
  return <ErrorState message="The Session 14 chronicle failed to save. Your draft is kept locally." />;
}

export function WithDetails() {
  return (
    <ErrorState title="Character sheet unavailable" onRetry={noop}>
      <p className="type-caption">Request ID 7f3a-dunnshore-0142</p>
    </ErrorState>
  );
}
