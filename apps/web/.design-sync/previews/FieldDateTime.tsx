import { FieldDateTime, DateTimePicker } from '@pi/chronicler-ds';

export function NativeInput() {
  return (
    <div style={{ width: 300 }}>
      <FieldDateTime label="Session start" value="2026-10-17T19:00" />
    </div>
  );
}

export function WithPicker() {
  return (
    <div style={{ width: 300 }}>
      <FieldDateTime label="When">
        <DateTimePicker value="2026-10-15T18:00" ariaLabel="Quest start" />
      </FieldDateTime>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 300 }}>
      <FieldDateTime label="Signups close" />
    </div>
  );
}
