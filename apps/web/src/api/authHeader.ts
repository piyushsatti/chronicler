import { TOKEN_KEY } from '../auth/storage.js';

export function bearerHeaders(extra?: Record<string, string>): Record<string, string> {
  let token: string | null = null;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      token = globalThis.localStorage.getItem(TOKEN_KEY);
    }
  } catch {
    token = null;
  }
  return {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}
