import { Listbox } from '@pi/chronicler-ds';

const classes = [
  { value: 'fighter', label: 'Fighter' },
  { value: 'wizard', label: 'Wizard' },
  { value: 'rogue', label: 'Rogue' },
  { value: 'cleric', label: 'Cleric' },
];

export function Selected() {
  return (
    <div style={{ width: 240 }}>
      <Listbox aria-label="Character class" defaultValue="wizard" options={classes} />
    </div>
  );
}

export function DisabledOptions() {
  return (
    <div style={{ width: 280 }}>
      <Listbox
        aria-label="Session slot"
        defaultValue="sat-evening"
        options={[
          { value: 'fri-evening', label: 'Fri 16 Oct · 19:00 (full)', disabled: true },
          { value: 'sat-afternoon', label: 'Sat 17 Oct · 14:00' },
          { value: 'sat-evening', label: 'Sat 17 Oct · 19:00' },
          { value: 'sun-morning', label: 'Sun 18 Oct · 10:00 (cancelled)', disabled: true },
        ]}
      />
    </div>
  );
}

export function Sizes() {
  return (
    <div className="row" data-gap="4" data-align="start">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="stack" data-gap="2" style={{ width: 180 }}>
          <span className="type-label">{size}</span>
          <Listbox
            aria-label={`Chronicle visibility (${size})`}
            size={size}
            defaultValue="party"
            options={[
              { value: 'public', label: 'Public' },
              { value: 'party', label: 'Party only' },
              { value: 'dm', label: 'DM only' },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
