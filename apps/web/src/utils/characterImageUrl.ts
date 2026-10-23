// UX-only copy: the API (validateCharacterImageURL) is authoritative; packages/contracts/fixtures/url-rules.v1.json guards drift.
export const IMAGE_URL_MAX = 2048;

/**
 * Mirrors the API's `validateCharacterImageURL` and the `characters_image_url_check`
 * constraint: a literal `https://` prefix, at most 2048 characters, no whitespace or
 * control characters, a host, and no credentials. Backslashes and bad percent escapes
 * are refused because browsers repair them where Go's parser rejects them.
 */
export function isCharacterImageUrl(value: string): boolean {
  if (!value.startsWith('https://') || [...value].length > IMAGE_URL_MAX) return false;
  if (/[\s\p{Cc}\\]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return false;
  const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0] ?? '';
  if (!authority || authority.includes('@')) return false;
  try {
    return new URL(value).hostname !== '';
  } catch {
    return false;
  }
}

/** Optional field: empty is valid and means "no image". */
export function imageUrlError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || isCharacterImageUrl(trimmed)) return undefined;
  return `Use an https:// image link of at most ${IMAGE_URL_MAX.toLocaleString('en-US')} characters, like https://example.com/portrait.png`;
}
