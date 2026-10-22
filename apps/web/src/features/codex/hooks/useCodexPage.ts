import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCodexDirectory,
  type CodexCategoryView,
  type CodexEntryView,
} from '../adapters/codexAdapter.js';

type CodexPageData = (
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: CodexEntryView[] }
) & {
  categories: CodexCategoryView[];
  total: number | null;
  hasMore: boolean;
  isFetching: boolean;
  loadMore: () => void;
};

export function useCodexPage(categoryPrefix: string, search = ''): CodexPageData {
  const q = useInfiniteQuery({
    queryKey: [...queryKeys.codexDirectory(categoryPrefix), search.trim()],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      loadCodexDirectory({
        categoryPrefix: categoryPrefix || undefined,
        search: search.trim() || undefined,
        limit: 50,
        offset: pageParam,
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
  const entries = q.data?.pages.flatMap((page) => page.items) ?? [];
  const shared = {
    categories: q.data?.pages[0]?.categories ?? [],
    total: q.data?.pages[0]?.total ?? null,
    hasMore: q.hasNextPage,
    isFetching: q.isFetching,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetching) void q.fetchNextPage();
    },
  };
  if (q.isError)
    return { status: 'error', error: toAppError(q.error, 'codex:page'), ...shared };
  if (q.isPending) return { status: 'loading', ...shared };
  if (entries.length === 0) return { status: 'empty', ...shared };
  return { status: 'ready', view: entries, ...shared };
}
