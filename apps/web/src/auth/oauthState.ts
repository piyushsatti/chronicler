/** OAuth Authorization Code Grant: correlate one same-tab, bounded-age initiation. */
export const OAUTH_STATE_KEY = 'chronicler_oauth_state';

const MAX_STATE_AGE_MS = 10 * 60 * 1000;
const STATE_PATTERN = /^[0-9a-f]{64}$/;

type PendingState = {
  state: string;
  createdAt: number;
};

export function beginOAuthState(): string | null {
  try {
    // Starting again invalidates an earlier authorization attempt in this tab.
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
    const pending: PendingState = { state, createdAt: Date.now() };
    const serialized = JSON.stringify(pending);
    sessionStorage.setItem(OAUTH_STATE_KEY, serialized);
    if (sessionStorage.getItem(OAUTH_STATE_KEY) !== serialized) return null;
    return state;
  } catch {
    return null;
  }
}

export function discardOAuthState(): void {
  try {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
  } catch {
    // No authorization request is made when initiation fails.
  }
}

/** Consume before validating: a callback can never retry the same pending nonce. */
export function consumeOAuthState(candidate: string | null): boolean {
  try {
    const raw = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    if (!candidate || !STATE_PATTERN.test(candidate) || raw === null) return false;
    const pending: unknown = JSON.parse(raw);
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return false;
    const entry = pending as Partial<PendingState>;
    if (
      entry.state !== candidate ||
      typeof entry.createdAt !== 'number' ||
      !Number.isFinite(entry.createdAt)
    )
      return false;
    const age = Date.now() - entry.createdAt;
    return age >= 0 && age < MAX_STATE_AGE_MS;
  } catch {
    return false;
  }
}
