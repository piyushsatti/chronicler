import { Chip, MasterDetail } from '@pi/chronicler-ds';

type Character = { id: string; name: string; klass: string; level: number; player: string; bio: string };

const characters: Character[] = [
  { id: 'aldric', name: 'Aldric Venn', klass: 'Cleric of the Lantern', level: 4, player: 'Morwen', bio: 'A lamplighter turned priest who keeps the abbey vigil on the longest nights.' },
  { id: 'sable', name: 'Sable Wren', klass: 'Rogue', level: 3, player: 'Teodor', bio: 'Grew up running contraband up the Salt Stair; owes the harbour guild a favour.' },
  { id: 'hollin', name: 'Hollin Brask', klass: 'Fighter', level: 5, player: 'Ilse', bio: 'Former caravan guard, the only survivor of the first Ashen Road ambush.' },
];

function Detail(item: Character | null) {
  if (!item) return <p className="type-caption">Select a character to see their sheet.</p>;
  return (
    <div className="stack" data-gap="2" style={{ padding: 'var(--sp-4)' }}>
      <div className="row" data-gap="2" data-align="center">
        <p className="type-heading" style={{ flex: 1 }}>{item.name}</p>
        <Chip tone="status">Level {item.level}</Chip>
      </div>
      <p className="type-caption">{item.klass} · Played by {item.player}</p>
      <p className="type-body">{item.bio}</p>
    </div>
  );
}

export function CharacterRoster() {
  return (
    <MasterDetail
      items={characters}
      itemKey={(c: Character) => c.id}
      selectedKey="aldric"
      renderItem={(c: Character) => c.name}
      renderDetail={Detail}
    />
  );
}

export function SecondSelected() {
  return (
    <MasterDetail
      items={characters}
      itemKey={(c: Character) => c.id}
      selectedKey="hollin"
      renderItem={(c: Character) => c.name}
      renderDetail={Detail}
    />
  );
}
