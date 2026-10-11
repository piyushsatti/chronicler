import { describe, expect, it } from 'vitest';
import {
  parseAdminChars,
  parseAdminMembers,
  parseAdminOps,
  parseCharPending,
  parseDmQueue,
} from '../../../src/features/admin/adapters/adminAdapter.js';
import goodChars from '../../fixtures/wire/admin/chars-good.json';
import goodPending from '../../fixtures/wire/admin/char-pending-good.json';
import goodDm from '../../fixtures/wire/admin/dm-queue-good.json';
import badMembers from '../../fixtures/wire/admin/members-bad.json';
import goodMembers from '../../fixtures/wire/admin/members-good.json';
import badOps from '../../fixtures/wire/admin/ops-bad.json';
import goodOps from '../../fixtures/wire/admin/ops-good.json';

describe('admin adapters', () => {
  it('parses operations', () => {
    const result = parseAdminOps(goodOps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.activeAlertCount).toBe(1);
  });

  it('rejects bad operations', () => {
    expect(parseAdminOps(badOps).ok).toBe(false);
  });

  it('parses character directory', () => {
    const result = parseAdminChars(goodChars);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.shortCode).toBe('C-101');
  });

  it('parses members directory', () => {
    const result = parseAdminMembers(goodMembers);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.handle).toBe('mira');
  });

  it('rejects bad members directory', () => {
    const result = parseAdminMembers(badMembers);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });

  it('parses verify queues', () => {
    expect(parseDmQueue(goodDm).ok).toBe(true);
    expect(parseCharPending(goodPending).ok).toBe(true);
  });
});
