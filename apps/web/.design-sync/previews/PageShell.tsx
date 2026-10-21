import { Button, Card, Chip, PageShell } from '@pi/chronicler-ds';

export function Titled() {
  return (
    <div style={{ minHeight: 320 }}>
      <PageShell title="Ambush at the Ashen Road">
        <p className="type-caption">Chronicle · Session 12 · Recorded by Ilse Varrow</p>
        <p className="type-narrative">
          The caravan stalled at the ford when the first arrow took the lead mule. Hollin was
          already off the wagon, shield raised, before anyone else had seen the archers on the ridge.
        </p>
        <div className="row" data-gap="2">
          <Button size="sm">Edit chronicle</Button>
          <Button size="sm" variant="ghost">Share link</Button>
        </div>
      </PageShell>
    </div>
  );
}

export function WarRoomContext() {
  return (
    <div style={{ minHeight: 320 }}>
      <PageShell title="Calendar" context="war-room">
        <Card pad={4} className="stack" data-gap="2">
          <div className="row" data-gap="2" data-align="center">
            <p className="type-title" style={{ flex: 1 }}>The Drowned Bell of Saltmere</p>
            <Chip tone="status">Open</Chip>
          </div>
          <p className="type-caption">Sat 24 Oct 2026 · 19:00 · Hosted by Ilse Varrow</p>
        </Card>
      </PageShell>
    </div>
  );
}

export function TavernNarrow() {
  return (
    <div style={{ minHeight: 280 }}>
      <PageShell title="Guilds" context="tavern" max="narrow">
        <p className="type-body">
          Guild handles you have retired stay reserved for you, so nobody else can take your old
          name at the Lantern Abbey table.
        </p>
      </PageShell>
    </div>
  );
}

export function Untitled() {
  return (
    <div style={{ minHeight: 200 }}>
      <PageShell>
        <p className="type-heading">Your account</p>
        <p className="type-body">Signed in as Morwen Ashby · DM of 3 tables</p>
      </PageShell>
    </div>
  );
}
