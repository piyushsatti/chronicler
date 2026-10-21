import { StatePanel } from '@pi/chronicler-ds';

export function Empty() {
  return <StatePanel status="empty" emptyMessage="No quests posted for this season yet." />;
}

export function Loading() {
  return <StatePanel status="loading" />;
}

export function Error() {
  return (
    <StatePanel
      status="error"
      error={{ kind: 'network', userMessage: 'Could not reach the quest board. Check your connection and try again.' }}
    />
  );
}
