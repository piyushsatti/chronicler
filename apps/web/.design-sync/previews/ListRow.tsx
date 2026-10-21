import { Avatar, Chip, ListRow } from '@pi/chronicler-ds';

export function Static() {
  return (
    <div className="stack" data-gap="2" style={{ maxWidth: 480 }}>
      <ListRow>
        <div className="row" data-gap="3" data-align="center">
          <Avatar name="Ilse Varrow" size="sm" />
          <div className="stack" data-gap="1" style={{ flex: 1 }}>
            <span className="type-title">Session 12 · Ambush at the Ashen Road</span>
            <span className="type-caption">Recorded by Ilse Varrow · 14 Oct 2026</span>
          </div>
        </div>
      </ListRow>
      <ListRow>
        <div className="row" data-gap="3" data-align="center">
          <Avatar name="Corwin Hale" size="sm" />
          <div className="stack" data-gap="1" style={{ flex: 1 }}>
            <span className="type-title">Session 11 · The Ferryman's Toll</span>
            <span className="type-caption">Recorded by Corwin Hale · 7 Oct 2026</span>
          </div>
        </div>
      </ListRow>
    </div>
  );
}

export function Clickable() {
  return (
    <div className="stack" data-gap="2" style={{ maxWidth: 480 }}>
      <ListRow variant="clickable" onClick={() => undefined}>
        <div className="row" data-gap="3" data-align="center">
          <span className="type-body" style={{ flex: 1 }}>The Drowned Bell of Saltmere</span>
          <Chip tone="status">Open</Chip>
        </div>
      </ListRow>
      <ListRow variant="clickable" onClick={() => undefined}>
        <div className="row" data-gap="3" data-align="center">
          <span className="type-body" style={{ flex: 1 }}>Ashes over the Ember Pass</span>
          <Chip tone="status">Full</Chip>
        </div>
      </ListRow>
      <ListRow variant="clickable" onClick={() => undefined} disabled>
        <div className="row" data-gap="3" data-align="center">
          <span className="type-body" style={{ flex: 1 }}>Smugglers of the Salt Stair</span>
          <Chip tone="status">Draft</Chip>
        </div>
      </ListRow>
    </div>
  );
}

export function Selectable() {
  return (
    <div className="stack" data-gap="2" role="listbox" aria-label="Choose a character" style={{ maxWidth: 480 }}>
      <ListRow variant="selectable" selected>
        <span className="type-body">Brother Aldric Venn · Cleric 4</span>
      </ListRow>
      <ListRow variant="selectable">
        <span className="type-body">Sable Wren · Rogue 3</span>
      </ListRow>
      <ListRow variant="selectable" disabled>
        <span className="type-body">Hollin Brask · Fighter 5 (retired)</span>
      </ListRow>
    </div>
  );
}
