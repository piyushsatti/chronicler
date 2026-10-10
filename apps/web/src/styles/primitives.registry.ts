/** Canonical UI primitives. Extend here before inventing a second Button. */
export const PRIMITIVES = [
  'PageShell',
  'StatePanel',
  'Field',
  'StatChip',
  'DocumentCard',
  'QuestCard',
  'MapHexPanel',
  'FeatureListPanel',
] as const;

export type PrimitiveName = (typeof PRIMITIVES)[number];
