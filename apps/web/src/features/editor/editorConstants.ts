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

export const TZ_OPTIONS = [
  'IST (India)',
  'CET/CEST',
  'GMT/UTC',
  'EST/EDT',
  'PST/PDT',
  'AEST/AEDT',
] as const;

export const EDITOR_TIME_ZONES: Record<string, string> = {
  'IST (India)': 'Asia/Kolkata',
  'CET/CEST': 'Europe/Paris',
  'GMT/UTC': 'UTC',
  'EST/EDT': 'America/New_York',
  'PST/PDT': 'America/Los_Angeles',
  'AEST/AEDT': 'Australia/Sydney',
  IST: 'Asia/Kolkata',
  CET: 'Europe/Paris',
  GMT: 'UTC',
  EST: 'America/New_York',
  PST: 'America/Los_Angeles',
  AEST: 'Australia/Sydney',
};

export const QUEST_KINDS: [string, string][] = [
  ['standard', 'Standard'],
  ['event', 'Event'],
  ['lieutenant', 'Lieutenant'],
  ['hexcrawl', 'Hexcrawl'],
  ['one_shot', 'One-shot'],
  ['mini_campaign', 'Mini-campaign'],
];
