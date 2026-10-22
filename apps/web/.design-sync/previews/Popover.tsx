import { Popover } from '@pi/chronicler-ds';

const noop = () => undefined;

export function SeatRules() {
  return (
    <Popover
      open
      onOpenChange={noop}
      ariaLabel="Seat rules"
      trigger={<span className="type-caption">Why is this seat locked?</span>}
    >
      <p className="type-label">Waitlist priority</p>
      <p className="type-body">
        Seats open to the waitlist in join order. Players with a character below level 3 wait
        for the next beginner table.
      </p>
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
