import { describe, expect, it } from 'vitest';
import {
  CODEX_CATEGORY_VALUES,
  codexCategoryHeading,
  findCodexCategory,
} from '../../src/utils/codexCategories.js';
import { CODE_CATEGORIES } from '../../src/features/codex/types.js';
import { CODEX_AUTHORING_CATEGORIES } from '../../src/features/editor/editorConstants.js';

describe('Codex categories', () => {
  it('matches the API allow-list and feeds every web list', () => {
    expect([...CODEX_CATEGORY_VALUES].sort()).toEqual(
      [
        'Artifact',
        'Entities',
        'Event',
        'Faction',
        'Feature',
        'Locations',
        'Lore',
        'NPC',
      ].sort(),
    );
    expect(CODE_CATEGORIES).toBe(CODEX_CATEGORY_VALUES);
    expect(CODEX_AUTHORING_CATEGORIES).toBe(CODEX_CATEGORY_VALUES);
  });

  it('labels group headings by the stored values', () => {
    expect(codexCategoryHeading('Feature')).toBe('Features');
    expect(codexCategoryHeading('Entities')).toBe('Entities');
    expect(codexCategoryHeading('Locations')).toBe('Locations');
    expect(codexCategoryHeading('NPC')).toBe('NPCs');
    expect(codexCategoryHeading('Rules')).toBe('Rules');
  });

  it('finds legacy lower-case values without guessing others', () => {
    expect(findCodexCategory('npc')).toBe('NPC');
    expect(findCodexCategory('feature')).toBe('Feature');
    expect(findCodexCategory('rules')).toBeUndefined();
    expect(findCodexCategory('')).toBeUndefined();
  });
});
