import { SegmentedControl } from '@pi/chronicler-ds';

export function RosterFilter() {
  return (
    <SegmentedControl
      aria-label="Roster status"
      defaultValue="active"
      options={[
        { value: 'active', label: 'Approved' },
        { value: '', label: 'All' },
      ]}
    />
  );
}

export function Sizes() {
  const options = [
    { value: 'open', label: 'Open' },
    { value: 'full', label: 'Full' },
    { value: 'played', label: 'Played' },
  ];
  return (
    <div className="stack" data-gap="3">
      <SegmentedControl aria-label="Quest status (small)" size="sm" defaultValue="open" options={options} />
      <SegmentedControl aria-label="Quest status (medium)" size="md" defaultValue="open" options={options} />
    </div>
  );
}

export function DisabledOption() {
  return (
    <SegmentedControl
      aria-label="Calendar view"
      defaultValue="month"
      options={[
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'season', label: 'Season', disabled: true },
      ]}
    />
  );
}
