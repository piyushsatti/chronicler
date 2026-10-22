import { expect, it } from 'vitest';
import { schemaForType } from '../../../src/features/editor/editorSchemas.js';
import {
  parseQuestMetadata,
  schemaErrors,
} from '../../../src/features/editor/editorValidation.js';
const categoryField = (meta: Record<string, unknown>, canAuthorLocations = false) =>
  schemaForType('codex', { title: 'Story', ...meta }, { canAuthorLocations }).find(
    (field) => field.key === 'category',
  );

it('requires one of the API-accepted Codex categories for creation', () => {
  for (const category of ['Lore', 'Entities', 'Feature']) {
    expect(
      schemaErrors(schemaForType('codex', { title: 'Story' }), {
        title: 'Story',
        category,
      }),
    ).toEqual({});
  }
  expect(
    schemaErrors(schemaForType('codex', { title: 'Story' }), {
      title: 'Story',
      category: 'Rules',
    }),
  ).toHaveProperty('category');
});

it('offers Entities and Feature to every author and Locations only to archons and admins', () => {
  expect(categoryField({})?.options).toEqual([
    'Artifact',
    'Event',
    'Lore',
    'NPC',
    'Faction',
    'Entities',
    'Feature',
  ]);
  expect(categoryField({}, true)?.options).toEqual([
    'Artifact',
    'Event',
    'Lore',
    'NPC',
    'Faction',
    'Locations',
    'Entities',
    'Feature',
  ]);
  // An archon who picks Locations can still change their mind.
  const picked = categoryField({ category: 'Locations' }, true);
  expect(picked?.readOnly).toBeFalsy();
  expect(picked?.type).toBe('select');
});
it('preserves imported and uncategorized entries during editing', () => {
  const imported = { title: 'Imported', slug: 'imported', category: 'Entities' };
  expect(
    schemaForType('codex', imported).find((field) => field.key === 'category')
      ?.readOnly,
  ).toBe(true);
  expect(schemaErrors(schemaForType('codex', imported), imported)).toEqual({});
  const uncategorized = { title: 'Imported', slug: 'imported', category: null };
  expect(schemaErrors(schemaForType('codex', uncategorized), uncategorized)).toEqual(
    {},
  );
});

it('keeps Locations creation on its explicitly selected scoped route', () => {
  const scoped = { title: 'Location', category: 'Locations' };
  const field = schemaForType('codex', scoped).find(
    (field) => field.key === 'category',
  );
  expect(field?.readOnly).toBe(true);
  expect(schemaErrors(schemaForType('codex', scoped), scoped)).toEqual({});
});

it.each(['2026-03-08T02:30', '2026-11-01T01:30', '', '2026-02-30T12:00:00Z'])(
  'rejects unresolved or invalid session metadata %s at both form and command boundaries',
  (scheduledAt) => {
    const meta = {
      title: 'Quest',
      scheduledAt,
      durationHours: '3',
      slotsMax: '4',
      kinds: ['standard'],
      regions: ['region'],
      genres: [],
      tags: [],
      signupType: 'open',
    };
    expect(schemaErrors(schemaForType('quest', meta), meta)).toHaveProperty(
      'scheduledAt',
    );
    expect(parseQuestMetadata(meta).success).toBe(false);
  },
);
