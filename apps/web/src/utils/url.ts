/** Safe internal path check for post-login redirects. */

export function isSafeInternalPath(path: string): boolean {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.includes('\\')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/** Absolute http(s) URL only — blocks javascript:, data:, etc. */
export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** D&D Beyond character sheet links only (legacy CharacterVerifyTab). */
export function isSafeDdbUrl(url: string | null | undefined): url is string {
  if (!isSafeUrl(url)) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'dndbeyond.com' || hostname.endsWith('.dndbeyond.com');
  } catch {
    return false;
  }
}
