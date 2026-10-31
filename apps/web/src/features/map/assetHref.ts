// Stored asset paths may be absolute URLs or site-relative; both resolve from the site root.
export function mapAssetHref(assetPath: string | null): string | null {
  if (!assetPath) return null;
  return /^(?:[a-z]+:|\/)/i.test(assetPath) ? assetPath : `/${assetPath}`;
}
