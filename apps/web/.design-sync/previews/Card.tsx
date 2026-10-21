import { Button, Card, Chip } from '@pi/chronicler-ds';

export function QuestCard() {
  return (
    <Card as="article" tone={1} pad={5} className="stack" data-gap="3" style={{ maxWidth: 420 }}>
      <Card.Eyebrow>Q-0147 · Levels 3–5</Card.Eyebrow>
      <Card.Header>
        <h3 className="type-heading" style={{ flex: 1 }}>
          The Drowned Bell of Saltmere
        </h3>
        <Chip tone="status">Open</Chip>
      </Card.Header>
      <Card.Body>
        <p className="type-body">
          Fishermen swear a bell tolls beneath the harbour at low tide. The reeve wants it silenced
          before the autumn fair draws pilgrims to the quay.
        </p>
      </Card.Body>
      <Card.Footer>
        <span className="type-caption">4 of 6 seats taken · Saturday 19:00 · Hosted by Ilse Varrow</span>
      </Card.Footer>
    </Card>
  );
}

export function Tones() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      {([1, 2, 3, 'flat'] as const).map((tone) => (
        <Card key={String(tone)} tone={tone} pad={4} style={{ minWidth: 140 }}>
          <p className="type-label">Tone {String(tone)}</p>
          <p className="type-caption">Surface depth</p>
        </Card>
      ))}
    </div>
  );
}

export function Clickable() {
  return (
    <Card variant="clickable" to="/chronicles/ashen-road" pad={4} style={{ maxWidth: 420 }}>
      <Card.Eyebrow>Chronicle · Session 12</Card.Eyebrow>
      <p className="type-title">Ambush at the Ashen Road</p>
      <p className="type-caption">Recorded by Ilse Varrow · 3 days ago</p>
    </Card>
  );
}

export function WithActions() {
  return (
    <Card pad={4} style={{ maxWidth: 420 }}>
      <div className="stack" data-gap="3">
        <p className="type-title">Brother Aldric Venn</p>
        <p className="type-body">Cleric of the Lantern · Level 4 · Played by Morwen</p>
        <div className="row" data-gap="2">
          <Button size="sm">Open sheet</Button>
          <Button size="sm" variant="ghost">
            Message player
          </Button>
        </div>
      </div>
    </Card>
  );
}
