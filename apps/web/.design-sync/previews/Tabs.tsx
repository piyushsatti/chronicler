import { Tabs, StatePanel } from '@pi/chronicler-ds';

export function QuestDetail() {
  return (
    <Tabs
      items={[
        {
          id: 'roster',
          label: 'Roster',
          panel: (
            <ul className="stack" data-gap="2">
              <li className="type-body">Thalia Brightwater · Cleric 5</li>
              <li className="type-body">Korrin Ashfoot · Rogue 4</li>
              <li className="type-body">Mirelle Vane · Wizard 5</li>
            </ul>
          ),
        },
        {
          id: 'chronicle',
          label: 'Chronicle',
          panel: <p className="type-body">The party descended into the Sunken Archive.</p>,
        },
        { id: 'notes', label: 'DM notes', panel: <p className="type-body">Hidden from players.</p> },
      ]}
    />
  );
}

export function SecondTabActive() {
  return (
    <Tabs
      defaultTabId="history"
      items={[
        { id: 'progression', label: 'Progression', panel: <p className="type-body">Level 5 · 6,500 XP</p> },
        {
          id: 'history',
          label: 'History',
          panel: (
            <div className="stack" data-gap="2">
              <p className="type-title">The Ember Road, Session 3</p>
              <p className="type-caption">Played 17 Oct 2026 · +900 XP · 120 gp</p>
            </div>
          ),
        },
        { id: 'inventory', label: 'Inventory', panel: <p className="type-body">Longbow, healer's kit</p> },
      ]}
    />
  );
}

export function EmptyPanel() {
  return (
    <Tabs
      items={[
        {
          id: 'characters',
          label: 'Characters',
          panel: <StatePanel status="empty" emptyMessage="No characters waiting for review." />,
        },
        { id: 'quests', label: 'Quests', panel: <p className="type-body">2 quests pending.</p> },
      ]}
    />
  );
}
