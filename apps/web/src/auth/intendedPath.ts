import { isSafeInternalPath } from '../utils/url.js';

export const AUTH_REDIRECT_KEY = 'chronicler_auth_redirect';

const MAX_STASH_AGE_MS = 10 * 60 * 1000;

type StashedRedirect = {
  path: string;
  storedAt: number;
};

export function storeIntendedPath(path: string): void {
  if (typeof window === 'undefined') return;
  if (!isSafeInternalPath(path)) return;
  const entry: StashedRedirect = { path, storedAt: Date.now() };
  sessionStorage.setItem(AUTH_REDIRECT_KEY, JSON.stringify(entry));
}

export function consumeIntendedPath(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(AUTH_REDIRECT_KEY);
  sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  if (raw === null) return null;

  let entry: StashedRedirect;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as StashedRedirect).path !== 'string' ||
      typeof (parsed as StashedRedirect).storedAt !== 'number'
    ) {
      return null;
    }
    entry = parsed as StashedRedirect;
  } catch {
    return null;
  }

  if (Date.now() - entry.storedAt > MAX_STASH_AGE_MS) return null;
  return isSafeInternalPath(entry.path) ? entry.path : null;
}
