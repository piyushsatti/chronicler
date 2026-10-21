import { Avatar } from '@pi/chronicler-ds';

export function Sizes() {
  return (
    <div className="row" data-gap="4" data-align="center">
      <Avatar name="Kael Storm" size="xs" />
      <Avatar name="Kael Storm" size="sm" />
      <Avatar name="Kael Storm" size="md" />
      <Avatar name="Kael Storm" size="lg" />
      <Avatar name="Kael Storm" size="token" />
    </div>
  );
}

export function Rings() {
  return (
    <div className="row" data-gap="4" data-align="center">
      <Avatar name="Mira Ashvale" size="md" />
      <Avatar name="DM Orrin" size="md" ring="accent" />
      <Avatar name="Thane Rook" size="md" ring="role" />
      <Avatar name="Selene Vey" size="md" ring="selected" />
    </div>
  );
}

export function Presence() {
  return (
    <div className="row" data-gap="4" data-align="center">
      <Avatar name="Brannoc" size="md" online />
      <Avatar name="Ysolde" size="md" you />
      <Avatar size="md" empty />
      <Avatar name="Galen Thorne" size="md" framed />
    </div>
  );
}

export function WithName() {
  return (
    <div className="stack" data-gap="3">
      <div className="row" data-gap="3" data-align="center">
        <Avatar name="Orrin Vale" size="md" ring="accent" online />
        <div className="stack" data-gap="1">
          <span className="type-title">Orrin Vale</span>
          <span className="type-caption">Dungeon Master · The Salt Stair</span>
        </div>
      </div>
      <div className="row" data-gap="3" data-align="center">
        <Avatar name="Mira Ashvale" size="md" />
        <div className="stack" data-gap="1">
          <span className="type-title">Mira Ashvale</span>
          <span className="type-caption">Level 6 Ranger · Hollow Highlands</span>
        </div>
      </div>
    </div>
  );
}
