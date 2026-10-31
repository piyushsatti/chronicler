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
