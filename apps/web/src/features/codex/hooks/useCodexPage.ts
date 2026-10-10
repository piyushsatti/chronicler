import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCodexDirectory, type CodexEntryView } from '../adapters/codexAdapter.js';

export type CodexPageData =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: CodexEntryView[] };

export function useCodexPage(categoryPrefix: string): CodexPageData {
  const q = useQuery({
    queryKey: queryKeys.codexDirectory(categoryPrefix),
    queryFn: () =>
      loadCodexDirectory({
        categoryPrefix: categoryPrefix || undefined,
      }),
  });

  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'codex:page') };
  }
  if (q.isLoading || q.data === undefined) {
    return { status: 'loading' };
  }
  if (q.data.length === 0) {
    return { status: 'empty' };
  }
  return { status: 'ready', view: q.data };
}
