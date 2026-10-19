import { describe, expect, it } from 'vitest';
import { parseMemberProfile } from '../../../src/features/profile/adapters/memberProfileAdapter.js';
import goodProfile from '../../fixtures/wire/profile/member-profile-good.json';
import badProfile from '../../fixtures/wire/profile/member-profile-bad.json';

describe('parseMemberProfile', () => {
  it('parses memberProfile wire', () => {
    const result = parseMemberProfile(goodProfile);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.member.handle).toBe('brune');
      expect(result.data.activitySummary.messages).toBe(40);
      expect(result.data.availability).toHaveLength(1);
      expect(result.data.dmProfile).toBeNull();
    }
  });

  it('rejects incomplete wire', () => {
    const result = parseMemberProfile(badProfile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
