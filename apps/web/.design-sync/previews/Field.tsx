import { Field } from '@pi/chronicler-ds';

export function TextInput() {
  return (
    <div style={{ width: 320 }}>
      <Field label="Series name">
        <input defaultValue="The Ember Road" maxLength={200} />
      </Field>
    </div>
  );
}

export function WithError() {
  return (
    <div style={{ width: 320 }}>
      <Field label="Quest title" error="A quest title is required before publishing.">
        <input defaultValue="" placeholder="e.g. Ashes of Highmoor" />
      </Field>
    </div>
  );
}

export function Select() {
  return (
    <div style={{ width: 320 }}>
      <Field label="Quest status">
        <select defaultValue="open">
          <option value="">All statuses</option>
          <option value="open">open</option>
          <option value="full">full</option>
          <option value="played">played</option>
          <option value="cancelled">cancelled</option>
        </select>
      </Field>
    </div>
  );
}

export function Textarea() {
  return (
    <div style={{ width: 360 }}>
      <Field label="Session recap">
        <textarea
          rows={4}
          defaultValue="The party reached the drowned bell tower at dusk and bargained with the ferryman for passage."
        />
      </Field>
    </div>
  );
}

export function FormStack() {
  return (
    <div className="stack" data-gap="4" style={{ width: 320 }}>
      <Field label="Character name">
        <input defaultValue="Mirelle Vane" />
      </Field>
      <Field label="Level" error="Level must be between 1 and 20.">
        <input type="number" defaultValue={24} />
      </Field>
    </div>
  );
}
