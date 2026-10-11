import type { EditorMeta, FieldSchema } from './types.js';

const QUEST_KINDS = ['standard', 'oneshot', 'series', 'social', 'beginner'];

export const QUEST_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    placeholder: 'Quest title',
    normalize: (v) => (v || '').replace(/\s+/g, ' ').trim(),
  },
  {
    key: 'shortCode',
    label: 'Code',
    type: 'code',
    placeholder: 'Assigned on publish',
    readOnly: true,
  },
  {
    key: 'kinds',
    label: 'Kind',
    type: 'multiselect',
    required: true,
    options: QUEST_KINDS,
    validate: (v) =>
      !Array.isArray(v) || v.length === 0 ? 'Pick at least one kind' : null,
  },
  {
    key: 'regions',
    label: 'Regions',
    type: 'regionmulti',
    required: true,
    hint: 'region ids',
    validate: (v) =>
      !Array.isArray(v) || v.length === 0 ? 'Pick at least one region' : null,
  },
  {
    key: 'apl',
    label: 'APL',
    type: 'text',
    placeholder: 'e.g. 7',
    hint: 'average party level, optional',
    validate: (v) => {
      if (!v || typeof v !== 'string') return null;
      return /^\d+$/.test(v.trim()) ? null : 'Whole number only';
    },
  },
  {
    key: 'durationHours',
    label: 'Duration (hours)',
    type: 'text',
    required: true,
    placeholder: 'e.g. 3',
    validate: (v) => {
      if (!v || typeof v !== 'string') return 'Required';
      const n = Number(v.trim());
      return Number.isFinite(n) && n > 0 ? null : 'Must be a positive number';
    },
  },
  {
    key: 'slotsMax',
    label: 'Party slots (max)',
    type: 'text',
    required: true,
    placeholder: '4',
  },
  {
    key: 'scheduledAt',
    label: 'Session (ISO)',
    type: 'text',
    required: true,
    hint: 'UTC instant',
  },
  {
    key: 'signupType',
    label: 'Signup type',
    type: 'select',
    required: true,
    options: [
      ['dm_pick', 'DM Pick'],
      ['last_played', 'Last Played'],
    ],
  },
  {
    key: 'genres',
    label: 'Genres',
    type: 'genretags',
    hint: 'chip tags; free type + suggestions',
  },
  {
    key: 'tags',
    label: 'Tags',
    type: 'tags',
    validate: (v) =>
      Array.isArray(v) && v.length > 8 ? 'Keep to 8 tags or fewer' : null,
  },
  {
    key: 'additionalInfo',
    label: 'Additional info',
    type: 'textarea',
    placeholder: 'Extra authoring notes…',
  },
];

export const CODEX_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
  },
  {
    key: 'slug',
    label: 'Slug',
    type: 'code',
    readOnly: true,
  },
  {
    key: 'category',
    label: 'Category',
    type: 'text',
    readOnly: true,
  },
];

export const GUIDE_SCHEMA: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'slug', label: 'Slug', type: 'code', readOnly: true },
];

export const RULING_SCHEMA: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'slug', label: 'Slug', type: 'code', readOnly: true },
];

export const SUMMARY_SCHEMA: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'slug', label: 'Slug', type: 'code', readOnly: true },
];

export const DM_TABLE_SCHEMA: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'slug', label: 'Slug', type: 'code', readOnly: true },
];

export function schemaForType(
  typeKey: string,
  meta: EditorMeta,
): FieldSchema[] {
  switch (typeKey) {
    case 'quest':
      return QUEST_SCHEMA;
    case 'codex':
      return CODEX_SCHEMA;
    case 'guide':
      return GUIDE_SCHEMA;
    case 'ruling':
      return RULING_SCHEMA;
    case 'summary':
      return SUMMARY_SCHEMA;
    case 'dm-table':
      return DM_TABLE_SCHEMA;
    default:
      return [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          placeholder: String(meta.title ?? ''),
        },
      ];
  }
}
