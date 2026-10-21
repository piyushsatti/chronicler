import { StatTile } from '@pi/chronicler-ds';

export function Tones() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <StatTile label="Open quests" value={12} tone="accent" />
      <StatTile label="Sessions this month" value={9} tone="neutral" />
      <StatTile label="Live now" value={3} tone="good" />
      <StatTile label="Awaiting DM" value={4} tone="warn" />
      <StatTile label="Cancelled" value={1} tone="danger" />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="row" data-gap="3" data-wrap="1" data-align="end">
      <StatTile size="sm" label="Players" value={27} />
      <StatTile size="md" label="Characters" value={41} />
      <StatTile size="lg" label="Chronicles" value={128} />
    </div>
  );
}

export function WithHint() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <StatTile
        variant="countable"
        label="Recorded sessions"
        value={86}
        tone="accent"
        hint="+6 since September"
      />
      <StatTile label="Next session" value="Sat 19:00" hint="The Drowned Bell of Saltmere" />
    </div>
  );
}
