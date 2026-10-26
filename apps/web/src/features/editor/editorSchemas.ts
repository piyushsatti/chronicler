import type { EditorMeta, EditorMode, FieldSchema } from './types.js';
import { GATED_CODEX_CATEGORY } from '../../utils/codexCategories.js';
import { CODEX_AUTHORING_CATEGORIES, QUEST_KINDS } from './editorConstants.js';
import { isEditorInstant } from './editorDateTime.js';
import { FEATURE_CATEGORY, isHexCode, normalizeHexCode } from '../../utils/hexCode.js';
import { QUEST_SIGNUP_TYPES } from '../../utils/questVocabulary.js';

const QUEST_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    placeholder: 'Quest title',
    normalize: (v) => (v || '').replace(/\s+/g, ' ').trim(),
  },
  {
    key: 'kinds',
    label: 'Kind',
    type: 'multiselect',
    required: true,
    options: QUEST_KINDS,
    defaultOption: 'standard',
    validate: (v) =>
      !Array.isArray(v) || v.length === 0
        ? 'Pick at least one kind'
        : v.some((kind) => !QUEST_KINDS.some(([key]) => key === kind))
          ? 'Choose a supported kind'
          : null,
  },
  {
    key: 'regions',
    label: 'Regions',
    type: 'regionmulti',
    required: true,
    validate: (v) =>
      !Array.isArray(v) || v.length === 0 ? 'Pick at least one region' : null,
  },
  {
    key: 'apl',
    label: 'Average party level',
    type: 'text',
    placeholder: 'e.g. 7',
    hint: 'Optional',
    validate: (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? null : 'Positive whole number only';
    },
  },
  {
    key: 'durationHours',
    label: 'Length (hours)',
    type: 'text',
    required: true,
    placeholder: 'e.g. 3',
    validate: (v) => {
      // A recovered draft may hold a number rather than the typed text.
      if (typeof v === 'number') return v > 0 ? null : 'Must be a positive number';
      if (!v || typeof v !== 'string') return 'Required';
      const n = Number(v.trim());
      return Number.isFinite(n) && n > 0 ? null : 'Must be a positive number';
    },
  },
  {
    key: 'slotsMax',
    label: 'Seats',
    type: 'text',
    required: true,
    placeholder: '4',
    validate: (v) =>
      Number.isInteger(Number(v)) && Number(v) > 0
        ? null
        : 'Must be a positive whole number',
  },
  {
    key: 'scheduledAt',
    label: 'Session',
    type: 'datetime',
    required: true,
    validate: (v) =>
      isEditorInstant(v)
        ? null
        : 'Choose a valid session time and resolve any timezone choice',
  },
  {
    key: 'signupType',
    label: 'Signup type',
    type: 'select',
    required: true,
    options: QUEST_SIGNUP_TYPES,
    validate: (v) =>
      v === 'open' || v === 'application' || v === 'invite'
        ? null
        : 'Choose a supported signup type',
  },
  {
    key: 'genres',
    label: 'Genres',
    type: 'genretags',
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
    label: 'Extra details for players',
    type: 'textarea',
    placeholder: 'Anything players should know before they sign up',
  },
];

const CODEX_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    placeholder: 'Name the entry',
  },
  {
    key: 'slug',
    label: 'Page address',
    type: 'code',
    readOnly: true,
    placeholder: 'Made from the title when saved',
  },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: [...CODEX_AUTHORING_CATEGORIES],
    validate: (v) =>
      CODEX_AUTHORING_CATEGORIES.some((category) => category === v)
        ? null
        : 'Choose a supported category',
  },
];

/** A Feature entry sits on one map hex, so its hex number is required. */
const FEATURE_HEX_FIELD: FieldSchema = {
  key: 'hex',
  label: 'Hex number',
  type: 'text',
  required: true,
  mono: true,
  placeholder: 'e.g. LFR7008',
  hint: 'The map hex this Feature sits on. A hex holds up to 4 Features.',
  normalize: normalizeHexCode,
  validate: (v) => (isHexCode(v) ? null : 'Enter a hex number like LFR7008'),
};

/** Guides, rulings, summaries and DM tables share the title and read-only slug fields. */
const TITLED_DOCUMENT_SCHEMA: FieldSchema[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: true,
    placeholder: 'Give it a title',
  },
  {
    key: 'slug',
    label: 'Page address',
    type: 'code',
    readOnly: true,
    placeholder: 'Made from the title when saved',
  },
];

/** A guide also names its group: guides with the same group are listed together on Rules. */
const GUIDE_SCHEMA: FieldSchema[] = [
  ...TITLED_DOCUMENT_SCHEMA,
  {
    key: 'category',
    label: 'Group',
    type: 'text',
    placeholder: 'For example Combat or Exploration',
    hint: 'Guides with the same group are listed together on the Rules page. Leave it blank for General.',
    validate: (v) =>
      typeof v === 'string' && v.trim().length > 60
        ? 'Use 60 characters or fewer'
        : null,
  },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A new quest may start in one of the viewer's series; existing quests change series on the quest page. */
const NEW_QUEST_SCHEMA: FieldSchema[] = [
  ...QUEST_SCHEMA.slice(0, 1),
  {
    key: 'arcId',
    label: 'Series',
    type: 'series',
    hint: 'Optional',
    validate: (v) =>
      v == null || v === '' || (typeof v === 'string' && UUID.test(v))
        ? null
        : 'Choose one of your series',
  },
  {
    key: 'pointcrawlLinks',
    label: 'Expected destinations',
    type: 'pointcrawl',
    hint: 'Optional. Mark places visited on the quest page after play.',
  },
  ...QUEST_SCHEMA.slice(1),
];

export interface SchemaAccess {
  /** Archons and admins may author Locations entries (the API also checks region assignment). */
  canAuthorLocations?: boolean;
  /** DMs and admins may author Features, which sit on a map hex (the API refuses placement for others). */
  canAuthorFeatures?: boolean;
}

/** Codex categories this viewer may not pick in the category select. */
function gatedCodexCategories(access: SchemaAccess): string[] {
  return [
    ...(access.canAuthorLocations ? [] : [GATED_CODEX_CATEGORY]),
    ...(access.canAuthorFeatures ? [] : [FEATURE_CATEGORY]),
  ];
}

export function schemaForType(
  typeKey: string,
  meta: EditorMeta,
  access: SchemaAccess = {},
  mode: EditorMode = 'edit',
): FieldSchema[] {
  switch (typeKey) {
    case 'quest':
      // The create form always offers a series; a saved quest changes series on its page.
      // Chosen by mode, not by `arcId`: drafts saved by older builds have no `arcId`.
      return mode === 'new' ? NEW_QUEST_SCHEMA : QUEST_SCHEMA;
    case 'codex': {
      const gated = gatedCodexCategories(access);
      const fields = CODEX_SCHEMA.map((field): FieldSchema => {
        if (field.key !== 'category') return field;
        // Saved entries keep their category. A gated draft opened from its scoped
        // route keeps that category for viewers who are not offered it in the select.
        if (
          typeof meta.slug === 'string' ||
          (typeof meta.category === 'string' && gated.includes(meta.category))
        )
          return {
            ...field,
            type: 'text',
            readOnly: true,
            required: false,
            validate: undefined,
          };
        // Validation keeps the full allow-list; only the offered options are trimmed.
        return gated.length === 0
          ? field
          : {
              ...field,
              options: CODEX_AUTHORING_CATEGORIES.filter(
                (category) => !gated.includes(category),
              ),
            };
      });
      return meta.category === FEATURE_CATEGORY
        ? [...fields, FEATURE_HEX_FIELD]
        : fields;
    }
    case 'guide':
      return GUIDE_SCHEMA;
    case 'ruling':
    case 'summary':
    case 'dm-table':
    case 'hall-of-fame':
      return TITLED_DOCUMENT_SCHEMA;
    default:
      return [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          placeholder: String(meta.title ?? '') || 'Give it a title',
        },
      ];
  }
}
