/**
 * What a write needs from the fence (useFencedMutation): the token the fence
 * checked, the key it keeps for this member and payload (D52), and an optional
 * abort signal.
 */
export type CommandAuth = {
  token: string;
  idempotencyKey: string;
  signal?: AbortSignal;
};

/** GraphQL `meta` and request init for one fenced write. */
export function commandRequest(cmd: CommandAuth): {
  meta: { idempotencyKey: string };
  init: RequestInit;
} {
  return {
    meta: { idempotencyKey: cmd.idempotencyKey },
    init: { headers: { Authorization: `Bearer ${cmd.token}` }, signal: cmd.signal },
  };
}
