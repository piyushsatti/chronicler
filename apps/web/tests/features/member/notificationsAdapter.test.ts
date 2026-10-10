import { describe, expect, it } from 'vitest';
import {
  parseNotifications,
  parseUnreadCount,
} from '../../../src/features/member/adapters/notificationsAdapter.js';
import bad from '../../fixtures/wire/notifications/list-bad.json';
import good from '../../fixtures/wire/notifications/list-good.json';
import unread from '../../fixtures/wire/notifications/unread-good.json';

describe('notifications adapters', () => {
  it('parses list', () => {
    const result = parseNotifications(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.label).toBe('Quest signup');
      expect(result.data[0]?.unread).toBe(true);
    }
  });

  it('rejects bad list', () => {
    expect(parseNotifications(bad).ok).toBe(false);
  });

  it('parses unread count', () => {
    const result = parseUnreadCount(unread);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(2);
  });
});
