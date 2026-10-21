import { Legend } from '@pi/chronicler-ds';

export function QuestStatus() {
  return (
    <Legend
      aria-label="Quest status legend"
      items={[
        { id: 'open', label: '● Open' },
        { id: 'full', label: '● Full' },
        { id: 'closed', label: '● Closed' },
      ]}
    />
  );
}

export function SessionHeat() {
  return (
    <Legend
      aria-label="Session activity legend"
      items={[
        { id: 'none', label: '○ No sessions' },
        { id: 'one', label: '● 1 session' },
        { id: 'many', label: '●● 2+ sessions' },
      ]}
    />
  );
}
