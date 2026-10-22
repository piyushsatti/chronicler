import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCodexEntrySlug } from '../adapters/codexAdapter.js';

type CodexEntryAliasPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; slug: string };

export function useCodexEntryAliasPage(id: string): CodexEntryAliasPageView {
  const query = useQuery({
    queryKey: ['codexEntryById', id],
    queryFn: () => loadCodexEntrySlug(id),
  });
  if (query.isError) {
    return { status: 'error', error: toAppError(query.error, 'codex:entry-alias') };
  }
  if (query.isPending || !query.data) return { status: 'loading' };
  return { status: 'ready', slug: query.data };
}
