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

export const QUEST_KINDS: [string, string][] = [
  ['standard', 'Standard'],
  ['oneshot', 'One-shot'],
  ['series', 'Series'],
  ['social', 'Social'],
  ['beginner', 'Beginner'],
];

export { CODEX_CATEGORY_VALUES as CODEX_AUTHORING_CATEGORIES } from '../../utils/codexCategories.js';
