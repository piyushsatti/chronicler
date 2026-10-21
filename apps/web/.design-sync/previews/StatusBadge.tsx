import { StatusBadge } from '@pi/chronicler-ds';

export function QuestStates() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <StatusBadge status="open" />
      <StatusBadge status="filling" />
      <StatusBadge status="full" />
      <StatusBadge status="scheduled" />
      <StatusBadge status="live" />
      <StatusBadge status="completed" />
      <StatusBadge status="cancelled" />
    </div>
  );
}

export function CharacterStatus() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <StatusBadge status="alive" />
      <StatusBadge status="active" />
      <StatusBadge status="pending_approval" />
      <StatusBadge status="missing" />
      <StatusBadge status="retired" />
      <StatusBadge status="dead" />
    </div>
  );
}

export function WithCount() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <StatusBadge status="open" count="3 seats left" />
      <StatusBadge status="live" label="Live now" count="Session 12" />
      <StatusBadge status="alive" count={5} />
    </div>
  );
}
