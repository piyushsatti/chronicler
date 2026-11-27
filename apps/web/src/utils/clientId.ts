/**
 * A fresh id for client-only identity: toast ids, draft row keys, focus
 * targets. Never send it to the API as an idempotency key; command keys come
 * from useFencedMutation, which keeps them per member (D52).
 */
export function newClientId(): string {
  return crypto.randomUUID();
}
