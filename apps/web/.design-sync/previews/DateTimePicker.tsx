import { DateTimePicker } from '@pi/chronicler-ds';

export function WithValue() {
  return (
    <div className="stack" data-gap="2" style={{ width: 280 }}>
      <DateTimePicker value="2026-10-24T18:30" ariaLabel="Session start" className="field-input" />
      <span className="type-caption">Timezone: Europe/London</span>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 280 }}>
      <DateTimePicker ariaLabel="Signups close" className="field-input" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="stack" data-gap="2" style={{ width: 280 }}>
      <DateTimePicker value="2026-10-10T19:00" ariaLabel="Played session" className="field-input" disabled />
      <span className="type-caption">Locked after the session was played.</span>
    </div>
  );
}
