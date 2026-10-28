import { useCallback, useEffect, useState } from 'react';
import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query';
import { auditBody, type BodySpanAudit } from '../adapters/bodyAudit.js';
import type { BodyAudit } from '../bodyAuditCopy.js';

/** Typing pauses this long before the body is audited. */
export const BODY_AUDIT_DEBOUNCE_MS = 300;
/** A publish check waits this long for the audit, then publishes without it. */
export const BODY_AUDIT_TIMEOUT_MS = 5_000;

function auditQuery(body: string) {
  return {
    queryKey: ['editor', 'body-audit', body] as const,
    // The signal cancels a request whose body was superseded before it answered.
    queryFn: ({ signal }: { signal: AbortSignal }) => auditBody(body, signal),
    retry: false,
    staleTime: Infinity,
    gcTime: 30_000,
  };
}

/**
 * The server's audit of the body being written (`auditBody`), debounced and
 * keyed on the exact text. A failed audit shows nothing: badges and warnings
 * are help, never a gate. `latest` returns the audit of a given body, waiting
 * for one already in flight, or null when the audit fails or takes longer than
 * `timeoutMs`. A shared request cancelled because the editor moved on to a
 * newer body is asked again once, since that is not a failure.
 */
export function useBodyAudit(
  body: string,
  enabled = true,
  { timeoutMs = BODY_AUDIT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): {
  audit: BodyAudit | null;
  latest: (body: string) => Promise<BodySpanAudit[] | null>;
} {
  const [settled, setSettled] = useState(body);
  useEffect(() => {
    if (body === settled) return;
    const timer = setTimeout(() => setSettled(body), BODY_AUDIT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [body, settled]);
  const active = enabled && settled.trim() !== '';
  const query = useQuery({ ...auditQuery(settled), enabled: active });
  const queryClient = useQueryClient();
  const latest = useCallback(
    async (current: string): Promise<BodySpanAudit[] | null> => {
      if (!enabled) return null;
      if (current.trim() === '') return [];
      const options = auditQuery(current);
      let expired = false;
      const fetchAudit = async (): Promise<BodySpanAudit[]> => {
        try {
          return await queryClient.fetchQuery(options);
        } catch (error) {
          if (isCancelledError(error) && !expired) return queryClient.fetchQuery(options);
          throw error;
        }
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          void queryClient.cancelQueries({ queryKey: options.queryKey });
          resolve(null);
        }, timeoutMs);
      });
      try {
        return await Promise.race([fetchAudit(), timedOut]);
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    [enabled, queryClient, timeoutMs],
  );
  // While a newer body is audited, the previous answer stays, paired with the
  // body it describes so the editor can tell whether it still fits.
  const [shown, setShown] = useState<BodyAudit | null>(null);
  const next =
    !active || query.isError
      ? null
      : query.isSuccess
        ? shown?.body === settled && shown.spans === query.data
          ? shown
          : { body: settled, spans: query.data }
        : shown;
  if (next !== shown) setShown(next);
  return { audit: next, latest };
}
