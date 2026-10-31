/**
 * The Codex categories the API accepts (`validateDocumentCategory`,
 * apps/api/internal/document/product_validation.go), in display order, with the
 * plural heading used for groups. Every web list of Codex categories derives
 * from this one constant. Values are the stored category strings.
 */
export const CODEX_CATEGORIES = [
  { value: 'Artifact', heading: 'Artifacts' },
  { value: 'Event', heading: 'Events' },
  { value: 'Lore', heading: 'Lore' },
  { value: 'NPC', heading: 'NPCs' },
  { value: 'Faction', heading: 'Factions' },
  { value: 'Locations', heading: 'Locations' },
  { value: 'Entities', heading: 'Entities' },
  { value: 'Feature', heading: 'Features' },
] as const;

export type CodexCategory = (typeof CODEX_CATEGORIES)[number]['value'];

export const CODEX_CATEGORY_VALUES: readonly CodexCategory[] = CODEX_CATEGORIES.map(
  (category) => category.value,
);

/**
 * Locations is region-linked and the API admits it only for archons and admins
 * (`locationFailures`, policy.go); every other category is open to any author.
 */
export const GATED_CODEX_CATEGORY: CodexCategory = 'Locations';

/** Case-insensitive lookup, for legacy rows and route params. */
export function findCodexCategory(
  value: string | null | undefined,
): CodexCategory | undefined {
  const needle = value?.toLowerCase();
  return needle
    ? CODEX_CATEGORY_VALUES.find((category) => category.toLowerCase() === needle)
    : undefined;
}

export function codexCategoryHeading(category: string): string {
  return (
    CODEX_CATEGORIES.find((entry) => entry.value === category)?.heading ?? category
  );
}
