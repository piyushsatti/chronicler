import { describe, expect, it } from 'vitest';
import { parseHomeLanesWire } from '../../../src/features/home/adapters/homeLanesAdapter.js';
import good from '../../fixtures/wire/home/lanes-good.json';
import bad from '../../fixtures/wire/home/lanes-bad-board.json';

describe('homeLanesAdapter', () => {
  it('parses recruiting, upcoming, closed, and DMs from wire', () => {
    const result = parseHomeLanesWire(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recruiting[0]?.title).toBe('Siege of Kraghold');
    expect(result.data.dmsAccepting[0]?.handle).toBe('mira');
  });

  it('rejects bad quest board wire', () => {
    const result = parseHomeLanesWire(bad);
    expect(result.ok).toBe(false);
  });
});
