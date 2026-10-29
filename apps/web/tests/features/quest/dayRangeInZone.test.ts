import { describe, expect, it } from 'vitest';
import { dayRangeInZone } from '../../../src/utils/format.js';

describe('dayRangeInZone', () => {
  it('spans the local day: first instant through the last millisecond', () => {
    expect(dayRangeInZone('2026-10-25', 'America/New_York')).toEqual({
      scheduledFrom: '2026-10-25T04:00:00Z',
      scheduledTo: '2026-10-26T03:59:59.999Z',
    });
    // DST ends 1 Nov 2026 in New York: that local day is 25 hours long.
    expect(dayRangeInZone('2026-11-01', 'America/New_York')).toEqual({
      scheduledFrom: '2026-11-01T04:00:00Z',
      scheduledTo: '2026-11-02T04:59:59.999Z',
    });
    expect(dayRangeInZone('2026-03-02', 'UTC')).toEqual({
      scheduledFrom: '2026-03-02T00:00:00Z',
      scheduledTo: '2026-03-02T23:59:59.999Z',
    });
  });

  it('rejects malformed or impossible dates', () => {
    expect(dayRangeInZone('', 'UTC')).toBeNull();
    expect(dayRangeInZone('25/10/2026', 'UTC')).toBeNull();
    expect(dayRangeInZone('2026-02-31', 'UTC')).toBeNull();
  });
});
