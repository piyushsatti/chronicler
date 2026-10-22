import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCodexEntry } from '../adapters/codexAdapter.js';

type CodexEntryPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      view: Awaited<ReturnType<typeof loadCodexEntry>>;
    };

export function useCodexEntryPage(slug: string): CodexEntryPageView {
  const q = useQuery({
    queryKey: queryKeys.codexEntry(slug),
    queryFn: () => loadCodexEntry(slug),
    enabled: Boolean(slug),
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'codex:entry') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
