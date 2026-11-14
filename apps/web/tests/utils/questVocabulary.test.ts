import { describe, expect, it } from 'vitest';
import {
  QUEST_PARTICIPANT_STATUSES,
  QUEST_SIGNUP_TYPES,
  hasActiveSignup,
  hasSeat,
  isSeatedOnDetailPage,
  isUpcomingSignup,
  signupTypeLabel,
} from '../../src/utils/questVocabulary.js';

describe('quest signup types', () => {
  it('offers exactly Last Game Played and DM pick', () => {
    expect(QUEST_SIGNUP_TYPES).toEqual([
      ['last_game_played', 'Last Game Played'],
      ['dm_pick', 'DM pick'],
    ]);
    expect(signupTypeLabel('last_game_played')).toBe('Last Game Played');
    expect(signupTypeLabel('dm_pick')).toBe('DM pick');
  });
});

describe('quest participant status predicates', () => {
  it.each(
    QUEST_PARTICIPANT_STATUSES.map((status) => ({
      status,
      seat: status === 'signed_up' || status === 'played',
      active: status === 'signed_up' || status === 'waitlisted',
      detail: status !== 'waitlisted' && status !== 'withdrawn',
      upcoming: status !== 'withdrawn' && status !== 'no_show',
    })),
  )(
    '$status → seat=$seat active=$active detail=$detail upcoming=$upcoming',
    ({ status, seat, active, detail, upcoming }) => {
      expect(hasSeat(status)).toBe(seat);
      expect(hasActiveSignup(status)).toBe(active);
      expect(isSeatedOnDetailPage(status)).toBe(detail);
      expect(isUpcomingSignup(status)).toBe(upcoming);
    },
  );
});
