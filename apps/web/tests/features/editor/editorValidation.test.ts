import { describe, expect, it } from 'vitest';
import { errorNeedsReload } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { safeAppError, toAppError } from '../../../src/errors/toAppError.js';
import { TransportError } from '../../../src/errors/types.js';
import { schemaForType } from '../../../src/features/editor/editorSchemas.js';
import {
  parseQuestMetadata,
  schemaErrors,
} from '../../../src/features/editor/editorValidation.js';
const categoryField = (
  meta: Record<string, unknown>,
  canAuthorLocations = false,
  canAuthorFeatures = false,
) =>
  schemaForType(
    'codex',
    { title: 'Story', ...meta },
    { canAuthorLocations, canAuthorFeatures },
  ).find((field) => field.key === 'category');

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

it('offers Entities to every author, Locations to archons and admins, Feature to DMs and admins', () => {
  expect(categoryField({})?.options).toEqual([
    'Artifact',
    'Event',
    'Lore',
    'NPC',
    'Faction',
    'Entities',
  ]);
  expect(categoryField({}, false, true)?.options).toEqual([
    'Artifact',
    'Event',
    'Lore',
    'NPC',
    'Faction',
    'Entities',
    'Feature',
  ]);
  expect(categoryField({}, true, true)?.options).toEqual([
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

describe('the quest Series field', () => {
  const keys = (meta: Record<string, unknown>, mode: 'new' | 'edit') =>
    schemaForType('quest', { title: 'Quest', ...meta }, {}, mode).map(
      (field) => field.key,
    );
  it('is always on the create form, even for a draft saved without `arcId`', () => {
    expect(keys({}, 'new')).toContain('arcId');
    expect(keys({ arcId: '' }, 'new')).toContain('arcId');
  });
  it('is never on the edit form', () => {
    expect(
      keys({ arcId: '11111111-1111-4111-8111-111111111111' }, 'edit'),
    ).not.toContain('arcId');
  });
});

describe('which save errors offer the recovery copy and reload', () => {
  it('offers it for conflicts, revoked rights and stale guards only', () => {
    expect(
      errorNeedsReload(toAppError(new TransportError('CONFLICT'), 'editor:save')),
    ).toBe(true);
    expect(
      errorNeedsReload(toAppError(new TransportError('FORBIDDEN'), 'editor:save')),
    ).toBe(true);
    expect(
      errorNeedsReload(
        safeAppError(
          'Reload to check your current permissions and revision.',
          'editor:save',
        ),
      ),
    ).toBe(true);
    expect(errorNeedsReload(safeAppError('Title is required', 'editor:save'))).toBe(
      false,
    );
    expect(
      errorNeedsReload(
        safeAppError('The quest was not saved: Title too long.', 'editor:save'),
      ),
    ).toBe(false);
    expect(errorNeedsReload(toAppError(new Error('boom'), 'editor:save'))).toBe(false);
    expect(errorNeedsReload(null)).toBe(false);
  });
});
