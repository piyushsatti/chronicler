import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadDocument } from '../adapters/documentAdapter.js';

type DocumentPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      view: Awaited<ReturnType<typeof loadDocument>>;
    };

export function useDocumentPage(slug: string): DocumentPageView {
  const q = useQuery({
    queryKey: queryKeys.document(slug),
    queryFn: () => loadDocument(slug),
    enabled: Boolean(slug),
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'document:page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
