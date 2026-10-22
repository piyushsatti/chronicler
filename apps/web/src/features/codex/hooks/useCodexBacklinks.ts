import { useQueries } from '@tanstack/react-query';
import {
  loadCodexBacklinkDocument,
  type CodexBacklinkView,
} from '../adapters/codexAdapter.js';

export type CodexBacklinkRow =
  | { status: 'loading'; key: string }
  | { status: 'hidden'; key: string }
  | { status: 'ready'; key: string; relation: string; view: CodexBacklinkView };

/** Titles for the documents that link to an entry; unreadable ones drop out. */
export function useCodexBacklinks(
  links: { documentId: string; relation: string }[],
): CodexBacklinkRow[] {
  const queries = useQueries({
    queries: links.map((link) => ({
      queryKey: ['codexBacklinkDocument', link.documentId],
      queryFn: () => loadCodexBacklinkDocument(link.documentId),
      retry: false,
    })),
  });
  return links.map((link, index) => {
    const key = `${link.documentId}:${link.relation}`;
    const query = queries[index];
    if (query?.isError) return { status: 'hidden', key };
    if (!query || query.isPending) return { status: 'loading', key };
    if (!query.data) return { status: 'hidden', key };
    return { status: 'ready', key, relation: link.relation, view: query.data };
  });
}
