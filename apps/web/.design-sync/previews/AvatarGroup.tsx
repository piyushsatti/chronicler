import { Avatar, AvatarGroup } from '@pi/chronicler-ds';

export function Party() {
  return (
    <AvatarGroup aria-label="Party roster">
      <Avatar name="Kael Storm" size="sm" />
      <Avatar name="Mira Ashvale" size="sm" />
      <Avatar name="Thane Rook" size="sm" />
      <Avatar name="Selene Vey" size="sm" />
    </AvatarGroup>
  );
}

export function Overflow() {
  return (
    <AvatarGroup aria-label="Session attendees" max={4}>
      <Avatar name="Kael Storm" size="sm" />
      <Avatar name="Mira Ashvale" size="sm" />
      <Avatar name="Thane Rook" size="sm" />
      <Avatar name="Selene Vey" size="sm" />
      <Avatar name="Brannoc" size="sm" />
      <Avatar name="Ysolde" size="sm" />
      <Avatar name="Galen Thorne" size="sm" />
    </AvatarGroup>
  );
}

export function OpenSeats() {
  return (
    <div className="row" data-gap="3" data-align="center">
      <AvatarGroup aria-label="Quest signups">
        <Avatar name="Orrin Vale" size="sm" ring="accent" />
        <Avatar name="Mira Ashvale" size="sm" />
        <Avatar name="Ysolde" size="sm" you />
        <Avatar size="sm" empty />
        <Avatar size="sm" empty />
      </AvatarGroup>
      <span className="type-caption">3 of 5 seats filled</span>
    </div>
  );
}
