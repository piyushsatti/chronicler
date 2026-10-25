/** Where "back" leads from an editor, named for its destination (see editorCancelPath). */
export const EDITOR_BACK_LABELS = {
  quest: 'Back to quests',
  codex: 'Back to the Codex',
  summary: 'Back to chronicles',
  guide: 'Back to rules',
  ruling: 'Back to rules',
  'dm-table': 'Back to DMs',
  demo: 'Back to home',
} as const;

export const WORLD_SEASONS = ['Frost', 'Thaw', 'Growth', 'Reaping'] as const;

export const QUEST_STATUSES: [string, string][] = [
  ['Open', 'var(--color-text-2)'],
  ['Filling', 'var(--color-accent)'],
  ['Full', 'var(--color-text)'],
  ['Scheduled', 'var(--color-warn)'],
  ['Live', 'var(--color-danger)'],
  ['Soft close', 'var(--color-warn)'],
  ['Closed', 'var(--color-text-3)'],
];

export const TAG_SUGGESTIONS = [
  'investigation',
  'bridge',
  'mystery',
  'harbor',
  'politics',
  'combat',
  'social',
  'beginner',
  'arc',
  'merchant',
];

/** Quest kind vocabulary: matches the API boundary and the `quests_kinds_vocab` DB check. */
export const QUEST_KINDS: [string, string][] = [
  ['standard', 'Standard'],
  ['one_shot', 'One-shot'],
  ['mini_campaign', 'Mini-campaign'],
  ['hexcrawl', 'Hexcrawl'],
  ['event', 'Event'],
  ['lieutenant', 'Lieutenant'],
];

export { CODEX_CATEGORY_VALUES as CODEX_AUTHORING_CATEGORIES } from '../../utils/codexCategories.js';

/** `debugId` of the error shown when the API refuses a quest because its DM
 * profile is not approved; the editor pairs it with a link to the profile. */
export const QUEST_DM_APPROVAL_ERROR = 'editor:quest:dm-approval';
