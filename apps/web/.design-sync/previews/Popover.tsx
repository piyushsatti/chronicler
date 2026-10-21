import { ListRow, Popover, RegionLabel } from '@pi/chronicler-ds';

const noop = () => undefined;

export function RegionMenu() {
  return (
    <Popover
      open
      onOpenChange={noop}
      variant="menu"
      ariaLabel="Add region"
      trigger={<span>+ Add region…</span>}
    >
      <ListRow variant="clickable" onClick={noop}>
        <RegionLabel region="Dunnshore" />
      </ListRow>
      <ListRow variant="clickable" onClick={noop}>
        <RegionLabel region="Hollow Highlands" />
      </ListRow>
      <ListRow variant="clickable" onClick={noop}>
        <RegionLabel region="Esparithen" />
      </ListRow>
      <ListRow variant="clickable" onClick={noop}>
        <RegionLabel region="Viceroc" />
      </ListRow>
    </Popover>
  );
}

export function SessionDetails() {
  return (
    <Popover
      open
      onOpenChange={noop}
      ariaLabel="Session details"
      trigger={<span>Session 14 · Sat 19:00</span>}
    >
      <p className="type-title">The Drowned Bell of Dunnshore</p>
      <p className="type-body">DM Mirelle Ashdown · 4 of 5 seats filled</p>
      <p className="type-caption">Meet at the Saltwick tavern table. Bring level 5 characters.</p>
    </Popover>
  );
}
