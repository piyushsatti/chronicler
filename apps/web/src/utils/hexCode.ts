/**
 * Map hex numbers (Mortal bard's hexflower brief): region letters, C (centre)
 * or R (ring), then ring digit and three-digit index, e.g. LFC1001, LFR7008.
 * The API checks the same shape in `product_feature_hex.go` and also that a
 * map hex with that number exists.
 */
export const HEX_CODE_PATTERN = /^[A-Z]{2}[CR][0-9]{4}$/;

/** Codex category whose entries sit on one map hex. */
export const FEATURE_CATEGORY = 'Feature';

/** A map hex holds at most this many Feature entries (enforced by the API). */
export const MAX_FEATURES_PER_HEX = 4;

export function normalizeHexCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isHexCode(value: unknown): boolean {
  return HEX_CODE_PATTERN.test(normalizeHexCode(value));
}
