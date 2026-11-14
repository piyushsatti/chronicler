/** Quest kind vocabulary: matches the API boundary and the `quests_kinds_vocab` DB check. */
export const QUEST_KINDS: [string, string][] = [
  ['standard', 'Standard'],
  ['one_shot', 'One-shot'],
  ['mini_campaign', 'Mini-campaign'],
  ['hexcrawl', 'Hexcrawl'],
  ['event', 'Event'],
  ['lieutenant', 'Lieutenant'],
];

/** How players join a quest (`quests.signup_type`). */
export const QUEST_SIGNUP_TYPES: [string, string][] = [
  ['last_game_played', 'Last Game Played'],
  ['dm_pick', 'DM pick'],
];

/** Participant statuses allowed by `quest_participants_status_check`. */
export const QUEST_PARTICIPANT_STATUSES = [
  'signed_up',
  'waitlisted',
  'withdrawn',
  'played',
  'no_show',
] as const;

function labelFrom(vocabulary: [string, string][], value: string): string {
  return vocabulary.find(([key]) => key === value)?.[1] ?? value;
}

/** Display label for a quest kind; unknown kinds show as sent. */
export function questKindLabel(kind: string): string {
  return labelFrom(QUEST_KINDS, kind);
}

/** Display label for a signup type; unknown types show as sent. */
export function signupTypeLabel(signupType: string): string {
  return labelFrom(QUEST_SIGNUP_TYPES, signupType);
}

/** Occupies a seat on quest cards: signed up now, or played after the game. */
export function hasSeat(status: string): boolean {
  return status === 'signed_up' || status === 'played';
}

/** Holds an active signup the member can withdraw: seated or waitlisted. */
export function hasActiveSignup(status: string): boolean {
  return status === 'signed_up' || status === 'waitlisted';
}

/** Shown among seated players on the quest detail page (includes no_show). */
export function isSeatedOnDetailPage(status: string): boolean {
  return status !== 'waitlisted' && status !== 'withdrawn';
}

/** Listed as an upcoming signup on the Me hub (includes waitlisted). */
export function isUpcomingSignup(status: string): boolean {
  return status !== 'withdrawn' && status !== 'no_show';
}
