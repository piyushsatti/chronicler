/** Time zone choices for a Picker (D-tz). `value: null` means "use the device zone". */
export type TimeZoneOption = { value: string | null; label: string };

const FALLBACK_ZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const DEVICE_TIME_ZONE_LABEL = 'Use my device time zone';

/** IANA zone ids, sorted; falls back to a short list on engines without `Intl.supportedValuesOf`. */
export function ianaTimeZones(): readonly string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : FALLBACK_ZONES;
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}

/** "America/Toronto" reads "America / Toronto"; underscores become spaces. */
export function timeZoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ').replace(/\//g, ' / ');
}

/** Options with "Use my device time zone" first. Pass `current` so a saved zone missing from the engine list still shows. */
export function timeZoneOptions(current?: string | null): TimeZoneOption[] {
  const zones = [...ianaTimeZones()];
  if (current && !zones.includes(current)) zones.push(current);
  return [
    { value: null, label: DEVICE_TIME_ZONE_LABEL },
    ...zones.map((zone) => ({ value: zone, label: timeZoneLabel(zone) })),
  ];
}
