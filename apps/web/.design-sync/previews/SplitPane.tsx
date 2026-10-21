import { Card, Chip, SplitPane } from '@pi/chronicler-ds';

export function QuestAndRoster() {
  return (
    <SplitPane
      label="Quest and roster"
      start={
        <Card pad={4} className="stack" data-gap="2">
          <Card.Eyebrow>Q-0147 · Levels 3–5</Card.Eyebrow>
          <p className="type-heading">The Drowned Bell of Saltmere</p>
          <p className="type-body">
            Fishermen swear a bell tolls beneath the harbour at low tide. The reeve wants it
            silenced before the autumn fair.
          </p>
        </Card>
      }
      end={
        <Card pad={4} className="stack" data-gap="2">
          <p className="type-label">Roster · 4 of 6</p>
          <p className="type-body">Brother Aldric Venn · Cleric 4</p>
          <p className="type-body">Sable Wren · Rogue 3</p>
          <p className="type-body">Hollin Brask · Fighter 5</p>
          <p className="type-body">Maren Thistle · Druid 4</p>
        </Card>
      }
    />
  );
}

export function DraftAndPreview() {
  return (
    <SplitPane
      label="Chronicle draft and preview"
      start={
        <Card tone={2} pad={4} className="stack" data-gap="2">
          <p className="type-label">Draft</p>
          <p className="type-code">## Session 12 — Ambush at the Ashen Road</p>
          <p className="type-code">The caravan stalled at the ford when the first arrow…</p>
        </Card>
      }
      end={
        <Card pad={4} className="stack" data-gap="2">
          <div className="row" data-gap="2" data-align="center">
            <p className="type-label" style={{ flex: 1 }}>Preview</p>
            <Chip tone="status">Unpublished</Chip>
          </div>
          <p className="type-title">Session 12 — Ambush at the Ashen Road</p>
          <p className="type-narrative">The caravan stalled at the ford when the first arrow…</p>
        </Card>
      }
    />
  );
}
