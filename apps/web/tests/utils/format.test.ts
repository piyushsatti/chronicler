import { describe, expect, it } from 'vitest';
import {
  civilDateInZone,
  formatInstant,
  formatScheduled,
  formatScheduledShort,
  humanizeKey,
  labelFor,
  nextCivilDay,
  pluralize,
  statusLabel,
  roleLabel,
  weekdayLabel,
  weekdayList,
  clockLabel,
  verificationLabel,
  monthLabel,
  longDateLabel,
  weekdayColumn,
  personName,
  personLabels,
  handleLabel,
  isMachineId,
} from '../../src/utils/format.js';
describe('timestamp presentation', () => {
  it('drops the year for compact schedule chips and keeps TBA for absent dates', () => {
    expect(formatScheduledShort('2026-10-20T19:00:00Z', 'UTC')).toBe('Tue 20 Oct \u00b7 19:00 UTC');
    expect(formatScheduledShort('2026-10-20T19:00:00Z', 'Europe/Paris')).toBe('Tue 20 Oct \u00b7 21:00');
    expect(formatScheduled('2026-10-20T19:00:00Z', 'Europe/Paris')).toBe('Tue 20 Oct 2026, 21:00');
    expect(formatScheduledShort(null)).toBe('TBA');
    expect(formatScheduledShort('2099-01-01T00:00:00Z')).toBe('TBA');
  });
  it('uses selected zones across midnight and accepts equivalent explicit offsets', () => {
    expect(formatInstant('2026-03-08T04:30:00Z', 'America/New_York', 'date')).toBe(
      '7 Mar 2026',
    );
    expect(formatInstant('2026-03-08T04:30:00Z', 'Asia/Kolkata', 'date')).toBe(
      '8 Mar 2026',
    );
    expect(civilDateInZone('2026-03-08T04:30:00Z', 'America/New_York')).toBe(
      '2026-03-07',
    );
    expect(formatScheduled('2026-03-08T01:30:00-05:00', 'America/New_York')).toBe(
      formatScheduled('2026-03-08T06:30:00Z', 'America/New_York'),
    );
  });
  it('shows the DST spring gap and repeated autumn hour from actual instants', () => {
    expect(formatScheduled('2026-03-08T06:30:00Z', 'America/New_York')).toContain(
      '01:30',
    );
    expect(formatScheduled('2026-03-08T07:30:00Z', 'America/New_York')).toContain(
      '03:30',
    );
    const first = formatScheduled('2026-11-01T05:30:00Z', 'America/New_York');
    const second = formatScheduled('2026-11-01T06:30:00Z', 'America/New_York');
    expect(first).toContain('01:30');
    expect(second).toContain('01:30');
    expect(first).not.toBe(second);
  });
  it('tells a repeated wall time apart when the rollback is 30 minutes', () => {
    const first = formatScheduled('2026-04-04T14:45:00Z', 'Australia/Lord_Howe');
    const second = formatScheduled('2026-04-04T15:15:00Z', 'Australia/Lord_Howe');
    expect(first).toContain('01:45');
    expect(second).toContain('01:45');
    expect(first).not.toBe(second);
    expect(formatScheduled('2026-04-04T10:00:00Z', 'Australia/Lord_Howe')).not.toMatch(
      /[A-Z]{3,}$/,
    );
  });
  it('shows civil dates for people on their own day and never parses datetime-local as an instant', () => {
    expect(formatInstant('2026-03-08', 'America/New_York')).toBe('8 Mar 2026');
    expect(formatInstant('2026-03-08', 'Pacific/Kiritimati')).toBe('8 Mar 2026');
    expect(civilDateInZone('2026-03-08', 'Asia/Kolkata')).toBe('2026-03-08');
    expect(formatInstant('2026-03-08T01:30', 'America/New_York')).toBe('—');
    expect(civilDateInZone('2026-03-08T01:30', 'America/New_York')).toBeNull();
  });
  it('retains absent schedule labels and the device-zone default', () => {
    expect(formatScheduled(null)).toBe('TBA');
    expect(formatScheduled('invalid')).toBe('TBA');
    expect(formatInstant(undefined)).toBe('—');
    const value = '2026-03-08T04:30:00Z';
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Only a viewer who chose UTC sees the zone name; the device default never does.
    const deviceFormatted = formatScheduled(value, device).replace(/ UTC$/, '');
    expect(formatScheduled(value, null)).toBe(deviceFormatted);
    expect(formatScheduled(value)).toBe(deviceFormatted);
  });
  it('reads as "Sat 7 Mar 2026, 23:30" with no zone name unless the viewer chose UTC', () => {
    expect(formatInstant('2026-03-08T04:30:00Z', 'America/New_York')).toBe(
      'Sat 7 Mar 2026, 23:30',
    );
    expect(formatInstant('2026-11-01T23:00:00Z', 'Europe/London')).toBe(
      'Sun 1 Nov 2026, 23:00',
    );
    expect(formatInstant('2026-11-01T23:00:00Z', 'UTC')).toBe('Sun 1 Nov 2026, 23:00 UTC');
    expect(formatInstant('2026-11-01T23:00:00Z', 'Etc/UTC', 'date')).toBe('1 Nov 2026');
  });
  it('names the zone only inside the repeated autumn hour', () => {
    expect(formatScheduled('2026-11-01T05:30:00Z', 'America/New_York')).toMatch(
      /^Sun 1 Nov 2026, 01:30 \S+$/,
    );
    expect(formatScheduled('2026-11-01T12:00:00Z', 'America/New_York')).toBe(
      'Sun 1 Nov 2026, 07:00',
    );
  });
  it('advances civil days through DST, leap days and year boundaries', () => {
    expect(nextCivilDay('2026-03-08')).toBe('2026-03-09');
    expect(nextCivilDay('2026-11-01')).toBe('2026-11-02');
    expect(nextCivilDay('2028-02-28')).toBe('2028-02-29');
    expect(nextCivilDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('reader-facing labels', () => {
  it('labels the guest member role', () => {
    expect(roleLabel('guest')).toBe('Guest');
  });

  it('pluralizes counts', () => {
    expect(pluralize(1, 'result')).toBe('1 result');
    expect(pluralize(0, 'result')).toBe('0 results');
    expect(pluralize(2, 'available map')).toBe('2 available maps');
    expect(pluralize(3, 'entry', 'entries')).toBe('3 entries');
    expect(pluralize(2, 'series')).toBe('2 series');
    expect(pluralize(1, 'series')).toBe('1 series');
    expect(pluralize(2, 'Series')).toBe('2 Series');
  });
  it('reads character verification states, with anything else as not submitted', () => {
    expect(verificationLabel('PENDING')).toBe('Awaiting verification');
    expect(verificationLabel('rejected')).toBe('Changes requested');
    expect(verificationLabel('approved')).toBe('Verified');
    expect(verificationLabel('UNKNOWN')).toBe('Not submitted');
    expect(verificationLabel(null)).toBe('Not submitted');
  });
  it('turns enum and status keys into labels', () => {
    expect(humanizeKey('PENDING_APPROVAL')).toBe('Pending approval');
    expect(humanizeKey('notice')).toBe('Notice');
    expect(humanizeKey('NPC')).toBe('NPC');
    expect(humanizeKey('Feature')).toBe('Feature');
    expect(humanizeKey('SUNDAY')).toBe('Sunday');
    expect(statusLabel('open')).toBe('Open');
    expect(statusLabel('REJECTED')).toBe('Changes requested');
    expect(statusLabel('something_new')).toBe('Something new');
    expect(labelFor('dm', { dm: 'Dungeon Master' })).toBe('Dungeon Master');
  });
  it('reads weekdays as names, never as raw keys', () => {
    expect(weekdayLabel('THURSDAY')).toBe('Thursday');
    expect(weekdayLabel('sun', { plural: true })).toBe('Sundays');
    expect(weekdayList(['SUNDAY', 'monday', 'Thu'])).toBe(
      'Monday, Thursday and Sunday',
    );
    expect(clockLabel('18:30:00')).toBe('18:30');
  });
});

describe('people and identifiers', () => {
  it('shows display names, falling back to a readable handle, never a snowflake', () => {
    expect(personName({ displayName: 'Sable Vey', handle: 'sable' })).toBe('Sable Vey');
    expect(personName({ displayName: 'Sable Vey' })).toBe('Sable Vey');
    expect(personName({ displayName: 'Sable Vey', handle: '' })).toBe('Sable Vey');
    expect(personName({ displayName: 'Sable Vey', handle: null })).toBe('Sable Vey');
    expect(personName({ displayName: '  ', handle: '@sable' })).toBe('Unnamed member (@sable)');
    expect(personName({ displayName: null, handle: '100000000000000001' })).toBe(
      'Unnamed member',
    );
    expect(personName({ displayName: '100000000000000001', handle: 'parsec' })).toBe(
      'Unnamed member (@parsec)',
    );
    expect(personName(null, 'Someone')).toBe('Someone');
  });
  it('labels handles with @ and hides numeric ids', () => {
    expect(handleLabel('sable')).toBe('@sable');
    expect(handleLabel('@sable')).toBe('@sable');
    expect(handleLabel('100000000000000001')).toBeNull();
    expect(handleLabel('')).toBeNull();
  });
  it('keeps QA fixture members visible with a readable label and no retained suffix', async () => {
    const member = { displayName: 'qa-prof-1020-1792473593710 retained', handle: 'qa-prof-1020-1792473593710' };
    expect(personName(member)).toBe('Member (@qa-prof-1020-1792473593710)');
    expect(personLabels([member])).toEqual(['Member (@qa-prof-1020-1792473593710)']);
    expect(personName({ displayName: 'Retained scholar', handle: 'scholar' })).toBe('Retained scholar');
  });
  it('disambiguates generic and shared names for distinct people while preserving repeated people', () => {
    expect(personLabels([
      { id: 'one', displayName: 'dev', handle: 'one' },
      { id: 'two', displayName: 'dev', handle: 'two' },
    ])).toEqual(['dev (@one)', 'dev (@two)']);
    expect(personLabels([
      { id: 'one', displayName: 'Mira Vale', handle: 'mira' },
      { id: 'two', displayName: 'Mira Vale', handle: 'vale' },
    ])).toEqual(['Mira Vale (@mira)', 'Mira Vale (@vale)']);
    const samePerson = { id: 'one', displayName: 'Mira Vale', handle: 'mira' };
    expect(personLabels([samePerson, samePerson])).toEqual(['Mira Vale', 'Mira Vale']);
  });
  it('recognises machine identifiers', () => {
    expect(isMachineId('qa-the-salt-stair')).toBe(true);
    expect(isMachineId('100000000000000001')).toBe(true);
    expect(isMachineId('3f2b8c1e-1d2a-4f5b-9c3d-2e1f0a9b8c7d')).toBe(true);
    expect(isMachineId('The Salt Stair')).toBe(false);
    expect(isMachineId('sable')).toBe(false);
  });
});

describe('civil calendar labels', () => {
  it('names months from a month or a date, without shifting into the viewer zone', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('2026-11-01')).toBe('November 2026');
    expect(monthLabel('not-a-month')).toBe('not-a-month');
  });

  it('spells a long date with weekday and no engine-specific comma', () => {
    expect(longDateLabel('2026-10-15')).toBe('Thursday 15 October 2026');
    expect(longDateLabel('2026-11-01')).toBe('Sunday 1 November 2026');
  });

  it('places a civil date in a Monday-first week, across month starts', () => {
    expect(weekdayColumn('2026-10-12')).toBe(0); // Monday
    expect(weekdayColumn('2026-10-14')).toBe(2); // Wednesday
    // November 2026 starts on a Sunday: six blank cells precede the 1st.
    expect(weekdayColumn('2026-11-01')).toBe(6);
    expect(weekdayColumn('2026-02-01')).toBe(6);
  });
});

describe('round 4 helpers', () => {
  it('disambiguates duplicate, generic and empty names', async () => {
    expect(
      personLabels([
        { displayName: 'Sable', handle: 'sable' },
        { displayName: 'Sam', handle: 'sam1' },
        { displayName: 'Sam', handle: 'sam2' },
        { displayName: 'Member', handle: 'quiet' },
        { displayName: '', handle: '' },
      ]),
    ).toEqual(['Sable', 'Sam (@sam1)', 'Sam (@sam2)', 'Member (@quiet)', 'Unnamed member']);
    expect(personLabels([{ displayName: '', handle: 'pell' }])).toEqual([
      'Unnamed member (@pell)',
    ]);
  });

  it('hides sentinel dates', async () => {
    const { isSentinelDate, formatInstant } = await import('../../src/utils/format.js');
    expect(isSentinelDate('2099-12-31T00:00:00Z')).toBe(true);
    expect(formatInstant('2099-12-31T00:00:00Z')).toBe('—');
    expect(isSentinelDate('2026-03-07T00:00:00Z')).toBe(false);
  });

  it('lists the device option first for time zones', async () => {
    const { timeZoneOptions } = await import('../../src/utils/timeZones.js');
    const options = timeZoneOptions('Mars/Base');
    expect(options[0]).toEqual({ value: null, label: 'Use my device time zone' });
    expect(options.some((o) => o.value === 'Mars/Base')).toBe(true);
  });
});
