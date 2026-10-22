import { describe, expect, it } from 'vitest';
import {
  civilDateInZone,
  formatInstant,
  formatScheduled,
  humanizeKey,
  labelFor,
  nextCivilDay,
  pluralize,
  statusLabel,
  weekdayLabel,
  weekdayList,
  clockLabel,
  verificationLabel,
  monthLabel,
  longDateLabel,
  weekdayColumn,
} from '../../src/utils/format.js';
describe('timestamp presentation', () => {
  it('uses selected zones across midnight and accepts equivalent explicit offsets', () => {
    expect(formatInstant('2026-03-08T04:30:00Z', 'America/New_York', 'date')).toBe(
      '07 Mar 2026',
    );
    expect(formatInstant('2026-03-08T04:30:00Z', 'Asia/Kolkata', 'date')).toBe(
      '08 Mar 2026',
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
  it('shows civil dates for people on their own day and never parses datetime-local as an instant', () => {
    expect(formatInstant('2026-03-08', 'America/New_York')).toBe('08 Mar 2026');
    expect(formatInstant('2026-03-08', 'Pacific/Kiritimati')).toBe('08 Mar 2026');
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
    expect(formatScheduled(value, null)).toBe(formatScheduled(value, device));
    expect(formatScheduled(value)).toBe(formatScheduled(value, device));
  });
  it('advances civil days through DST, leap days and year boundaries', () => {
    expect(nextCivilDay('2026-03-08')).toBe('2026-03-09');
    expect(nextCivilDay('2026-11-01')).toBe('2026-11-02');
    expect(nextCivilDay('2028-02-28')).toBe('2028-02-29');
    expect(nextCivilDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('reader-facing labels', () => {
  it('pluralizes counts', () => {
    expect(pluralize(1, 'result')).toBe('1 result');
    expect(pluralize(0, 'result')).toBe('0 results');
    expect(pluralize(2, 'available map')).toBe('2 available maps');
    expect(pluralize(3, 'entry', 'entries')).toBe('3 entries');
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
